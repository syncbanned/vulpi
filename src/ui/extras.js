// Recursos extras da interface: ponte com o app (bandeja, notificações, Discord, mini player),
// volume, timer de sono, cor da capa, modo foco, letra sincronizada, busca rápida (Ctrl+K),
// estatísticas, página de artista, arrastar para playlist e visualizador.
// As funções daqui são usadas pelo app.js (mesmo escopo).

// ---------- Ponte com o app (src/main.js) ----------
// A página manda mensagens pela função vulpiBridge (criada pelo app via DevTools) e o app
// responde chamando window.__vulpi.reply / window.__vulpi.cmd.
const bridge = {
  n: 0,
  pending: new Map(),
  ok: () => typeof window.vulpiBridge === 'function',
  send(type, data = {}) {
    if (this.ok()) try { window.vulpiBridge(JSON.stringify({ type, ...data })); } catch {}
  },
  ask(type, data = {}, timeout = 10000) {
    if (!this.ok()) return Promise.reject(new Error('sem ponte'));
    const id = ++this.n;
    return new Promise((resolve, reject) => {
      this.pending.set(id, resolve);
      this.send(type, { ...data, id });
      setTimeout(() => this.pending.delete(id) && reject(new Error('tempo esgotado')), timeout);
    });
  },
};

// Comandos que o app (bandeja, mini player) pode mandar.
const commands = {
  toggle: () => playerCmd.toggle(),
  next: () => playerCmd.next(),
  prev: () => playerCmd.prev(),
  like: () => playerCmd.like(),
  volume: (v) => setVolume(v),
  sleep: (v) => setSleep(v),
  focus: () => toggleFocus(true),
};

window.__vulpi = {
  cmd: (name, arg) => commands[name]?.(arg),
  reply: (id, data) => {
    bridge.pending.get(id)?.(data);
    bridge.pending.delete(id);
  },
};

// Estado para o app, no máximo 1x por segundo (e na hora quando muda de música ou pausa).
let lastSent = 0;
let lastKey = '';
function sendState(s) {
  const key = s ? `${s.videoId}|${s.playing}|${s.liked}` : '';
  const now = Date.now();
  if (key === lastKey && now - lastSent < 1000) return;
  lastKey = key;
  lastSent = now;
  bridge.send('state', s ? {
    videoId: s.videoId, title: s.title, artist: s.artist, thumb: s.thumb, playing: s.playing,
    time: s.time, duration: s.duration, liked: s.liked, volume: getVolume(),
    light: shadow.host.classList.contains('light'), focused: document.hasFocus(),
    sleep: sleepLabel(), lang: LANG,
  } : { videoId: null, lang: LANG });
}

// ---------- Avisos rápidos (toast) ----------
function toast(msg) {
  const t = h('div.toast', {}, msg);
  shadow.append(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2600);
}

// ---------- Volume ----------
function getVolume() {
  const p = ytPlayer();
  if (!p?.getVolume) return 100;
  return p.isMuted?.() ? 0 : p.getVolume();
}

function setVolume(v) {
  const p = ytPlayer();
  if (!p?.setVolume) return;
  v = Math.max(0, Math.min(100, Math.round(v)));
  if (v > 0 && p.isMuted?.()) p.unMute();
  if (v === 0) p.mute?.();
  p.setVolume(v);
  updateVolumeUI();
}

let volBefore = 50;
function buildVolume() {
  ui.volIcon = h('button.ctl', {
    title: t('Volume (role para ajustar)'),
    onclick: () => {
      const v = getVolume();
      if (v > 0) { volBefore = v; setVolume(0); } else setVolume(volBefore || 50);
      bump(ui.volIcon);
    },
  });
  ui.volFill = h('div.fill');
  ui.volBar = h('div.vol-bar', {}, h('div.track-bg'), ui.volFill);
  const at = (e) => {
    const r = ui.volBar.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * 100;
  };
  ui.volBar.addEventListener('pointerdown', (e) => { ui.volBar.setPointerCapture(e.pointerId); ui.volBar.dragging = true; setVolume(at(e)); });
  ui.volBar.addEventListener('pointermove', (e) => ui.volBar.dragging && setVolume(at(e)));
  ui.volBar.addEventListener('pointerup', () => { ui.volBar.dragging = false; });
  const box = h('div.vol', {}, ui.volIcon, ui.volBar);
  box.addEventListener('wheel', (e) => { e.preventDefault(); setVolume(getVolume() + (e.deltaY < 0 ? 5 : -5)); }, { passive: false });
  return box;
}

function updateVolumeUI() {
  if (!ui.volIcon) return;
  const v = getVolume();
  setIcon(ui.volIcon, v === 0 ? 'mute' : v < 50 ? 'volumeLow' : 'volume');
  ui.volFill.style.width = `${v}%`;
  ui.volIcon.title = t('Volume {0}% (role para ajustar)', v);
}

// ---------- Timer de sono ----------
const SLEEP_OPTIONS = [0, 15, 30, 60, 'end'];
function setSleep(v) {
  state.sleepStep = Math.max(0, SLEEP_OPTIONS.indexOf(v));
  if (!v) state.sleep = null;
  else if (v === 'end') state.sleep = { end: true, vid: state.now?.videoId };
  else state.sleep = { at: Date.now() + v * 60000 };
  const label = sleepLabel();
  if (ui.sleepItem) ui.sleepItem.querySelector('.k').textContent = label || t('desligado');
  toast(label ? t('Timer de sono: {0}', label) : t('Timer de sono desligado'));
}

function sleepLabel() {
  const s = state.sleep;
  if (!s) return '';
  if (s.end) return t('fim da música');
  return `${Math.max(1, Math.ceil((s.at - Date.now()) / 60000))} min`;
}

// Desligado → 15 → 30 → 60 min → fim da música → desligado.
function cycleSleep() {
  state.sleepStep = ((state.sleepStep || 0) + 1) % SLEEP_OPTIONS.length;
  setSleep(SLEEP_OPTIONS[state.sleepStep]);
}

function checkSleep(s) {
  const sl = state.sleep;
  if (!sl || !s?.playing) return;
  if ((sl.at && Date.now() >= sl.at) || (sl.end && s.videoId !== sl.vid)) {
    ytPlayer()?.pauseVideo();
    state.sleep = null;
    state.sleepStep = 0;
    if (ui.sleepItem) ui.sleepItem.querySelector('.k').textContent = t('desligado');
    toast('Timer de sono: música pausada. Boa noite!');
  }
}

// ---------- Cor da capa (o laranja acompanha a capa da música) ----------
function savedFlag(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function saveFlag(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch {}
}

function setCoverColor(on) {
  state.coverColor = on;
  saveFlag('vulpi-cover-color', on);
  ui.colorItem?.classList.toggle('on', on);
  if (on) applyCoverColor(true); else clearAccent();
}

function clearAccent() {
  ['--accent', '--accent-2', '--accent-soft'].forEach((p) => shadow.host.style.removeProperty(p));
  state.accentHue = null;
}

async function applyCoverColor(force) {
  const s = state.now;
  if (!state.coverColor || !s?.thumb) return;
  if (!force && state.accentFor === s.videoId) return;
  state.accentFor = s.videoId;
  try {
    const c = await bridge.ask('color', { thumb: s.thumb });
    if (!c || state.now?.videoId !== s.videoId || !state.coverColor) return;
    state.accentHue = c;
    paintAccent();
  } catch {}
}

// Mesma cor da capa, mas com claridade ajustada para o tema (contraste com o fundo).
function paintAccent() {
  const c = state.accentHue;
  if (!c) return;
  const light = shadow.host.classList.contains('light');
  const sat = Math.max(45, Math.min(85, c.s));
  const l = light ? 46 : 62;
  shadow.host.style.setProperty('--accent', `hsl(${c.h} ${sat}% ${l}%)`);
  shadow.host.style.setProperty('--accent-2', `hsl(${c.h} ${sat}% ${light ? l - 6 : l + 8}%)`);
  shadow.host.style.setProperty('--accent-soft', `hsl(${c.h} ${sat}% ${l}% / .14)`);
}

// ---------- Letra sincronizada (LRCLIB, pelo app) ----------
const lrcCache = new Map();
async function getSyncedLyrics(s) {
  if (lrcCache.has(s.videoId)) return lrcCache.get(s.videoId);
  let lines = null;
  try {
    const r = await bridge.ask('lrc', { artist: s.artist, title: s.title, duration: Math.round(s.duration) });
    if (r?.synced) {
      lines = r.synced.split('\n').map((l) => {
        const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
        return m ? { t: +m[1] * 60 + +m[2], text: m[3] } : null;
      }).filter(Boolean);
    }
  } catch {}
  lrcCache.set(s.videoId, lines);
  return lines;
}

// Lista de versos com tempo; o verso atual fica em destaque (ver highlightLyrics).
function lyricsView(lines) {
  return h('div.lrc', {}, lines.map((l) =>
    h('button.lrc-line', { 'data-t': l.t, onclick: () => ytPlayer()?.seekTo(l.t, true) }, l.text || '♪')));
}

function highlightLyrics(time) {
  shadow.querySelectorAll('.lrc').forEach((box) => {
    const lines = box.children;
    let cur = -1;
    for (let i = 0; i < lines.length; i++) if (+lines[i].dataset.t <= time + 0.3) cur = i;
    if (box.dataset.cur === String(cur)) return;
    box.dataset.cur = cur;
    for (let i = 0; i < lines.length; i++) {
      lines[i].classList.toggle('on', i === cur);
      lines[i].classList.toggle('past', i < cur);
    }
    const el = lines[cur];
    const scroller = box.closest('.panel-body, .focus-lyrics');
    if (el && scroller) scroller.scrollTo({ top: el.offsetTop - scroller.clientHeight / 2 + el.offsetHeight / 2, behavior: calm() ? 'auto' : 'smooth' });
  });
}

// Letra para mostrar: sincronizada se houver, senão a fixa do YouTube Music.
async function lyricsFor(s) {
  const synced = await getSyncedLyrics(s);
  if (synced?.length) return lyricsView(synced);
  const l = await getLyrics(s.videoId).catch(() => null);
  return l
    ? h('div.lyrics', {}, h('p', {}, l.text), l.source ? h('div.source', {}, l.source) : null)
    : h('div.empty', {}, t('Letra indisponível para esta música.'));
}

// ---------- Modo foco ----------
function toggleFocus(on = !state.focus) {
  state.focus = on;
  if (!on) {
    ui.focus?.classList.add('out');
    setTimeout(() => { ui.focus?.remove(); ui.focus = null; }, 300);
    return;
  }
  if (ui.focus) return;
  ui.focusBody = h('div.focus-lyrics');
  ui.focus = h('div.focus', {},
    h('div.focus-bg'),
    h('button.icon-btn.focus-close', { title: t('Sair do modo foco (Esc)'), onclick: () => toggleFocus(false) }, icon('close')),
    h('div.focus-main', {},
      h('div.focus-art'),
      h('div.focus-meta', {}, h('div.focus-t'), h('div.focus-s')),
      h('canvas.focus-viz', { width: 600, height: 60 })),
    ui.focusBody);
  shadow.append(ui.focus);
  state.focusFor = null;
  updateFocus(state.now);
}

function updateFocus(s) {
  if (!ui.focus || !s) return;
  if (state.focusFor === s.videoId) return;
  state.focusFor = s.videoId;
  const big = s.thumb.replace(/=w\d+-h\d+/, '=w800-h800');
  ui.focus.querySelector('.focus-bg').style.backgroundImage = `url("${big}")`;
  ui.focus.querySelector('.focus-art').replaceChildren(img(big));
  ui.focus.querySelector('.focus-t').textContent = s.title;
  ui.focus.querySelector('.focus-s').textContent = s.artist;
  bump(ui.focus.querySelector('.focus-main'), 'swap-in');
  ui.focusBody.replaceChildren(loading());
  const vid = s.videoId;
  lyricsFor(s).then((el) => { if (state.focusFor === vid && ui.focus) ui.focusBody.replaceChildren(el); });
}

// ---------- Busca rápida (Ctrl+K) ----------
function quickActions() {
  return [
    [t('Modo foco'), 'focus', () => toggleFocus(true)],
    [t('Mini player'), 'mini', () => bridge.send('mini')],
    [t('Trocar tema'), 'sun', () => toggleTheme()],
    [t('Timer de sono'), 'timer', () => cycleSleep()],
    [t('Estatísticas'), 'chart', () => go({ name: 'stats' })],
    [t('Cor da capa'), 'palette', () => setCoverColor(!state.coverColor)],
    [t('Filtrar músicas de IA'), 'robot', () => setAIFilter(!state.aiFilter)],
  ];
}

function openPalette() {
  if (ui.palette) return ui.palette.querySelector('input').focus();
  let items = [];
  let sel = 0;
  let timer = null;
  const input = h('input', { placeholder: t('Buscar e tocar, ou escolher uma ação...') });
  const results = h('div.pal-results');
  const close = () => { ui.palette?.classList.add('out'); const p = ui.palette; ui.palette = null; setTimeout(() => p?.remove(), 200); };
  // Só marca o item escolhido; redesenhar a lista a cada movimento do mouse reiniciava a animação.
  const mark = () => {
    [...results.children].forEach((el, i) => el.classList.toggle('on', i === sel));
    results.children[sel]?.scrollIntoView({ block: 'nearest' });
  };
  const draw = () => {
    results.replaceChildren(...items.map((it, i) => h('button.pal-item', {
      onclick: () => { it.run(); close(); },
      onmousemove: () => { if (sel !== i) { sel = i; mark(); } },
    }, it.thumb !== undefined ? img(it.thumb, '.pal-thumb') : icon(it.icon), h('div.txt', {}, h('div.t', {}, it.title), it.sub ? h('div.s', {}, it.sub) : null))));
    mark();
  };
  const showActions = (q = '') => {
    items = quickActions().filter(([t]) => t.toLowerCase().includes(q.toLowerCase()))
      .map(([title, ic, run]) => ({ title, icon: ic, run }));
    sel = 0;
    draw();
  };
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    showActions(q);
    if (q.length < 2) return;
    timer = setTimeout(async () => {
      const found = await search(q).catch(() => []);
      if (input.value.trim() !== q) return;
      const actions = items;
      items = [...hideAI(found).slice(0, 8).map((t) => ({ title: t.title, sub: t.subtitle, thumb: t.thumb || '', run: () => openItem(t) })), ...actions];
      sel = 0;
      draw();
    }, 250);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); mark(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
    if (e.key === 'Enter' && items[sel]) { items[sel].run(); close(); }
  });
  ui.palette = h('div.palette', { onclick: (e) => { if (e.target === ui.palette) close(); } },
    h('div.pal-box', {}, h('label.pal-input', {}, icon('search'), input, h('span.k', {}, 'Esc')), results));
  shadow.append(ui.palette);
  showActions();
  input.focus();
}

// ---------- Estatísticas (ficam só neste computador) ----------
function loadStats() {
  try { return JSON.parse(localStorage.getItem('vulpi-stats')) || { songs: {}, days: {} }; } catch { return { songs: {}, days: {} }; }
}
let stats = null;
let statsDirty = 0;
const today = () => new Date().toISOString().slice(0, 10);

function trackStats(s, prev) {
  if (!stats) stats = loadStats();
  if (!s) return;
  const song = stats.songs[s.videoId] ||= { title: s.title, artist: s.artist, thumb: s.thumb, secs: 0, plays: 0 };
  if (!prev || prev.videoId !== s.videoId) song.plays++;
  if (s.playing) {
    song.secs += 0.5;
    stats.days[today()] = (stats.days[today()] || 0) + 0.5;
  }
  if (++statsDirty >= 20) {
    statsDirty = 0;
    try { localStorage.setItem('vulpi-stats', JSON.stringify(stats)); } catch {}
  }
}

const hours = (secs) => (secs >= 3600
  ? `${(secs / 3600).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} h`
  : `${Math.round(secs / 60)} min`);

async function screenStats() {
  if (!stats) stats = loadStats();
  const songs = Object.entries(stats.songs).map(([videoId, s]) => ({ videoId, ...s }));
  const total = Object.values(stats.days).reduce((a, b) => a + b, 0);
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    return { label: d.toLocaleDateString(LOCALE, { weekday: 'short' }).replace('.', ''), secs: stats.days[key] || 0 };
  });
  const week = days.reduce((a, d) => a + d.secs, 0);
  const max = Math.max(1, ...days.map((d) => d.secs));
  const artists = {};
  songs.forEach((s) => { artists[s.artist] = (artists[s.artist] || 0) + s.secs; });
  const topArtists = Object.entries(artists).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topSongs = songs.sort((a, b) => b.secs - a.secs).slice(0, 10)
    .map((s) => ({ ...s, subtitle: `${s.artist} • ${s.plays}x`, duration: hours(s.secs), play: { watchEndpoint: { videoId: s.videoId } } }));
  if (!songs.length) return [h('h1.page-title', {}, t('Estatísticas')), h('div.empty', {}, t('Ouça umas músicas e volte aqui. Os dados ficam só neste computador.'))];
  return [
    h('h1.page-title', {}, t('Estatísticas')),
    h('div.stat-tiles', {},
      h('div.stat', {}, h('div.label', {}, t('Esta semana')), h('div.stat-v', {}, hours(week))),
      h('div.stat', {}, h('div.label', {}, t('Total')), h('div.stat-v', {}, hours(total))),
      h('div.stat', {}, h('div.label', {}, t('Músicas diferentes')), h('div.stat-v', {}, String(songs.length)))),
    section(t('Últimos 7 dias'), h('div.week', {}, days.map((d, i) =>
      h('div.day', { title: hours(d.secs), style: `--i:${i}` }, h('div.day-bar', { style: `--h:${(d.secs / max) * 100}%` }), h('span', {}, d.label))))),
    section(t('Artistas mais ouvidos'), h('div.list', {}, topArtists.map(([name, secs], i) =>
      h('div.track', { style: `--i:${i}` }, h('span.n', {}, h('span.num', {}, String(i + 1))), h('div.info', {}, h('div.txt', {}, h('div.t', {}, name))), h('div.a'), h('div.d', {}, hours(secs)))))),
    section(t('Músicas mais ouvidas'), list(topSongs)),
  ];
}

// ---------- Página de artista ----------
async function screenArtist(id) {
  const a = await getArtist(id);
  return [
    h('div.pl-header.artist', {},
      img(a.thumb),
      h('div', {},
        h('div.label', {}, t('Artista')),
        h('h1', {}, a.title),
        a.info ? h('p', {}, a.info) : null,
        a.play ? h('button.cta', { onclick: () => playEndpoint(a.play) }, h('span.play-circle', {}, icon('play')), t('Ouvir agora')) : null)),
    a.songs.length ? section(t('Músicas'), list(a.songs.slice(0, 10))) : null,
    ...a.shelves.map((s) => section(s.title, list(s.items.slice(0, 6), true), () => go({ name: 'shelf', shelf: s }))),
  ];
}

// ---------- Arrastar música para uma playlist da barra lateral ----------
function makeDraggable(el, t) {
  if (!t.videoId) return el;
  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/vulpi-video', JSON.stringify({ videoId: t.videoId, title: t.title }));
    e.dataTransfer.effectAllowed = 'copy';
    shadow.host.classList.add('dragging');
  });
  el.addEventListener('dragend', () => shadow.host.classList.remove('dragging'));
  return el;
}

function makeDropTarget(el, p) {
  el.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/vulpi-video')) return;
    e.preventDefault();
    el.classList.add('drop');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.classList.remove('drop');
    const v = JSON.parse(e.dataTransfer.getData('text/vulpi-video') || 'null');
    if (!v) return;
    bump(el, 'dropped');
    try {
      if (p.browseId === 'VLLM') await likeVideo(v.videoId);
      else await addToPlaylist(p.browseId.replace(/^VL/, ''), v.videoId);
      toast(t('"{0}" adicionada a {1}', v.title, p.title));
    } catch {
      toast(t('Não deu para adicionar a {0}', p.title));
    }
  });
  return el;
}

// ---------- Visualizador (opcional; liga no menu) ----------
let viz = null;
function setVisualizer(on) {
  state.viz = on;
  saveFlag('vulpi-viz', on);
  ui.vizItem?.classList.toggle('on', on);
  if (on && !viz) {
    try {
      const video = document.querySelector('video');
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(video);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      viz = { ctx, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
      drawViz();
    } catch (e) {
      console.warn('[vulpi] visualizador', e);
      toast('Não deu para ligar o visualizador.');
    }
  }
  if (viz?.ctx.state === 'suspended') viz.ctx.resume();
}

function drawViz() {
  requestAnimationFrame(drawViz);
  if (!viz || !state.viz) return;
  viz.analyser.getByteFrequencyData(viz.data);
  const color = getComputedStyle(shadow.host).getPropertyValue('--accent').trim() || '#fd8f36';
  shadow.querySelectorAll('canvas.vinyl-viz, canvas.focus-viz').forEach((c) => {
    const g = c.getContext('2d');
    const n = 32;
    const w = c.width / n;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const v = viz.data[i + 2] / 255;
      const bh = Math.max(2, v * c.height);
      g.globalAlpha = 0.35 + v * 0.65;
      g.beginPath();
      g.roundRect(i * w + 1.5, c.height - bh, w - 3, bh, 2);
      g.fill();
    }
  });
}

// ---------- Filtro de músicas feitas por IA (opcional) ----------
// O YouTube Music não marca música de IA de um jeito confiável, então o filtro usa:
// 1) palavras no título/artista ("AI cover", "Suno", "gerado por IA"...) e
// 2) uma lista de artistas que você marcou como IA (botão no painel "Tocando agora").
// Com o filtro ligado, essas músicas somem das listas e são puladas se começarem a tocar.
const AI_RE = new RegExp([
  '\\b(ai|a\\.i\\.|ia)[\\s-]+(cover|covers|generated|music|song|songs|version|vers[aã]o|remix|vocals?|voice|gerad[ao]s?|m[uú]sica)\\b',
  '\\b(cover|vers[aã]o|voz|vocal)\\s+(de\\s+|com\\s+|by\\s+)?(ia|ai)\\b',
  '\\b(suno|udio|suno\\s?ai|mubert|boomy|soundraw|aiva)\\b',
  '(feito|criad[ao]|gerad[ao])s?\\s+(por|com)\\s+(ia|intelig[eê]ncia artificial)',
  'ai[\\s-]generated|artificial intelligence|\\((ai|ia)\\)|\\[(ai|ia)\\]',
].join('|'), 'i');

function loadAIBlock() {
  try { return new Set(JSON.parse(localStorage.getItem('vulpi-ai-block')) || []); } catch { return new Set(); }
}
const aiBlock = loadAIBlock();

// Resultado do selo "IA" por música (true/false), guardado entre aberturas.
const aiTags = (() => { try { return JSON.parse(localStorage.getItem('vulpi-ai-tags')) || {}; } catch { return {}; } })();
let aiTagsTimer = null;
function saveAITags() {
  clearTimeout(aiTagsTimer);
  aiTagsTimer = setTimeout(() => { try { localStorage.setItem('vulpi-ai-tags', JSON.stringify(aiTags)); } catch {} }, 2000);
}

// Pergunta ao app se o YouTube marcou a música como IA (null = não deu para saber).
async function checkAITag(videoId) {
  if (!videoId) return false;
  if (videoId in aiTags) return aiTags[videoId];
  const v = await bridge.ask('aitag', { videoId }, 20000).catch(() => null);
  if (typeof v === 'boolean') { aiTags[videoId] = v; saveAITags(); }
  return v === true;
}

// Confere aos poucos (2 de cada vez) as músicas de uma lista na tela e esconde as marcadas como IA.
const aiQueue = [];
let aiWorkers = 0;
function scanAI(listEl) {
  for (const el of listEl.querySelectorAll('.track[data-vid]')) {
    const vid = el.dataset.vid;
    if (vid && !(vid in aiTags)) aiQueue.push(el);
    else if (aiTags[vid]) hideAIRow(el);
  }
  while (aiWorkers < 2 && aiQueue.length) aiWorker();
}
async function aiWorker() {
  aiWorkers++;
  while (aiQueue.length) {
    const el = aiQueue.shift();
    if (!el.isConnected || !state.aiFilter) continue;
    if (await checkAITag(el.dataset.vid)) hideAIRow(el);
  }
  aiWorkers--;
}
function hideAIRow(el) {
  if (!state.aiFilter || el.classList.contains('ai-hide')) return;
  el.classList.add('ai-hide');
  setTimeout(() => el.remove(), 450);
}

function isAI(t) {
  if (t.videoId && aiTags[t.videoId]) return true;
  const text = `${t.title || ''} ${t.subtitle || t.artist || ''}`;
  if (AI_RE.test(text)) return true;
  const low = text.toLowerCase();
  for (const name of aiBlock) if (name.length >= 3 && low.includes(name)) return true;
  return false;
}

const hideAI = (items) => (state.aiFilter ? items.filter((t) => !isAI(t)) : items);

function setAIFilter(on) {
  state.aiFilter = on;
  saveFlag('vulpi-ai-filter', on);
  ui.aiBtn?.classList.toggle('on', on);
  if (ui.aiBtn) ui.aiBtn.title = on ? t('Filtro de IA ligado (clique para desligar)') : t('Filtrar músicas feitas por IA');
  shadow.host.classList.toggle('ai-filter', on);
  toast(on ? t('Filtro de IA ligado') : t('Filtro de IA desligado'));
  renderMain();
  lastPanel = '';
  renderPanel();
}

// Marca o artista da música atual como IA: entra na lista, some das listas e a música é pulada.
function markAIArtist(s) {
  const name = (s.artist || '').split(/,| e | & | feat\.? /i)[0].trim().toLowerCase();
  if (name.length < 3) return;
  aiBlock.add(name);
  try { localStorage.setItem('vulpi-ai-block', JSON.stringify([...aiBlock])); } catch {}
  toast(t('"{0}" marcado como IA', s.artist));
  if (!state.aiFilter) setAIFilter(true);
  else renderMain();
  playerCmd.next();
}

// Música de IA começou a tocar com o filtro ligado: pula.
async function skipAI(s) {
  if (!state.aiFilter || !s) return;
  const ai = isAI({ title: s.title, artist: s.artist }) || await checkAITag(s.videoId);
  if (!ai || state.now?.videoId !== s.videoId) return;
  // Só esconde: a música continua na playlist e volta a aparecer se o filtro for desligado.
  aiTags[s.videoId] = true;
  saveAITags();
  ui.content.querySelectorAll(`.track[data-vid="${CSS.escape(s.videoId)}"]`).forEach(hideAIRow);
  toast('Pulei uma música marcada como IA');
  playerCmd.next();
}

// Já confere as próximas da fila, para pular sem esperar.
function prefetchQueueAI() {
  if (!state.aiFilter) return;
  const q = playerQueue();
  const at = q.findIndex((i) => i.selected);
  q.slice(at + 1, at + 4).forEach((t) => { const vid = t.play?.watchEndpoint?.videoId; if (vid) checkAITag(vid); });
}
