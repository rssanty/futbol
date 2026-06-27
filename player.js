const FIREBASE_URL  = 'https://prueba-16972-default-rtdb.firebaseio.com/canal_futbol.json?auth=7cMRTBfcbEpEdnNW7uva7K8JtYawWfdcjfw5tQei';
const LIVE_EDGE_SEC = 10;
const iframe       = document.getElementById('stream-iframe');
const video        = document.getElementById('stream-video');
const blocker      = document.getElementById('blocker');
const spinner      = document.getElementById('spinner');
const pickScr      = document.getElementById('pick-screen');
const chLabel      = document.getElementById('ch-label');
const modeLabel    = document.getElementById('mode-label');
const hlsPill      = document.getElementById('pill-hls');
const pill1080     = document.getElementById('pill-1080');
const qBadge       = document.getElementById('quality-badge');
const btnQ         = document.getElementById('btn-quality');
const curQ         = document.getElementById('cur-quality');
const btnLive      = document.getElementById('btn-live');
const iconPlay     = document.getElementById('icon-play');
const iconPause    = document.getElementById('icon-pause');
const m3uPanel     = document.getElementById('m3u8-panel');
const m3uUrl       = document.getElementById('m3u8-url');
const chBar        = document.getElementById('channel-bar');
const chError      = document.getElementById('ch-error');
const playerWrap   = document.getElementById('player-wrap');
const pauseOverlay = document.getElementById('pause-overlay');
const goLiveBtn    = document.getElementById('go-live-btn');
const behindLabel  = document.getElementById('behind-label');
let channels     = [];
let activeIdx    = -1;
let detectedM3U8 = null;
let hls          = null;
let perfObs      = null;
let liveInterval = null;
let hideTimer    = null;
let playerMode   = 'none';   
let iframePaused = false;
let qMenuOpen    = false;


async function loadChannels() {
  chBar.innerHTML = '<div class="ch-skeleton"></div>'.repeat(3);
  chError.style.display = 'none';
  try {
    const res = await fetch(FIREBASE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    channels = (Array.isArray(raw) ? raw : Object.values(raw))
      .filter(Boolean)
      .map(c => ({ nombre: clean(c.nombre), url: clean(c.url) }))
      .filter(c => c.nombre && c.url);
    renderChannels();
  } catch(e) {
    chBar.innerHTML = '';
    chError.style.display = 'flex';
    showToast('⚠ Error cargando canales');
  }
}

function clean(s) {
  return typeof s === 'string' ? s.replace(/^"+|"+$/g, '').trim() : '';
}

function renderChannels() {
  chBar.innerHTML = '';
  channels.forEach((ch, i) => {
    const b = document.createElement('button');
    b.className = 'ch-btn';
    b.innerHTML = `<span class="ch-num">CH${i + 1}</span>${ch.nombre}`;
    b.onclick = () => selectChannel(i);
    chBar.appendChild(b);
  });
}

function selectChannel(idx) {
  if (idx === activeIdx) return;
  document.querySelectorAll('.ch-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
  activeIdx = idx;
  resetPlayer();
  pickScr.style.display = 'none';

  const ch = channels[idx];
  iframe.src = ch.url;
  chLabel.textContent = ch.nombre;
  modeLabel.textContent = `Cargando ${ch.nombre}...`;
  showToast(`📡 Cargando ${ch.nombre}`);

  playerMode   = 'iframe';
  iframePaused = false;
  iconPlay.style.display  = 'none';
  iconPause.style.display = 'block';
  playerWrap.classList.add('native-active');

  startNetworkSniffer();
  injectBridge();

  setTimeout(() => {
    if (!detectedM3U8 && activeIdx === idx)
      console.log("ok")
  }, 7000);
}

function resetPlayer() {
  if (hls)      { hls.destroy(); hls = null; }
  if (perfObs)  { try { perfObs.disconnect(); } catch(_){} perfObs = null; }
  if (liveInterval) { clearInterval(liveInterval); liveInterval = null; }

  detectedM3U8 = null;
  iframe.onload = null;
  iframe.style.display  = 'block';
  iframe.src            = 'about:blank';
  blocker.style.display = 'block';

  video.pause();
  video.removeAttribute('src');
  video.load();
  video.style.display = 'none';

  spinner.style.display  = 'none';
  m3uPanel.style.display = 'none';
  qBadge.style.display   = 'none';
  btnQ.style.display     = 'none';
  btnLive.style.display  = 'none';
  document.getElementById('quality-menu').innerHTML = '';
  hlsPill.classList.remove('on');
  pill1080.classList.remove('on');
  curQ.textContent = 'HD';
  playerWrap.classList.remove('native-active');
  playerMode   = 'none';
  iframePaused = false;
  pauseOverlay.style.display = 'none';
  goLiveBtn.style.display    = 'none';
  iconPlay.style.display  = 'block';
  iconPause.style.display = 'none';
}

['mousedown','click','touchstart','pointerdown','contextmenu'].forEach(ev =>
  blocker.addEventListener(ev, e => {
    e.preventDefault(); e.stopPropagation();
  }, { capture:true, passive:false })
);
window.open = () => { showToast('🛡 Popup bloqueado'); return null; };
window.addEventListener('beforeunload', e => { e.preventDefault(); e.returnValue = ''; });


function isM3U8(url) {
  return typeof url === 'string' && /\.m3u8(\?|$)|\/chunklist|\/playlist\.m3u8/i.test(url);
}

function startNetworkSniffer() {
  try {
    perfObs = new PerformanceObserver(list => {
      for (const e of list.getEntries())
        if (isM3U8(e.name) && !detectedM3U8) onM3U8Found(e.name);
    });
    perfObs.observe({ type:'resource', buffered:true });
  } catch(_) {}
}

function injectBridge() {
  iframe.onload = () => {
    if (playerMode === 'iframe' && channels[activeIdx])
      modeLabel.textContent = `${channels[activeIdx].nombre} · iframe · detectando...`;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      const s = doc.createElement('script');
      s.textContent = `(function(){
        const xo=XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open=function(m,u){
          if(u&&/\\.m3u8|chunklist/i.test(u))try{parent.postMessage({type:'m3u8',url:u},'*')}catch(_){}
          return xo.apply(this,arguments);
        };
        const of=window.fetch;
        window.fetch=function(i,init){
          const u=typeof i==='string'?i:(i?.url||'');
          if(/\\.m3u8|chunklist/i.test(u))try{parent.postMessage({type:'m3u8',url:u},'*')}catch(_){}
          return of.call(this,i,init);
        };
      })();`;
      doc.head?.appendChild(s);
    } catch(_) {}
  };
}

window.addEventListener('message', e => {
  if (e.data?.type === 'm3u8' && !detectedM3U8) onM3U8Found(e.data.url);
});

function onM3U8Found(url) {
  detectedM3U8 = url;
  m3uUrl.textContent = url;
  m3uPanel.style.display = 'block';
  showToast('🎯 Stream detectado — iniciando HD...');
  setTimeout(() => switchToNative(), 500);
}

function getBestLevel(levels) {
  if (!levels.length) return 0;
  let best = 0;
  levels.forEach((l, i) => {
    const bH = levels[best].height  || 0, bB = levels[best].bitrate || 0;
    const lH = l.height  || 0,            lB = l.bitrate || 0;
    if (lH > bH || (lH === bH && lB > bB)) best = i;
  });
  return best;
}

function switchToNative() {
  if (!detectedM3U8) { showToast('Stream no detectado aún'); return; }

  iframe.style.display  = 'none';
  blocker.style.display = 'none';
  video.style.display   = 'block';
  spinner.style.display = 'flex';
  if (hls) { hls.destroy(); hls = null; }

  if (Hls.isSupported()) {
    hls = new Hls({
      startLevel: -1,
      capLevelToPlayerSize: false,
      capLevelOnFPSDrop: false,
      maxMaxBufferLength: 60,
      maxBufferSize: 80 * 1024 * 1024,
      maxBufferHole: 0.5,
      abrEwmaDefaultEstimate: 50_000_000,
      abrEwmaFastLive: 3,
      abrEwmaSlowLive: 9,
      abrBandWidthFactor: 0.98,
      abrBandWidthUpFactor: 0.5,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 6,
    });
    hls.loadSource(detectedM3U8);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      spinner.style.display = 'none';

      const level = getBestLevel(data.levels);
      hls.currentLevel = level;
      hls.loadLevel    = level;
      hls.nextLevel    = level;
      const lv    = data.levels[level];
      const label = lv.height ? `${lv.height}p` : 'MAX';

      buildQualityMenu(data.levels);
      btnLive.style.display = 'flex';
      btnLive.classList.add('active');
      updateQBadge(label);
      curQ.textContent = label;
      markActiveQ(level);
      pill1080.classList.add('on');
      hlsPill.classList.add('on');
      playerWrap.classList.add('native-active');
      playerMode = 'native';
      modeLabel.textContent = `${channels[activeIdx]?.nombre || ''} · HLS · ${data.levels.length} niveles · ${label}`;

      const p = video.play(); if (p) p.catch(() => {});
      startLiveTracker();
      showToast(`✅ ${label} — máxima calidad`);
    });

    // Evitar que el ABR baje la calidad automáticamente
    hls.on(Hls.Events.LEVEL_SWITCHING, (_, data) => {
      const max = getBestLevel(hls.levels);
      if (!qMenuOpen && data.level < max) {
        hls.currentLevel = max;
        hls.loadLevel    = max;
      }
    });

    hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
      const lv = hls.levels[data.level]; if (!lv) return;
      const label = lv.height ? `${lv.height}p` : `L${data.level}`;
      updateQBadge(label); curQ.textContent = label; markActiveQ(data.level);
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        spinner.style.display = 'none';
        showToast('⚠ Error — reintentando...');
        setTimeout(() => { if (hls) hls.loadSource(detectedM3U8); }, 2000);
      }
    });

  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = detectedM3U8;
    const p = video.play(); if (p) p.catch(() => {});
    spinner.style.display = 'none';
    updateQBadge('HD');
    playerWrap.classList.add('native-active');
    playerMode = 'native';
    showToast('▶ HLS nativo (Safari)');
  } else {
    showToast('⚠ Navegador sin soporte HLS');
    iframe.style.display  = 'block';
    blocker.style.display = 'block';
    video.style.display   = 'none';
    spinner.style.display = 'none';
  }
}


function togglePlay() {
  if (playerMode === 'none') { showToast('📡 Selecciona un canal primero'); return; }

  if (playerMode === 'iframe') {
    const ch = channels[activeIdx];
    if (!iframePaused) {
      iframe.src = 'about:blank';
      iframePaused = true;
      iconPlay.style.display  = 'block';
      iconPause.style.display = 'none';
      pauseOverlay.style.display = 'flex';
      showToast('⏸ Stream pausado');
    } else {
      iframe.src = ch.url;
      iframePaused = false;
      iconPlay.style.display  = 'none';
      iconPause.style.display = 'block';
      pauseOverlay.style.display = 'none';
      showToast('▶ Reanudando...');
    }
    return;
  }

  // Modo native
  if (video.paused) {
    goLiveBtn.style.display = 'none';
    try {
      const s = video.seekable;
      if (s && s.length > 0 && video.currentTime < s.start(0)) snapToLive();
    } catch(_) {}
    const p = video.play(); if (p) p.catch(() => {});
  } else {
    video.pause();
    showToast('⏸ Pausado');
  }
}

function updatePlayIcon() {
  const paused = video.paused;
  iconPlay.style.display  = paused ? 'block' : 'none';
  iconPause.style.display = paused ? 'none'  : 'block';
}

video.addEventListener('play',    updatePlayIcon);
video.addEventListener('pause',   updatePlayIcon);
video.addEventListener('playing', updatePlayIcon);
video.addEventListener('ended',   updatePlayIcon);

function snapToLive() {
  try {
    if (hls && hls.liveSyncPosition != null) {
      video.currentTime = hls.liveSyncPosition;
    } else {
      const s = video.seekable;
      if (s && s.length > 0) video.currentTime = Math.max(0, s.end(s.length - 1) - 4);
    }
    if (hls) hls.startLoad(-1);
  } catch(_) {}
}

function goLiveFromPause() {
  goLiveBtn.style.display = 'none';
  snapToLive();
  const p = video.play();
  if (p) p.then(() => showToast('▶ De vuelta al live')).catch(() => {});
}

function startLiveTracker() {
  if (liveInterval) clearInterval(liveInterval);
  liveInterval = setInterval(() => {
    try {
      const s = video.seekable;
      if (!s || !s.length) return;
      const behind = s.end(s.length - 1) - video.currentTime;
      const isLive = behind <= LIVE_EDGE_SEC;

      btnLive.classList.toggle('active', isLive);
      btnLive.title = isLive ? 'En vivo' : `${Math.round(behind)}s detrás`;

      if (video.paused && !isLive) {
        const mins = Math.floor(behind / 60), secs = Math.round(behind % 60);
        behindLabel.textContent = mins > 0 ? `· ${mins}m ${secs}s atrás` : `· ${secs}s atrás`;
        goLiveBtn.style.display = 'flex';
      } else {
        goLiveBtn.style.display = 'none';
      }
    } catch(_) {}
  }, 1000);
}


function buildQualityMenu(levels) {
  const menu = document.getElementById('quality-menu');
  menu.innerHTML = '';
  btnQ.style.display = 'flex';

  menu.appendChild(makeQOpt('🔄 Auto', '', -1));
  [...levels].map((lv, i) => ({ lv, i }))
    .sort((a, b) => (b.lv.height || 0) - (a.lv.height || 0))
    .forEach(({ lv, i }) => {
      const res  = lv.height ? `${lv.width}×${lv.height}` : '';
      const mbps = lv.bitrate ? `${(lv.bitrate / 1e6).toFixed(1)} Mbps` : '';
      const icon = lv.height >= 1080 ? '🏆 ' : lv.height >= 720 ? '⭐ ' : '';
      menu.appendChild(makeQOpt(`${icon}${lv.height || '?'}p`, [res, mbps].filter(Boolean).join('  '), i));
    });
  markActiveQ(getBestLevel(levels));
}

function makeQOpt(label, res, level) {
  const d = document.createElement('div');
  d.className = 'q-opt'; d.dataset.level = level;
  d.innerHTML = `<span>${label}</span>${res ? `<span class="q-res">${res}</span>` : ''}`;
  d.onclick = () => { setQuality(level); toggleQMenu(); };
  return d;
}

function setQuality(level) {
  if (!hls) return;
  hls.currentLevel = hls.loadLevel = level; markActiveQ(level);
  if (level === -1) {
    updateQBadge('Auto'); curQ.textContent = 'Auto'; showToast('🔄 Auto');
  } else {
    const lv = hls.levels[level];
    const label = lv?.height ? `${lv.height}p` : `L${level}`;
    updateQBadge(label); curQ.textContent = label; showToast(`✅ ${label}`);
  }
}

function markActiveQ(level) {
  document.querySelectorAll('.q-opt').forEach(el =>
    el.classList.toggle('active', +el.dataset.level === level));
}

function toggleQMenu() {
  qMenuOpen = !qMenuOpen;
  document.getElementById('quality-menu').classList.toggle('open', qMenuOpen);
}

document.addEventListener('click', e => {
  if (!e.target.closest('#btn-quality') && !e.target.closest('#quality-menu')) {
    qMenuOpen = false;
    document.getElementById('quality-menu').classList.remove('open');
  }
});

function updateQBadge(label) {
  qBadge.textContent = label; qBadge.style.display = 'inline-flex';
}

function reloadChannel() {
  if (activeIdx === -1) return;
  resetPlayer();
  pickScr.style.display = 'none';
  const ch = channels[activeIdx];
  iframe.style.display  = 'block';
  blocker.style.display = 'block';
  iframe.src = ch.url + '?t=' + Date.now();
  modeLabel.textContent = `Recargando ${ch.nombre}...`;
  showToast('↺ Recargando...');
  playerMode = 'iframe'; iframePaused = false;
  iconPlay.style.display  = 'none';
  iconPause.style.display = 'block';
  playerWrap.classList.add('native-active');
  startNetworkSniffer(); injectBridge();
}

function toggleFS() {
  const el = playerWrap;
  if (!document.fullscreenElement)
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el).catch(() => video.requestFullscreen?.());
  else document.exitFullscreen?.();
}

document.addEventListener('fullscreenchange', () => {
  const bar = document.querySelector('.ctrl-bar');
  if (document.fullscreenElement) {
    document.addEventListener('mousemove', onFSMove);
    scheduleFSHide(bar);
  } else {
    document.removeEventListener('mousemove', onFSMove);
    clearTimeout(hideTimer); bar.style.opacity = '';
  }
});
function onFSMove() {
  const bar = document.querySelector('.ctrl-bar');
  bar.style.opacity = '1'; scheduleFSHide(bar);
}
function scheduleFSHide(bar) {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { bar.style.opacity = '0'; }, 3000);
}

function copyM3u8() {
  if (!detectedM3U8) return;
  navigator.clipboard.writeText(detectedM3U8)
    .then(() => showToast('📋 URL copiada'))
    .catch(() => showToast('No se pudo copiar'));
}

let _tt;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_tt); _tt = setTimeout(() => t.classList.remove('show'), 2800);
}

loadChannels();
iconPlay.style.display  = 'block';
iconPause.style.display = 'none';