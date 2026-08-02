import os
import shutil
import tempfile

from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel
from starlette.background import BackgroundTask

from downloader import get_formats, download

app = FastAPI()


class UrlRequest(BaseModel):
    url: str


class DownloadRequest(BaseModel):
    url: str
    height: int


@app.post("/api/info")
def info(req: UrlRequest):
    return get_formats(req.url)


@app.post("/api/download")
def download_video(req: DownloadRequest):
    work_dir = tempfile.mkdtemp(prefix="vid_")
    path = download(req.url, req.height, out_dir=work_dir)

    return FileResponse(
        path,
        media_type="video/mp4",
        filename=os.path.basename(path),
        background=BackgroundTask(shutil.rmtree, work_dir, ignore_errors=True),
    )

from fastapi.staticfiles import StaticFiles

app.mount("/", StaticFiles(directory="static", html=True), name="static")