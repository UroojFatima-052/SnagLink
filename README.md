# SnagLink

A video downloader web app. Users paste a link, choose a quality, and receive a merged
MP4 file. Built with a FastAPI backend and yt-dlp for extraction, with a static
HTML/JS/CSS frontend.

## Features

- Supports YouTube, TikTok, Instagram, X/Twitter, Facebook, Pinterest, and other sites
  supported by yt-dlp.
- Lists available qualities before downloading anything.
- Downloads video and audio streams and merges them into a single MP4 with ffmpeg.
- No account, no persistent storage: files are deleted from the server after delivery.

## Architecture

| Endpoint | Description |
|---|---|
| `POST /api/info` | Returns the available qualities for a given URL. |
| `POST /api/download/start` | Starts a background download/merge job, returns a job ID. |
| `GET /api/download/progress/{job_id}` | Returns the current stage and progress percentage. |
| `GET /api/download/file/{job_id}` | Returns the finished file, then deletes the server-side copy. |

YouTube requires a proof-of-origin (PO) token for qualities above the lowest available
format. The token is generated locally by a Node.js server vendored at
[vendor/bgutil-ytdlp-pot-provider/server](vendor/bgutil-ytdlp-pot-provider/server). The
corresponding Python plugin is installed via the `bgutil-ytdlp-pot-provider` package in
`requirements.txt`; only the token-generating server has to be vendored, as it is not
published to PyPI.

The token provider supports both Node.js and Deno as runtimes and prefers Deno by
default when both are present. This project pins the runtime to Node.js in
`downloader.py`, since the Deno path does not function reliably in this deployment.

## Requirements

- Python 3.11+
- Node.js 22+
- ffmpeg, available on `PATH`

## Setup

```bash
python -m venv .venv
.venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

cd vendor/bgutil-ytdlp-pot-provider/server
npm ci
npx tsc
cd ../../..

uvicorn main:app --reload
```

The app is served at `http://127.0.0.1:8000`.

## Deployment

The runtime requires:

- Python dependencies installed from `requirements.txt`.
- ffmpeg available on `PATH`.
- Node.js 22+ with `vendor/bgutil-ytdlp-pot-provider/server` built (`npm ci && npx tsc`
  in that directory).

The app reads the `PORT` environment variable if set, otherwise defaults to 8000.

Start command:

```
uvicorn main:app --host 0.0.0.0 --port $PORT
```

`render.yaml` in the repository root defines this configuration for deployment on
Render.
