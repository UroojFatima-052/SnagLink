import os
import tempfile

import yt_dlp

DOWNLOAD_DIR = os.path.join(tempfile.gettempdir(), "vidpull")
# bgutil-ytdlp-pot-provider prefers Deno over Node whenever both are on PATH.
# We only ship/support the Node script path, so point its Deno lookup at a
# path that can't exist — that makes the Deno provider report unavailable
# and yt-dlp falls back to the Node provider below.
JS_RUNTIMES = {"node": {}, "deno": {"path": "snaglink-deno-disabled"}}
STANDARD = [144, 240, 360, 480, 720, 1080, 1440, 2160]

# YouTube requires a "PO token" to unlock full-quality formats; without one
# it only hands back a single low-quality fallback. bgutil-ytdlp-pot-provider
# (vendored below) generates real tokens locally via a Node.js script, and
# the android client is the one that actually uses them for this.
POT_SERVER_HOME = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "vendor", "bgutil-ytdlp-pot-provider", "server",
)

# Some deploy targets (e.g. Render's native Python build) have no package
# manager access to install ffmpeg system-wide, so the build step downloads
# a static binary into ./bin instead. Use it when present, otherwise fall
# back to whatever "ffmpeg" resolves to on PATH (the normal case locally).
_LOCAL_FFMPEG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin", "ffmpeg")
FFMPEG_LOCATION = _LOCAL_FFMPEG if os.path.exists(_LOCAL_FFMPEG) else "ffmpeg"
YOUTUBE_CLIENTS = {
    "youtube": {"player_client": ["android"]},
    "youtubepot-bgutilscript": {"server_home": [POT_SERVER_HOME]},
}


def _snap(q):
    """Round an odd resolution to the nearest familiar label."""
    return min(STANDARD, key=lambda s: abs(s - q))


def _quality(f):
    """Quality is named after the SHORT side — handles vertical video."""
    w = f.get("width") or 0
    h = f.get("height") or 0
    if not w or not h:
        return h or w or 0
    return min(w, h)


def _size_mb(f, duration):
    """Real size if reported, else estimate from bitrate."""
    size = f.get("filesize") or f.get("filesize_approx")
    if size:
        return size / (1024 * 1024)

    tbr = f.get("tbr")  # total bitrate, kbit/s
    if tbr and duration:
        return (tbr * 1000 * duration) / 8 / (1024 * 1024)

    return None


def get_formats(url):
    """Read the page, return clean info + a user-friendly quality list."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "js_runtimes": JS_RUNTIMES,
        "noplaylist": True,
        "extractor_args": YOUTUBE_CLIENTS,
        "socket_timeout": 15,
    }

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    raw = info.get("formats", [])
    duration = info.get("duration")

    # audio track size — used to correct video-only estimates
    audio_mb = 0
    for f in raw:
        if (f.get("vcodec") or "none") == "none" and f.get("ext") == "m4a":
            s = _size_mb(f, duration)
            if s:
                audio_mb = max(audio_mb, s)

    def collect(strict):
        picked = {}
        for f in raw:
            vcodec = f.get("vcodec") or "none"
            acodec = f.get("acodec") or "none"

            if vcodec == "none":
                continue

            if strict:
                if f.get("ext") != "mp4":
                    continue
                if not vcodec.startswith("avc1"):
                    continue

            q = _quality(f)
            if q == 0:
                continue

            entry = {
                "quality": q,
                "height": f.get("height") or q,
                "size_mb": _size_mb(f, duration),
                "has_audio": acodec != "none",
            }

            existing = picked.get(q)
            if existing is None:
                picked[q] = entry
            elif (entry["size_mb"] or 1e9) < (existing["size_mb"] or 1e9):
                picked[q] = entry
        return picked

    # prefer mp4/h264; fall back to anything if a site offers nothing else
    picked = collect(strict=True)
    if not picked:
        picked = collect(strict=False)

    formats = []
    seen = set()
    for entry in sorted(picked.values(), key=lambda x: x["quality"], reverse=True):
        snapped = _snap(entry["quality"])
        if snapped in seen:
            continue
        seen.add(snapped)

        total = entry["size_mb"]
        if total and not entry["has_audio"]:
            total += audio_mb

        formats.append({
            "quality": snapped,
            "height": entry["height"],
            "label": f"{snapped}p" + (" HD" if snapped >= 720 else ""),
            "size_mb": round(total, 1) if total else None,
            "has_audio": entry["has_audio"],
        })

    return {
        "title": info.get("title"),
        "thumbnail": info.get("thumbnail"),
        "duration": duration,
        "site": info.get("extractor_key"),
        "formats": formats,
    }


def download(url, height, out_dir=None, progress_cb=None):
    """Download at the requested size, merging audio when needed.

    progress_cb(stage, pct), if given, is fed from yt-dlp's own hooks so
    callers can report live progress instead of only the finished file.
    """
    out_dir = out_dir or DOWNLOAD_DIR
    os.makedirs(out_dir, exist_ok=True)

    def on_progress(d):
        if not progress_cb or d.get("status") != "downloading":
            return
        info = d.get("info_dict") or {}
        is_audio_only = (info.get("vcodec") or "none") == "none"
        total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
        frac = (d.get("downloaded_bytes", 0) / total) if total else 0
        if is_audio_only:
            progress_cb("audio", 65 + frac * 30)
        else:
            progress_cb("video", frac * 65)

    def on_postprocess(d):
        if not progress_cb:
            return
        if d.get("status") == "started":
            progress_cb("merging", 96)
        elif d.get("status") == "finished":
            progress_cb("merging", 99)

    opts = {
        **({"progress_hooks": [on_progress], "postprocessor_hooks": [on_postprocess]} if progress_cb else {}),
        "format": (
            # 1. ideal: h264 mp4 video + m4a audio (YouTube)
            f"bestvideo[height<={height}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]"
            # 2. any mp4 video + any audio
            f"/bestvideo[height<={height}][ext=mp4]+bestaudio"
            # 3. any video + any audio
            f"/bestvideo[height<={height}]+bestaudio"
            # 4. pre-combined file (HLS — Pinterest, Twitter)
            f"/best[height<={height}]"
            # 5. last resort, never fails
            f"/best"
        ),
        "merge_output_format": "mp4",
        "outtmpl": os.path.join(out_dir, "%(title).80s.%(ext)s"),
        "ffmpeg_location": FFMPEG_LOCATION,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "js_runtimes": JS_RUNTIMES,
        "extractor_args": YOUTUBE_CLIENTS,
        "restrictfilenames": True,
        "socket_timeout": 15,
    }

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        path = ydl.prepare_filename(info)
        base = os.path.splitext(path)[0]
        if not os.path.exists(path) and os.path.exists(base + ".mp4"):
            path = base + ".mp4"
        return path