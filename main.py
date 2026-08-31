import concurrent.futures
import ipaddress
import os
import shutil
import socket
import tempfile
import threading
import time
import uuid
from collections import defaultdict, deque
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.background import BackgroundTask

from downloader import get_formats, download

# no public API docs for a consumer-facing app — nothing there for a normal
# user, just a map for anyone probing the API
app = FastAPI(title="Video Downloader", docs_url=None, redoc_url=None, openapi_url=None)

JOBS = {}
JOBS_LOCK = threading.Lock()
EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=8)
INFO_TIMEOUT = 60
DOWNLOAD_TIMEOUT = 240
MAX_CONCURRENT_DOWNLOADS = 6  # keep headroom in EXECUTOR for /api/info calls too
JOB_TTL = 15 * 60  # finished jobs nobody collected get swept up after this

RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 12  # requests per IP per window, per limited endpoint
_rate_buckets = defaultdict(deque)
_rate_lock = threading.Lock()


def rate_limit(request: Request):
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _rate_lock:
        bucket = _rate_buckets[ip]
        while bucket and now - bucket[0] > RATE_LIMIT_WINDOW:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT_MAX:
            raise HTTPException(429, "Too many requests. Please slow down and try again in a minute.")
        bucket.append(now)


class UrlRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    height: int


def _is_public_hostname(hostname: str) -> bool:
    """Reject hostnames that resolve to a private/internal address, so the
    server can't be used to probe the local network or cloud metadata
    endpoints. Best-effort: checked once here, not on the connection yt-dlp
    actually makes later, so it doesn't stop DNS-rebinding attacks."""
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            return False
    return True


def check_url(url: str) -> str:
    url = (url or "").strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "That doesn't look like a link.")
    if len(url) > 2000:
        raise HTTPException(400, "That link is too long.")

    hostname = urlparse(url).hostname
    if not hostname or not _is_public_hostname(hostname):
        raise HTTPException(400, "That link isn't allowed.")

    return url


def friendly_error(err: Exception) -> str:
    """Turn yt-dlp's noise into something a person can read."""
    msg = str(err).lower()

    if "private" in msg or "login" in msg or "sign in" in msg:
        return "That video is private or needs a login."
    if "unavailable" in msg or "removed" in msg or "not exist" in msg:
        return "That video isn't available anymore."
    if "unsupported url" in msg or "no video" in msg:
        return "No video found at that link."
    if "age" in msg and "restricted" in msg:
        return "That video is age-restricted."
    if "403" in msg or "forbidden" in msg:
        return "The site blocked the request. Try again in a bit."
    if "timed out" in msg or "timeout" in msg:
        return "The site took too long to respond."

    return "Couldn't read that link."


@app.post("/api/info")
def info(req: UrlRequest, _rl: None = Depends(rate_limit)):
    url = check_url(req.url)

    try:
        data = EXECUTOR.submit(get_formats, url).result(timeout=INFO_TIMEOUT)
    except concurrent.futures.TimeoutError:
        raise HTTPException(504, "The site took too long to respond. Try again.")
    except Exception as e:
        raise HTTPException(400, friendly_error(e))

    if not data.get("formats"):
        raise HTTPException(404, "No downloadable video found at that link.")

    return data


def _run_job(job_id, url, height):
    job = JOBS[job_id]
    work_dir = tempfile.mkdtemp(prefix="vid_")

    def on_progress(stage, pct):
        job["stage"] = stage
        job["pct"] = pct

    def heartbeat():
        # yt-dlp spends several seconds resolving formats and fetching a
        # PO token before its own progress hooks fire, so nudge the bar
        # forward here — otherwise it looks frozen at 0% the whole time.
        pct = 0
        while job["stage"] == "starting":
            time.sleep(1)
            if job["stage"] != "starting":
                break
            pct = min(pct + 2, 15)
            job["pct"] = pct
    threading.Thread(target=heartbeat, daemon=True).start()

    try:
        future = EXECUTOR.submit(download, url, height, work_dir, on_progress)
        path = future.result(timeout=DOWNLOAD_TIMEOUT)
        if not os.path.exists(path):
            raise RuntimeError("Something went wrong saving the file.")
        job["stage"] = "done"
        job["pct"] = 100
        job["path"] = path
        job["work_dir"] = work_dir
    except concurrent.futures.TimeoutError:
        shutil.rmtree(work_dir, ignore_errors=True)
        job["stage"] = "error"
        job["error"] = "The site took too long to respond. Try again."
    except Exception as e:
        shutil.rmtree(work_dir, ignore_errors=True)
        job["stage"] = "error"
        job["error"] = friendly_error(e)
    finally:
        job["finished_at"] = time.monotonic()


def _sweep_stale_jobs():
    """Jobs nobody ever collected (browser closed, network dropped, etc.)
    would otherwise sit in memory — and their temp files on disk — forever."""
    while True:
        time.sleep(60)
        now = time.monotonic()
        with JOBS_LOCK:
            stale = [
                jid for jid, j in JOBS.items()
                if j.get("finished_at") is not None and now - j["finished_at"] > JOB_TTL
            ]
            for jid in stale:
                job = JOBS.pop(jid, None)
                if job and job.get("work_dir"):
                    shutil.rmtree(job["work_dir"], ignore_errors=True)


threading.Thread(target=_sweep_stale_jobs, daemon=True).start()


@app.post("/api/download/start")
def start_download(req: DownloadRequest, _rl: None = Depends(rate_limit)):
    url = check_url(req.url)

    if not 100 <= req.height <= 4320:
        raise HTTPException(400, "Invalid quality.")

    with JOBS_LOCK:
        active = sum(1 for j in JOBS.values() if j["stage"] not in ("done", "error"))
        if active >= MAX_CONCURRENT_DOWNLOADS:
            raise HTTPException(429, "We're a bit busy right now — try again in a moment.")
        job_id = uuid.uuid4().hex
        JOBS[job_id] = {
            "stage": "starting", "pct": 0, "path": None, "work_dir": None,
            "error": None, "finished_at": None,
        }
    threading.Thread(target=_run_job, args=(job_id, url, req.height), daemon=True).start()
    return {"job_id": job_id}


@app.get("/api/download/progress/{job_id}")
def download_progress(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Unknown job.")
    return {"stage": job["stage"], "pct": job["pct"], "error": job["error"]}


@app.get("/api/download/file/{job_id}")
def download_file(job_id: str):
    job = JOBS.get(job_id)
    if not job or job["stage"] != "done":
        raise HTTPException(404, "File not ready.")

    JOBS.pop(job_id, None)
    return FileResponse(
        job["path"],
        media_type="video/mp4",
        filename=os.path.basename(job["path"]),
        background=BackgroundTask(shutil.rmtree, job["work_dir"], ignore_errors=True),
    )


# must stay last — this catches every route not matched above
app.mount("/", StaticFiles(directory="static", html=True), name="static")