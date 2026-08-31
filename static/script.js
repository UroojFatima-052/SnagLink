const $ = (id) => document.getElementById(id);

/* ===================== hero canvas — drifting grid, mouse ripple ===================== */
(function initHeroCanvas(){
  const canvas = $('heroCanvas');
  const ctx = canvas.getContext('2d');
  let w, h, dpr = Math.min(window.devicePixelRatio || 1, 2);
  const mouse = { x: -9999, y: -9999 };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const colors = ['#FF5C5C', '#2CA89A', '#FF8686', '#8A6FD1'];
  const GAP = 46;
  let t = 0;
  let cols, rows, nodes = [];

  function buildGrid(){
    cols = Math.ceil(w / GAP) + 2;
    rows = Math.ceil(h / GAP) + 2;
    nodes = [];
    for(let i = 0; i < cols; i++) for(let j = 0; j < rows; j++){
      nodes.push({ ix:i, iy:j, x:i*GAP, y:j*GAP, phase:Math.random()*Math.PI*2, c:colors[(i+j)%colors.length] });
    }
  }

  function resize(){
    w = canvas.offsetWidth; h = canvas.offsetHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildGrid();
  }
  resize();
  window.addEventListener('resize', resize);

  const ripples = [];
  document.addEventListener('mousemove', (e)=>{
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if(x >= -50 && x <= w + 50 && y >= -50 && y <= h + 50){ mouse.x = x; mouse.y = y; }
    else { mouse.x = -9999; mouse.y = -9999; }
  });
  document.addEventListener('mouseleave', ()=>{ mouse.x = -9999; mouse.y = -9999; });
  document.addEventListener('click', (e)=>{
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if(x >= 0 && x <= w && y >= 0 && y <= h) ripples.push({x, y, born: performance.now()});
  });

  function draw(){
    t += 0.01;
    ctx.clearRect(0, 0, w, h);
    const now = performance.now();
    for(let i = ripples.length - 1; i >= 0; i--) if(now - ripples[i].born > 1400) ripples.splice(i, 1);

    for(const n of nodes){
      const dx0 = n.x - mouse.x, dy0 = n.y - mouse.y;
      const dist = Math.sqrt(dx0*dx0 + dy0*dy0);
      const push = Math.max(0, 1 - dist / 260);
      const ang = Math.atan2(dy0, dx0);
      let rx = 0, ry = 0, rpush = 0;
      for(const r of ripples){
        const age = (now - r.born) / 1400;
        const radius = age * 340;
        const ddx = n.x - r.x, ddy = n.y - r.y;
        const d = Math.sqrt(ddx*ddx + ddy*ddy);
        const band = Math.max(0, 1 - Math.abs(d - radius) / 60) * (1 - age);
        if(band > rpush) rpush = band;
        const a2 = Math.atan2(ddy, ddx);
        rx += Math.cos(a2) * band * 26; ry += Math.sin(a2) * band * 26;
      }
      n.cx = n.x + Math.cos(t + n.phase) * 5 + Math.cos(ang) * push * 34 + rx * 0.6;
      n.cy = n.y + Math.sin(t*1.1 + n.phase) * 5 + Math.sin(ang) * push * 34 + ry * 0.6;
      n.push = Math.min(1, push + rpush);
    }

    ctx.lineWidth = 1;
    for(let i = 0; i < nodes.length; i++){
      const a = nodes[i];
      if(a.ix < cols - 1){
        const b = nodes[i + rows];
        if(b){ const s = 0.05 + Math.max(a.push, b.push) * 0.24; ctx.strokeStyle = `rgba(255,92,92,${s})`; ctx.beginPath(); ctx.moveTo(a.cx,a.cy); ctx.lineTo(b.cx,b.cy); ctx.stroke(); }
      }
      if(a.iy < rows - 1){
        const b = nodes[i + 1];
        if(b){ const s = 0.05 + Math.max(a.push, b.push) * 0.24; ctx.strokeStyle = `rgba(44,168,154,${s})`; ctx.beginPath(); ctx.moveTo(a.cx,a.cy); ctx.lineTo(b.cx,b.cy); ctx.stroke(); }
      }
      if(a.ix < cols - 1 && a.iy < rows - 1){
        const b = nodes[i + rows + 1];
        if(b){ const s = 0.025 + Math.max(a.push, b.push) * 0.16; ctx.strokeStyle = `rgba(255,134,134,${s})`; ctx.beginPath(); ctx.moveTo(a.cx,a.cy); ctx.lineTo(b.cx,b.cy); ctx.stroke(); }
      }
      if(a.ix < cols - 1 && a.iy > 0){
        const b = nodes[i + rows - 1];
        if(b){ const s = 0.025 + Math.max(a.push, b.push) * 0.16; ctx.strokeStyle = `rgba(138,111,209,${s})`; ctx.beginPath(); ctx.moveTo(a.cx,a.cy); ctx.lineTo(b.cx,b.cy); ctx.stroke(); }
      }
    }
    for(const n of nodes){
      const size = 1.1 + n.push * 2.6;
      ctx.beginPath(); ctx.arc(n.cx, n.cy, size, 0, Math.PI*2);
      ctx.fillStyle = n.c; ctx.globalAlpha = 0.22 + n.push * 0.5; ctx.fill();
      if(n.push > 0.3){
        ctx.beginPath(); ctx.arc(n.cx, n.cy, size*3.2, 0, Math.PI*2);
        ctx.fillStyle = n.c; ctx.globalAlpha = n.push * 0.08; ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if(!reduceMotion) requestAnimationFrame(draw);
  }
  draw();
})();

/* ===================== how it works — heading letters + auto-cycling steps ===================== */
const STEPS = [
  { n:'01', title:'Paste the link', desc:'Drop any video URL into the box above.', grad:'linear-gradient(135deg,#FF5C5C,#ffb0b0)', color:'#FF5C5C' },
  { n:'02', title:'We peek, not download', desc:'We read every available quality straight from the source. Nothing is saved yet.', grad:'linear-gradient(135deg,#F5A623,#ffd47a)', color:'#F5A623' },
  { n:'03', title:'Pick your quality', desc:'Choose a resolution and file size from the list.', grad:'linear-gradient(135deg,#2CA89A,#8fe0d4)', color:'#2CA89A' },
  { n:'04', title:'We merge and stream', desc:'Video and audio are merged into one MP4 and streamed to you. The working copy is deleted right after.', grad:'linear-gradient(135deg,#8A6FD1,#c9b8ee)', color:'#8A6FD1' },
];

(function initHow(){
  const heading = $('howHeading');
  'How it works'.split('').forEach((ch, i)=>{
    const span = document.createElement('span');
    span.textContent = ch === ' ' ? ' ' : ch;
    span.style.animationDelay = `${i * 0.04}s`;
    heading.appendChild(span);
  });

  const grid = $('stepsGrid');
  const nodes = STEPS.map((s)=>{
    const el = document.createElement('div');
    el.className = 'step';
    el.innerHTML = `
      <div class="step-node" style="background:${s.grad};--step-color:${s.color}"><span>${s.n}</span></div>
      <div class="step-title">${s.title}</div>
      <div class="step-desc">${s.desc}</div>`;
    grid.appendChild(el);
    return el;
  });
  const line = $('howLine');

  let active = 0;
  function render(){
    nodes.forEach((el, i)=> el.classList.toggle('active', i === active));
    nodes.forEach((el, i)=> el.querySelector('.step-node').classList.toggle('active', i === active));
    line.style.strokeDashoffset = active === 0 ? 75 : 75 - (active / (STEPS.length - 1)) * 75;
  }
  render();
  setInterval(()=>{ active = (active + 1) % STEPS.length; render(); }, 1400);
})();

/* ===================== platforms — 6 cards, 2 rows, auto-rotating highlight ===================== */
const SVG_YOUTUBE = `<svg viewBox="0 0 24 24"><path d="M23.5 6.2s-.23-1.64-.94-2.36c-.9-.94-1.9-.95-2.36-1C16.9 2.5 12 2.5 12 2.5h-.01s-4.89 0-8.19.34c-.46.05-1.47.06-2.36 1C.73 4.56.5 6.2.5 6.2S.25 8.13.25 10.07v1.86c0 1.94.25 3.87.25 3.87s.23 1.64.94 2.36c.9.94 2.08.91 2.6 1.01 1.89.18 8 .24 8 .24s4.89-.01 8.19-.35c.46-.05 1.47-.06 2.36-1 .71-.72.94-2.36.94-2.36s.25-1.93.25-3.87v-1.86c0-1.94-.25-3.87-.25-3.87zM9.75 14.85V7.15L16.25 11l-6.5 3.85z" fill="#FF3B3B"/></svg>`;
const SVG_TIKTOK = `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#010101"/><path d="M16.5 8.3c-1.1-.7-1.8-1.9-1.9-3.3h-2.4v10.6c0 1.3-1 2.3-2.3 2.3-1.3 0-2.3-1-2.3-2.3 0-1.3 1-2.3 2.3-2.3.2 0 .5 0 .7.1V10.9c-.2 0-.5 0-.7 0-2.7 0-4.8 2.2-4.8 4.8s2.2 4.8 4.8 4.8 4.8-2.2 4.8-4.8V9.9c.9.7 2 1.1 3.2 1.1V8.6c-.5 0-1-.1-1.4-.3z" fill="#fff"/></svg>`;
const SVG_INSTAGRAM = `<svg viewBox="0 0 24 24"><defs><linearGradient id="igGrad" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="#FEDA75"/><stop offset="35%" stop-color="#FA7E1E"/><stop offset="65%" stop-color="#D62976"/><stop offset="100%" stop-color="#962FBF"/></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#igGrad)"/><rect x="6" y="6" width="12" height="12" rx="4" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="16.2" cy="7.8" r="1" fill="#fff"/></svg>`;
const SVG_X = `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#F0F0F0"/><path d="M6.5 5h3.3l3.05 4.2L16.2 5h1.9l-4.7 6.05L18.4 19h-3.3l-3.35-4.6L7.4 19H5.5l5-6.45L6.5 5z" fill="#1C1C1E"/></svg>`;
const SVG_FACEBOOK = `<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#1877F2"/><path d="M14.5 8.5h1.8V6.1c-.3 0-1.4-.1-2.6-.1-2.6 0-4.4 1.6-4.4 4.5v2.1H6.7v2.7h2.6V21h2.8v-5.7h2.5l.4-2.7h-2.9v-1.8c0-.8.2-1.3 1.4-1.3z" fill="#fff"/></svg>`;
const SVG_PINTEREST = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#E60023"/><path d="M12.3 4.6c-4.3 0-6.5 3.08-6.5 5.65 0 1.56.59 2.94 1.86 3.46.21.08.39 0 .45-.23l.19-.75c.06-.23.03-.31-.13-.51-.37-.44-.6-1.01-.6-1.82 0-2.34 1.75-4.44 4.56-4.44 2.49 0 3.86 1.52 3.86 3.55 0 2.67-1.18 4.92-2.94 4.92-.97 0-1.69-.8-1.46-1.79.28-1.18.82-2.45.82-3.3 0-.76-.41-1.4-1.25-1.4-.99 0-1.79 1.02-1.79 2.39 0 .87.29 1.46.29 1.46s-1 4.2-1.17 4.94c-.35 1.47-.05 3.27-.03 3.45.02.11.15.14.21.06.09-.12 1.24-1.54 1.63-2.97.11-.4.63-2.46.63-2.46.31.59 1.22 1.11 2.18 1.11 2.87 0 4.96-2.64 4.96-5.92 0-3.14-2.56-5.94-6.57-5.94z" fill="#fff"/></svg>`;

const PLATFORM_CARDS = [
  { name:'YouTube', color:'#FF3B3B', svg:SVG_YOUTUBE, desc:'Any public video, up to 1080p.' },
  { name:'TikTok', color:'#25F4EE', svg:SVG_TIKTOK, desc:'Grab clips before they vanish from your For You page.' },
  { name:'Instagram', color:'#D62976', svg:SVG_INSTAGRAM, desc:'Reels, posts, and stories, with the sound intact.' },
  { name:'X / Twitter', color:'#F0F0F0', svg:SVG_X, desc:'Grab clips straight out of the timeline, sound included.' },
  { name:'Facebook', color:'#1877F2', svg:SVG_FACEBOOK, desc:'Public videos and Reels, no login required.' },
  { name:'Pinterest', color:'#E60023', svg:SVG_PINTEREST, desc:'Save video pins before they scroll away forever.' },
];

(function initPlatforms(){
  // plain text line under the hero
  const heroRow = $('heroPlatforms');
  heroRow.innerHTML = PLATFORM_CARDS.map(p => p.name).join(' &middot; ') + ' &middot; <span class="hp-hl">+ 1,700 more</span>';

  // 6 cards, 2 rows, auto-rotating highlight
  const grid = $('platGrid');
  const cards = PLATFORM_CARDS.map((p, i)=>{
    const el = document.createElement('div');
    el.className = 'plat-card';
    el.innerHTML = `
      <div class="plat-icon">${p.svg}</div>
      <div class="plat-name">${p.name}</div>
      <div class="plat-desc">${p.desc}</div>
      <div class="plat-bar"><i style="background:${p.color}"></i></div>`;
    el.addEventListener('click', ()=> select(i, true));
    grid.appendChild(el);
    return el;
  });

  let active = 0, paused = false;
  function select(i, userPaused){
    active = i;
    if(userPaused) paused = true;
    cards.forEach((el, idx)=>{
      const isActive = idx === active;
      el.classList.toggle('active', isActive);
      el.querySelector('.plat-bar i').style.width = isActive ? '100%' : '0%';
    });
  }
  select(0, false);
  setInterval(()=>{ if(!paused) select((active + 1) % PLATFORM_CARDS.length, false); }, 2200);
})();

/* ===================== FAQ ===================== */
const FAQS = [
  { q:'Do I need an account?', a:'Nope. Paste a link and go. SnagLink is free, with no sign-up, ever.' },
  { q:'Do you store my videos?', a:'No. The merged MP4 streams straight to your browser and is deleted from our server the instant the transfer completes.' },
  { q:'Which platforms are supported?', a:'YouTube, TikTok, Instagram, Facebook, X/Twitter, Pinterest, Reddit, Vimeo, Twitch, and 1,700+ other sites. The exceptions are private, login-gated posts, and DRM-locked platforms like Netflix or Spotify.' },
  { q:'Why does it show qualities before downloading?', a:'We read the video’s available formats first, so you can pick a resolution before we download or merge anything.' },
  { q:'Is this legal to use?', a:'SnagLink is meant for personal use on content you have the right to save. Please respect creators’ rights and each platform’s terms.' },
  { q:'Why does merging take a moment?', a:'Video and audio usually arrive as separate files, so we combine them into a single MP4 on the fly before sending it to you.' },
];

(function initFaq(){
  const list = $('faqList');
  FAQS.forEach((item)=>{
    const el = document.createElement('div');
    el.className = 'faq-item';
    el.innerHTML = `
      <div class="faq-q"><span>${item.q}</span><span class="faq-plus">+</span></div>
      <div class="faq-a">${item.a}</div>`;
    el.addEventListener('click', ()=> el.classList.toggle('open'));
    list.appendChild(el);
  });
})();

/* ===================== Snag Deck — real API wiring ===================== */
const RING_COLOR_BY_QUALITY = (q) => q >= 1080 ? '#FF5C5C' : q >= 720 ? '#2CA89A' : q >= 480 ? '#8A6FD1' : '#FF8686';
const CIRCUMFERENCE = 94;

const panels = {
  idle: $('panelIdle'),
  choose: $('panelChoose'),
  downloading: $('panelDownloading'),
  done: $('panelDone'),
};
function showPanel(name){
  Object.entries(panels).forEach(([k, el])=> el.classList.toggle('show', k === name));
}

const deckStatus = $('deckStatus');
const urlInput = $('urlInput');
const fetchBtn = $('fetchBtn');
const saveBtn = $('saveBtn');
const donePanel = $('donePanel');
const doneTitle = $('doneTitle');
const fetchLabel = $('fetchLabel');
const deckError = $('deckError');
const deckHint = $('deckHint');
const reelLeft = $('reelLeft');
const reelRight = $('reelRight');

let videoData = null;   // { title, thumbnail, duration, site, formats }
let selectedIdx = 0;
let currentJobId = null;

function suggestedFilename(){
  const sel = videoData && videoData.formats[selectedIdx];
  const base = (videoData && videoData.title || 'video').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  return `${base}${sel ? ' ' + sel.label : ''}.mp4`;
}

function shakeReel(msg){
  deckError.textContent = msg;
  deckError.classList.remove('show');
  void deckError.offsetWidth; // restart the shake animation even if it's already showing
  deckError.classList.add('show');
}

function formatDuration(sec){
  if(!sec && sec !== 0) return '';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function onFetch(){
  const url = urlInput.value.trim();
  if(!url){ shakeReel('Paste a link first!'); return; }

  deckError.classList.remove('show');
  fetchBtn.disabled = true;
  urlInput.disabled = true;
  fetchLabel.textContent = 'Reading…';
  deckStatus.textContent = 'reading…';
  deckStatus.classList.add('busy');
  deckHint.classList.add('show');
  reelLeft.classList.add('spin');
  reelRight.classList.add('spin');

  try{
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();
    if(!res.ok){ shakeReel(data.detail || "That doesn't look like a link we can read."); return; }

    videoData = data;
    selectedIdx = 0;
    renderChoose();
    showPanel('choose');
  } catch(err){
    shakeReel("Couldn't reach the server. Try again.");
  } finally {
    fetchBtn.disabled = false;
    urlInput.disabled = false;
    fetchLabel.textContent = 'Fetch qualities';
    deckStatus.textContent = 'ready';
    deckStatus.classList.remove('busy');
    deckHint.classList.remove('show');
    reelLeft.classList.remove('spin');
    reelRight.classList.remove('spin');
  }
}

function renderChoose(){
  const metaThumb = $('metaThumb');
  metaThumb.style.backgroundImage = videoData.thumbnail ? `url("${videoData.thumbnail}")` : '';
  $('metaTitle').textContent = videoData.title || 'Untitled video';
  const bits = [videoData.site, formatDuration(videoData.duration)].filter(Boolean);
  $('metaSub').textContent = bits.join(' · ');

  const grid = $('qualityGrid');
  grid.innerHTML = '';
  const maxSize = Math.max(...videoData.formats.map(f => f.size_mb || 0), 1);

  videoData.formats.forEach((f, i)=>{
    const frac = (f.size_mb || f.quality / 2160) / maxSize;
    const offset = CIRCUMFERENCE * (1 - Math.min(1, frac));
    const ring = RING_COLOR_BY_QUALITY(f.quality);
    const btn = document.createElement('button');
    btn.className = 'qcard' + (i === selectedIdx ? ' selected' : '');
    btn.style.animationDelay = `${i * 0.05}s`;
    btn.innerHTML = `
      ${i === 0 ? '<span class="qcard-badge">Best</span>' : ''}
      <svg class="qring" width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(240,240,240,0.1)" stroke-width="4"/>
        <circle cx="18" cy="18" r="15" fill="none" stroke="${ring}" stroke-width="4" stroke-linecap="round" stroke-dasharray="94" stroke-dashoffset="${offset}"/>
      </svg>
      <div><div class="qlabel">${f.label}</div><div class="qsize">${f.size_mb ? f.size_mb + ' MB' : 'size unknown'}</div></div>`;
    btn.addEventListener('click', ()=>{ selectedIdx = i; renderChoose(); });
    grid.appendChild(btn);
  });

  const sel = videoData.formats[selectedIdx];
  $('dsum').innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 19h16" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span><b>${sel.label}</b> · ${sel.has_audio ? 'video + audio' : 'audio merged in'} · ~${sel.size_mb ? sel.size_mb + ' MB' : 'unknown size'}</span>`;
}

$('changeLinkBtn').addEventListener('click', ()=>{
  videoData = null;
  urlInput.value = '';
  showPanel('idle');
});

const STAGE_MSG = {
  starting: 'Fetching video stream…',
  video: 'Fetching video stream…',
  audio: 'Fetching audio stream…',
  merging: 'Merging video and audio…',
  done: 'Sending it over…',
};

async function onDownload(){
  const sel = videoData.formats[selectedIdx];
  deckError.classList.remove('show');
  showPanel('downloading');
  setProgress(0, 'starting');

  try{
    const startRes = await fetch('/api/download/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlInput.value.trim(), height: sel.height }),
    });
    const startData = await startRes.json();
    if(!startRes.ok){
      shakeReel(startData.detail || 'Download failed.');
      showPanel('choose');
      return;
    }

    const jobId = startData.job_id;

    // poll the server while it downloads and merges, so the bar reflects real work
    let stage = 'starting';
    const MAX_POLLS = 600; // ~4 minutes at 400ms, matches the server-side timeout
    for(let i = 0; i < MAX_POLLS; i++){
      await new Promise((r)=> setTimeout(r, 400));
      const pr = await fetch(`/api/download/progress/${jobId}`);
      const pd = await pr.json();
      if(pd.stage === 'error'){
        shakeReel(pd.error || 'Download failed.');
        showPanel('choose');
        return;
      }
      stage = pd.stage;
      setProgress(Math.min(99, pd.pct), stage);
      if(stage === 'done') break;
    }
    if(stage !== 'done'){
      shakeReel('This is taking too long. Try again.');
      showPanel('choose');
      return;
    }

    // the file itself isn't fetched here — it's fetched (and streamed
    // straight to disk) only when the user clicks "Save to device", so
    // nothing has to sit fully buffered in browser memory as a blob
    currentJobId = jobId;

    setProgress(100, 'done');
    donePanel.classList.remove('saved');
    doneTitle.textContent = 'Your MP4 is ready';
    $('doneSub').textContent = `${videoData.title || 'Your video'} · ${sel.label} · deleted from our server once saved.`;
    setTimeout(()=> showPanel('done'), 300);
  } catch(err){
    shakeReel('Download failed. Try again.');
    showPanel('choose');
  }
}

function setProgress(pct, stage){
  $('progressMsg').textContent = STAGE_MSG[stage] || STAGE_MSG.starting;
  $('progressFill').style.width = pct + '%';
  $('progressLabel').textContent = `${Math.round(pct)}% complete`;
  $('progressFormat').textContent = videoData.formats[selectedIdx].label;
  $('botWrap').style.left = `clamp(15%, ${pct}%, 85%)`;
}

function markSaved(){
  donePanel.classList.add('saved');
  doneTitle.textContent = 'Saved to your device';
}

let saving = false;
saveBtn.addEventListener('click', async ()=>{
  if(!currentJobId || saving) return;
  saving = true;
  const downloadUrl = `/api/download/file/${currentJobId}`;

  try{
    if(window.showSaveFilePicker){
      // ask where to save BEFORE touching the server — the job's file can
      // only be fetched once, so if the user cancels here we haven't
      // wasted it
      let handle;
      try{
        handle = await window.showSaveFilePicker({
          suggestedName: suggestedFilename(),
          types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
        });
      } catch(err){
        return; // user cancelled the picker, nothing was fetched
      }

      try{
        const res = await fetch(downloadUrl);
        if(!res.ok) throw new Error('download failed');
        // stream the response straight to disk instead of buffering the
        // whole file in memory first — matters for large videos
        const writable = await handle.createWritable();
        await res.body.pipeTo(writable);
        markSaved();
      } catch(err){
        shakeReel("Couldn't save the file. Try again.");
      }
      return;
    }

    // no File System Access API (embedded browsers, etc.) — let the
    // browser handle it as a normal streamed download instead of fetching
    // it into JS first
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.click();
    markSaved();
  } finally {
    saving = false;
  }
});

function resetDeck(){
  videoData = null; selectedIdx = 0; currentJobId = null;
  urlInput.value = '';
  showPanel('idle');
}
$('againBtn').addEventListener('click', resetDeck);

fetchBtn.addEventListener('click', onFetch);
urlInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') onFetch(); });
$('mergeBtn').addEventListener('click', onDownload);
