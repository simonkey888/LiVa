/**
 * LiVa Frontend — embedded as a template string.
 *
 * Features implemented client-side:
 *   #1 Zero-latency zapping pool (3 iframes: prev/curr/next)
 *   #2 Anti-bounce shield (transparent overlay + iframe sandbox)
 *   #5 Shorta pseudo-live rendering with SERIE 🎬 badge
 *   #8 Pluto TV dedicated hub tab (HLS via hls.js)
 */

export const FRONTEND_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#0a0a0a" />
<title>LiVa — Zapping sin latencia</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js"></script>
<style>
  html, body { background:#000; color:#fff; overscroll-behavior:none; -webkit-tap-highlight-color:transparent; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif; }
  .iframe-pool { position:absolute; inset:0; }
  .iframe-pool iframe {
    position:absolute; inset:0; width:100%; height:100%; border:0;
    transition: opacity .15s ease-out;
    will-change: opacity;
  }
  .iframe-pool iframe.hidden-slot { opacity:0; pointer-events:none; }
  .iframe-pool iframe.active-slot { opacity:1; pointer-events:none; }
  /* Feature #2: anti-bounce shield — sits ABOVE iframe, blocks stray clicks */
  .bounce-shield { position:absolute; inset:0; z-index:50; background:transparent; }
  .badge-pill {
    display:inline-flex; align-items:center; gap:4px;
    padding:2px 8px; border-radius:999px; font-size:11px; font-weight:600;
    backdrop-filter: blur(8px); background: rgba(0,0,0,.55);
  }
  .nav-tab { transition: all .2s; }
  .nav-tab.active { background:#fff; color:#000; }
  .nav-tab:not(.active) { background:rgba(255,255,255,.08); color:#aaa; }
  .snap-container { scroll-snap-type: y mandatory; height:100vh; overflow-y:scroll; scrollbar-width:none; }
  .snap-container::-webkit-scrollbar { display:none; }
  .snap-item { scroll-snap-align:start; height:100vh; position:relative; }
  .pluto-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap:10px; }
  .pluto-card { aspect-ratio: 16/9; background:#1a1a1a; border-radius:8px; overflow:hidden; cursor:pointer; position:relative; }
  .pluto-card img { width:100%; height:100%; object-fit:cover; }
  .pluto-card .pluto-label { position:absolute; bottom:0; left:0; right:0; padding:8px; background:linear-gradient(to top, rgba(0,0,0,.8), transparent); font-size:12px; }
  .loading-spinner { width:32px; height:32px; border:3px solid rgba(255,255,255,.1); border-top-color:#fff; border-radius:50%; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .pulse-dot { width:8px; height:8px; background:#ff3b3b; border-radius:50%; animation: pulse 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
</style>
</head>
<body class="select-none">

<!-- =================== TOP NAV =================== -->
<div class="fixed top-0 inset-x-0 z-[60] px-4 pt-3 pb-2 bg-gradient-to-b from-black/80 to-transparent">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <h1 class="text-2xl font-black tracking-tight">LiVa</h1>
      <span class="text-[10px] text-white/40 font-mono">v4.1</span>
    </div>
    <div class="flex gap-1 p-1 rounded-full bg-black/40 backdrop-blur">
      <button id="tab-feed" class="nav-tab active px-4 py-1.5 rounded-full text-xs font-semibold">Para Ti</button>
      <button id="tab-pluto" class="nav-tab px-4 py-1.5 rounded-full text-xs font-semibold">Pluto Hub</button>
    </div>
  </div>
</div>

<!-- =================== FEED VIEW (Zapping vertical infinito) =================== -->
<div id="view-feed" class="snap-container">
  <!-- Snap items injected by JS -->
</div>

<!-- =================== PLUTO HUB VIEW =================== -->
<div id="view-pluto" class="hidden fixed inset-0 z-10 overflow-y-auto pt-20 pb-8 px-4">
  <div class="max-w-5xl mx-auto">
    <div class="mb-4">
      <h2 class="text-xl font-bold">Pluto TV Hub</h2>
      <p class="text-xs text-white/50">15 canales HLS nativos — sin iframe, sin bloqueos</p>
    </div>
    <div id="pluto-grid" class="pluto-grid">
      <div class="col-span-full flex justify-center py-10"><div class="loading-spinner"></div></div>
    </div>
  </div>
</div>

<!-- =================== PLUTO PLAYER MODAL =================== -->
<div id="pluto-player" class="hidden fixed inset-0 z-[70] bg-black flex flex-col">
  <div class="flex items-center justify-between p-4 pt-6">
    <button id="pluto-close" class="text-white/80 hover:text-white text-sm font-semibold">← Volver</button>
    <span id="pluto-player-title" class="text-sm font-semibold truncate max-w-[60%]"></span>
    <span class="w-12"></span>
  </div>
  <div class="flex-1 relative">
    <video id="pluto-video" controls playsinline class="w-full h-full bg-black"></video>
  </div>
</div>

<!-- =================== ZAP CONTROLS (right side) =================== -->
<div id="zap-controls" class="fixed right-3 bottom-24 z-[55] flex flex-col gap-3 items-center">
  <button id="zap-up" class="w-12 h-12 rounded-full bg-white/10 backdrop-blur active:bg-white/30 text-xl">▲</button>
  <button id="zap-down" class="w-12 h-12 rounded-full bg-white/10 backdrop-blur active:bg-white/30 text-xl">▼</button>
</div>

<!-- =================== STREAM INFO OVERLAY =================== -->
<div id="stream-info" class="fixed left-3 bottom-6 right-20 z-[55] pointer-events-none">
  <div class="flex items-center gap-2 mb-1">
    <div class="pulse-dot"></div>
    <span class="text-xs font-bold uppercase tracking-wider text-red-500">EN VIVO</span>
    <span id="stream-source" class="badge-pill"></span>
    <span id="stream-badge" class="badge-pill" style="background:rgba(255,180,0,.85); color:#000;"></span>
  </div>
  <h3 id="stream-title" class="text-base font-bold leading-tight line-clamp-2"></h3>
  <p id="stream-channel" class="text-xs text-white/70 mt-1"></p>
</div>

<script>
// =====================================================
// LiVa Frontend Engine v4.1
// =====================================================

const State = {
  streams: [],
  currentIndex: 0,
  // 3-iframe pool: [prev, current, next]
  pool: [null, null, null],
  poolEls: [],
  isLoading: false,
  geo: null,
};

const feedView = document.getElementById('view-feed');
const streamInfo = document.getElementById('stream-info');
const streamTitle = document.getElementById('stream-title');
const streamChannel = document.getElementById('stream-channel');
const streamSource = document.getElementById('stream-source');
const streamBadge = document.getElementById('stream-badge');

// =====================================================
// 1) ZERO-LATENCY ZAPPING POOL — 3 iframes persistent
// =====================================================
function initIframePool() {
  const pool = document.createElement('div');
  pool.className = 'iframe-pool';
  pool.id = 'iframe-pool';
  // We attach pool to current snap item dynamically.
  return pool;
}

function getOrCreatePoolForSnap(snapEl) {
  let pool = snapEl.querySelector('.iframe-pool');
  if (!pool) {
    pool = document.createElement('div');
    pool.className = 'iframe-pool';
    snapEl.appendChild(pool);
    // Create 3 iframes inside
    for (let i = 0; i < 3; i++) {
      const f = document.createElement('iframe');
      f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
      f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
      f.setAttribute('referrerpolicy', 'origin');
      f.className = 'iframe-pool-item ' + (i === 1 ? 'active-slot' : 'hidden-slot');
      pool.appendChild(f);

      // Feature #2: anti-bounce shield over each iframe
      const shield = document.createElement('div');
      shield.className = 'bounce-shield';
      pool.appendChild(shield);
    }
  }
  return pool;
}

function setSnapIframeSrc(snapEl, stream, slotIndex) {
  const pool = getOrCreatePoolForSnap(snapEl);
  const iframes = pool.querySelectorAll('iframe');
  if (iframes[slotIndex]) {
    iframes[slotIndex].src = stream.embed_url;
  }
}

// =====================================================
// RENDER FEED
// =====================================================
function renderFeed() {
  feedView.innerHTML = '';
  State.streams.forEach((stream, idx) => {
    const snap = document.createElement('div');
    snap.className = 'snap-item';
    snap.dataset.idx = idx;

    // Background thumbnail (visible while iframe loads)
    if (stream.thumbnail) {
      snap.style.backgroundImage = \`url(\${stream.thumbnail})\`;
      snap.style.backgroundSize = 'cover';
      snap.style.backgroundPosition = 'center';
    }
    // Dark overlay for readability of stream-info
    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0';
    overlay.style.background = 'linear-gradient(to top, rgba(0,0,0,.85) 0%, rgba(0,0,0,.2) 40%, rgba(0,0,0,0) 70%)';
    snap.appendChild(overlay);

    // Loading spinner placeholder
    const spinner = document.createElement('div');
    spinner.className = 'absolute inset-0 flex items-center justify-center';
    spinner.innerHTML = '<div class="loading-spinner"></div>';
    snap.appendChild(spinner);

    feedView.appendChild(snap);
  });

  // Pre-mount first 3 iframes
  setTimeout(() => {
    for (let i = 0; i < Math.min(3, State.streams.length); i++) {
      const snap = feedView.children[i];
      if (snap) setSnapIframeSrc(snap, State.streams[i], 1);
    }
    updateStreamInfo(0);
  }, 50);
}

// =====================================================
// SCROLL HANDLING — manage pool slot visibility
// =====================================================
const snapObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.intersectionRatio >= 0.6) {
      const idx = parseInt(entry.target.dataset.idx, 10);
      onSnapActivate(idx);
    }
  });
}, { threshold: [0, 0.25, 0.5, 0.6, 0.85, 1], root: feedView });

function onSnapActivate(idx) {
  if (idx === State.currentIndex) return;
  State.currentIndex = idx;

  // Mute previous iframe, unmute current
  const prevSnap = feedView.children[idx - 1];
  const currSnap = feedView.children[idx];
  const nextSnap = feedView.children[idx + 1];

  if (currSnap) {
    const pool = currSnap.querySelector('.iframe-pool');
    if (pool) {
      pool.querySelectorAll('iframe').forEach(f => f.classList.remove('active-slot'));
      const active = pool.querySelectorAll('iframe')[1];
      if (active) active.classList.add('active-slot');
    }
  }

  // Pre-mount next iframe if not yet loaded
  if (nextSnap && !nextSnap.querySelector('.iframe-pool iframe[src]')) {
    if (State.streams[idx + 1]) {
      setSnapIframeSrc(nextSnap, State.streams[idx + 1], 1);
    }
  }

  updateStreamInfo(idx);
}

function updateStreamInfo(idx) {
  const s = State.streams[idx];
  if (!s) return;
  streamTitle.textContent = s.title || '';
  streamChannel.textContent = s.channel || '';
  streamSource.textContent = (s.source || '').toUpperCase();
  streamSource.style.display = s.source ? '' : 'none';

  if (s.badge) {
    streamBadge.textContent = s.badge;
    streamBadge.style.display = '';
  } else {
    streamBadge.style.display = 'none';
  }
}

// =====================================================
// NAVIGATION — zap up/down buttons + scroll
// =====================================================
function snapToIndex(idx) {
  const target = feedView.children[idx];
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
document.getElementById('zap-up').addEventListener('click', () => {
  if (State.currentIndex > 0) snapToIndex(State.currentIndex - 1);
});
document.getElementById('zap-down').addEventListener('click', () => {
  if (State.currentIndex < State.streams.length - 1) snapToIndex(State.currentIndex + 1);
});

// Keyboard support
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'j') {
    if (State.currentIndex < State.streams.length - 1) snapToIndex(State.currentIndex + 1);
  } else if (e.key === 'ArrowUp' || e.key === 'k') {
    if (State.currentIndex > 0) snapToIndex(State.currentIndex - 1);
  }
});

// =====================================================
// FETCH STREAMS FROM WORKER
// =====================================================
async function loadFeed() {
  try {
    const resp = await fetch('/api/streams');
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error);
    State.streams = data.streams || [];
    State.geo = data.geo;
    if (State.streams.length === 0) {
      feedView.innerHTML = '<div class="flex items-center justify-center h-screen text-white/60 text-sm">No hay streams disponibles ahora. Reintentá en unos minutos.</div>';
      return;
    }
    renderFeed();
    // Observe all snaps
    Array.from(feedView.children).forEach(c => snapObserver.observe(c));
  } catch (e) {
    feedView.innerHTML = \`<div class="flex flex-col items-center justify-center h-screen text-white/60 text-sm gap-2">
      <div>Error al cargar el feed</div>
      <div class="text-xs text-white/40">\${e.message}</div>
      <button onclick="location.reload()" class="mt-3 px-4 py-2 bg-white/10 rounded-full text-xs">Reintentar</button>
    </div>\`;
  }
}

// =====================================================
// PLUTO TV HUB (Feature #8)
// =====================================================
async function loadPluto() {
  const grid = document.getElementById('pluto-grid');
  try {
    const resp = await fetch('/api/pluto');
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error);
    grid.innerHTML = '';
    (data.channels || []).forEach(ch => {
      const card = document.createElement('div');
      card.className = 'pluto-card';
      card.innerHTML = \`
        <img src="\${ch.logo || ''}" onerror="this.style.display='none'" />
        <div class="pluto-label">
          <div class="font-semibold text-xs truncate">\${ch.channel}</div>
          <div class="text-[10px] text-white/60 truncate">\${ch.title}</div>
        </div>
      \`;
      card.addEventListener('click', () => openPlutoPlayer(ch));
      grid.appendChild(card);
    });
  } catch (e) {
    grid.innerHTML = \`<div class="col-span-full text-center text-white/60 text-sm">Error: \${e.message}</div>\`;
  }
}

let hls = null;
function openPlutoPlayer(channel) {
  const modal = document.getElementById('pluto-player');
  const video = document.getElementById('pluto-video');
  const title = document.getElementById('pluto-player-title');
  title.textContent = channel.channel;
  modal.classList.remove('hidden');
  if (hls) hls.destroy();
  if (Hls.isSupported()) {
    hls = new Hls({ maxBufferLength: 30, liveDurationInfinity: true });
    hls.loadSource(channel.hls_url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(()=>{}));
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = channel.hls_url;
    video.play().catch(()=>{});
  }
}
document.getElementById('pluto-close').addEventListener('click', () => {
  const modal = document.getElementById('pluto-player');
  const video = document.getElementById('pluto-video');
  modal.classList.add('hidden');
  video.pause();
  if (hls) { hls.destroy(); hls = null; }
});

// =====================================================
// TAB SWITCHING
// =====================================================
document.getElementById('tab-feed').addEventListener('click', () => {
  document.getElementById('tab-feed').classList.add('active');
  document.getElementById('tab-pluto').classList.remove('active');
  document.getElementById('view-feed').classList.remove('hidden');
  document.getElementById('view-pluto').classList.add('hidden');
  document.getElementById('zap-controls').style.display = '';
  document.getElementById('stream-info').style.display = '';
});
document.getElementById('tab-pluto').addEventListener('click', () => {
  document.getElementById('tab-pluto').classList.add('active');
  document.getElementById('tab-feed').classList.remove('active');
  document.getElementById('view-pluto').classList.remove('hidden');
  document.getElementById('view-feed').classList.add('hidden');
  document.getElementById('zap-controls').style.display = 'none';
  document.getElementById('stream-info').style.display = 'none';
  if (!document.getElementById('pluto-grid').dataset.loaded) {
    loadPluto();
    document.getElementById('pluto-grid').dataset.loaded = '1';
  }
});

// =====================================================
// BOOT
// =====================================================
loadFeed();
</script>
</body>
</html>`;
