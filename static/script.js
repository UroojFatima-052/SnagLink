const $ = (id) => document.getElementById(id);

let currentUrl = "";

function showError(msg) {
  $("error").textContent = msg;
  $("error").classList.remove("hidden");
}

function clearError() {
  $("error").classList.add("hidden");
}

async function fetchInfo() {
  const url = $("url").value.trim();
  if (!url) return;

  clearError();
  $("result").classList.add("hidden");
  $("status").classList.add("hidden");
  $("fetch").disabled = true;
  $("fetch").textContent = "...";

  try {
    const res = await fetch("/api/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) throw new Error("Couldn't read that link");

    const data = await res.json();
    currentUrl = url;
    render(data);
  } catch (err) {
    showError("Couldn't read that link. Is the video public?");
  } finally {
    $("fetch").disabled = false;
    $("fetch").textContent = "Go";
  }
}

function render(data) {
  $("thumb").src = data.thumbnail || "";
  $("title").textContent = data.title || "Untitled";

  const mins = Math.floor((data.duration || 0) / 60);
  const secs = Math.floor((data.duration || 0) % 60);
  $("info").textContent = `${data.site} · ${mins}:${String(secs).padStart(2, "0")}`;

  const box = $("qualities");
  box.innerHTML = "";

  data.formats.forEach((f) => {
    const btn = document.createElement("button");
    btn.className = "quality";
    btn.innerHTML = `<span>${f.label}</span><small>${f.size_mb ? f.size_mb + " MB" : ""}</small>`;
    btn.onclick = () => startDownload(f);
    box.appendChild(btn);
  });

  $("result").classList.remove("hidden");
}

async function startDownload(fmt) {
  const status = $("status");
  status.textContent = `Preparing ${fmt.label}... this can take a minute`;
  status.classList.remove("hidden");

  document.querySelectorAll(".quality").forEach((b) => (b.disabled = true));

  try {
    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentUrl, height: fmt.height }),
    });

    if (!res.ok) throw new Error("failed");

    // pull the filename out of the response header
    const disp = res.headers.get("content-disposition") || "";
    const match = disp.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : "video.mp4";

    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);

    status.textContent = "Done — check your downloads folder";
  } catch (err) {
    status.textContent = "Download failed. Try a lower quality.";
  } finally {
    document.querySelectorAll(".quality").forEach((b) => (b.disabled = false));
  }
}

$("fetch").onclick = fetchInfo;
$("url").addEventListener("keydown", (e) => {
  if (e.key === "Enter") fetchInfo();
});