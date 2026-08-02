import yt_dlp
import os
import tempfile

DOWNLOAD_DIR = os.path.join(tempfile.gettempdir(), "vidpull")
JS_RUNTIMES = {"node": {}}


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
    }

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    raw = info.get("formats", [])
    duration = info.get("duration")

    # --- audio track size, to correct merge estimates ---
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

    # try strict mp4/h264 first; if a site gives nothing, accept anything
    picked = collect(strict=True)
    if not picked:
        picked = collect(strict=False)

    formats = []
    for entry in sorted(picked.values(), key=lambda x: x["quality"], reverse=True):
        total = entry["size_mb"]
        if total and not entry["has_audio"]:
            total += audio_mb

        formats.append({
            "quality": entry["quality"],
            "height": entry["height"],
            "label": f"{entry['quality']}p" + (" HD" if entry["quality"] >= 720 else ""),
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


def download(url, height, out_dir=None):
    """Download at the requested size, merging audio when needed."""
    out_dir = out_dir or DOWNLOAD_DIR
    os.makedirs(out_dir, exist_ok=True)

    opts = {
        "format": (
            # 1. ideal: h264 mp4 video + m4a audio (YouTube)
            f"bestvideo[height<={height}][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]"
            # 2. any mp4 video + any audio
            f"/bestvideo[height<={height}][ext=mp4]+bestaudio"
            # 3. any video + any audio
            f"/bestvideo[height<={height}]+bestaudio"
            # 4. pre-combined file at this size (HLS — Pinterest, Twitter)
            f"/best[height<={height}]"
            # 5. absolute last resort — never fails
            f"/best"
        ),
        "merge_output_format": "mp4",
        "outtmpl": os.path.join(out_dir, "%(title).80s.%(ext)s"),
        "quiet": False,
        "noplaylist": True,
        "js_runtimes": JS_RUNTIMES,
        "restrictfilenames": True,
    }

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        path = ydl.prepare_filename(info)
        base = os.path.splitext(path)[0]
        if not os.path.exists(path) and os.path.exists(base + ".mp4"):
            path = base + ".mp4"
        return path