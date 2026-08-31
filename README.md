# SnagLink

Paste a video link, pick a quality, get a single MP4. Works with YouTube, TikTok,
Instagram, X, Facebook, Pinterest and around 1,700 other sites.

**[Live demo](https://snaglink-ejjy.onrender.com)** · Built with FastAPI, yt-dlp and ffmpeg

## Why this exists

Most video downloaders quietly hand you a 360p file. That is because YouTube and
several other platforms store high quality video and audio as separate streams, and
merging them is the part that takes real work. SnagLink does that merge, shows you
every available quality with its real file size before you commit, and keeps nothing
afterwards.

## Features

- Reads available formats without downloading anything, so you choose before you wait
- Merges separate video and audio streams into one MP4 with ffmpeg
- Live progress, stage by stage: fetching video, fetching audio, merging
- Handles vertical video correctly (quality is labelled by the short side)
- No account, no ads, no stored files: the working copy is deleted once the transfer
  completes
- Rate limiting, request timeouts and SSRF protection on the URL input

## How it works

The frontend never talks to yt-dlp directly. It drives four endpoints:

| Endpoint | Description |
|---|---|
| `POST /api/info` | Returns the available qualities for a URL. Nothing is downloaded. |
| `POST /api/download/start` | Starts a background download and merge job, returns a job ID. |
| `GET /api/download/progress/{job_id}` | Returns the current stage and percentage. |
| `GET /api/download/file/{job_id}` | Returns the finished file, then deletes the server copy. |

Downloads run as background jobs rather than a single blocking request, so a long
merge cannot time out the connection and the client can show real progress. Finished
jobs nobody collects are swept after 15 minutes.

### YouTube PO tokens

YouTube requires a proof-of-origin token to unlock anything above the lowest available
format. The token is generated locally by a Node.js server vendored at
[`vendor/bgutil-ytdlp-pot-provider/server`](vendor/bgutil-ytdlp-pot-provider/server).
The matching Python plugin installs from PyPI via `requirements.txt`; only the
token-generating server needs vendoring, since it is not published there.

That provider prefers Deno when both runtimes are present. `downloader.py` pins it to
Node by pointing the Deno lookup at a path that cannot exist, because the Deno path is
unreliable in this deployment.

## Known limitation: YouTube on cloud hosts

YouTube blocks requests from datacenter IP ranges. The deployed demo runs on Render,
which runs on AWS, so YouTube links fail there with `HTTP 429` followed by
`Sign in to confirm you're not a bot`. The 429 arrives on the very first plain webpage
request, before any token logic runs, which means the IP itself is being rejected
rather than anything about the request.

Every other supported platform works on the deployed version, and YouTube works
normally when running locally.

There is no code-level fix. The two real workarounds are a residential proxy, which is
a recurring cost, or cookies exported from a signed-in Google account, which means
putting live session credentials on a public deployment. Neither is appropriate for a
free demo, so the limitation is documented rather than worked around.

## Requirements

- Python 3.11+
- Node.js 22+
- ffmpeg on `PATH`

## Running locally

```bash
git clone https://github.com/UroojFatima-052/SnagLink.git
cd SnagLink

python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

cd vendor/bgutil-ytdlp-pot-provider/server
npm ci && npx tsc
cd ../../..

uvicorn main:app --reload
```

Open http://127.0.0.1:8000

Set `SNAGLINK_DEBUG=1` for yt-dlp's full verbose output, including PO token provider
selection. Turn it off afterwards: verbose mode logs request URLs that can contain
tokens.

## Deployment

`render.yaml` defines the Render configuration. The build downloads a static ffmpeg
binary into `./bin`, installs Python dependencies, and compiles the token server.

Start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

## Project structure

```
main.py           FastAPI app: routes, job queue, rate limiting, URL validation
downloader.py     yt-dlp wrapper: format parsing, quality labels, download and merge
static/           Frontend (no build step, no framework)
vendor/           bgutil-ytdlp-pot-provider, for YouTube PO tokens
render.yaml       Deployment configuration
```

## Notes

SnagLink is for personal use on content you have the right to save. Respect each
platform's terms of service and the rights of the people who made the video.