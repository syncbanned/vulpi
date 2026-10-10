// Interface do Vulpi, desenhada por cima do YouTube Music. Visual mínimo: listas de texto,
// capas só no player e no topo da playlist, laranja do logo só no essencial.
// Usa data.js (dados), player.js (player oficial) e icons.js. CSS em app.css (VULPI_CSS).

const tt = window.trustedTypes
  ? trustedTypes.createPolicy('vulpi-ui', { createHTML: (s) => s })
  : { createHTML: (s) => s };

// h('div.classe', { onclick, ... }, filhos...)
function h(tag, props, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

function icon(name) {
  const s = h('span.ic');
  s.innerHTML = tt.createHTML(ICONS[name]);
  return s;
}

// Capa de "Músicas que gostei": no lugar do degradê roxo do YouTube, um degradê laranja do tema com um coração.
const isLiked = (src) => /liked-songs/.test(src || '');
const img = (src, cls = '') => (isLiked(src) ? h('div.ph.liked-art' + cls, {}, icon('heartFill'))
  : src ? h('img' + cls, { src, loading: 'lazy', referrerPolicy: 'no-referrer' }) : h('div.ph' + cls));
const fmt = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

// ---------- Estado ----------
const state = {
  route: { name: 'home' },
  history: [],
  playlists: null,
  home: null,
  recent: null,
  explore: null,
  now: null,
};

let shadow, ui = {};

function go(route, push = true) {
  if (push) state.history.push(state.route);
  state.route = route;
  renderMain(push ? 'fwd' : 'back');
}

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// A tela atual sai deslizando para o lado contrário de onde a nova vem (só CSS + tempo fixo).
function leave(el, dir) {
  if (calm() || !el.firstChild) return Promise.resolve();
  el.dataset.leave = dir;
  return new Promise((r) => setTimeout(r, 150));
}

function back() {
  if (state.history.length) go(state.history.pop(), false);
}

// Clique num card ou linha: toca ou abre a página certa, sempre dentro do Vulpi
// (a interface original do YouTube Music nunca aparece).
function openItem(item) {
  const type = item.pageType || '';
  if (item.browseId && (/ARTIST|USER_CHANNEL/.test(type) || item.browseId.startsWith('UC'))) return go({ name: 'artist', id: item.browseId });
  if (item.browseId && (/PLAYLIST|ALBUM|AUDIOBOOK|PODCAST/.test(type) || !item.play)) return go({ name: 'playlist', id: item.browseId });
  if (item.play) playEndpoint(item.play);
}

function playItem(item) {
  if (item.play) return playEndpoint(item.play);
  if (item.browseId) getPlaylist(item.browseId).then((p) => playEndpoint(p.play));
}

// ---------- Barra lateral ----------
function renderSide() {
  const nav = [
    ['home', 'home', t('Início')],
    ['explore', 'search', t('Explorar')],
    ['library', 'library', t('Biblioteca')],
  ];
  ui.nav.replaceChildren(...nav.map(([name, ic, label]) =>
    h('button.nav-item' + (state.route.name === name ? '.active' : ''), { onclick: () => go({ name }) },
      icon(name === 'home' && state.route.name !== 'home' ? 'homeOutline' : ic), h('span', {}, label))));
  // A pílula de fundo desliza até o item ativo (some nas outras telas).
  const active = ui.nav.querySelector('.active');
  ui.navPill.style.opacity = active ? '1' : '0';
  if (active) ui.navPill.style.transform = `translateY(${active.offsetTop}px)`;

  // Playlists só com o nome; um ponto laranja marca a que está tocando.
  const playing = 'VL' + (new URLSearchParams(location.search).get('list') || '');
  ui.plList.replaceChildren(...(state.playlists || []).map((p) => makeDropTarget(
    h('button.pl-item' + (state.route.name === 'playlist' && state.route.id === p.browseId ? '.active' : '')
      + (p.browseId === playing ? '.playing' : ''),
      { onclick: () => openItem(p), title: p.title },
      h('span', {}, p.title)), p)));
}

// ---------- Telas ----------
function section(title, kids, more) {
  return h('div.section', {},
    h('div.sec-head', {}, h('h2.label', {}, title), more ? h('button', { onclick: more }, t('Ver tudo')) : null),
    kids);
}

// Linha de texto (sem capa): número, título, artista, álbum, duração.
// Serve para músicas, playlists, álbuns e artistas.
function row(t, i) {
  const now = state.now && t.videoId && state.now.videoId === t.videoId;
  return makeDraggable(h('button.track' + (now ? '.now' : ''), { onclick: () => openItem(t), title: t.title, 'data-vid': t.videoId, style: `--i:${Math.min(i, 24)}` },
    h('span.n', {}, h('span.num', {}, String(i + 1)), eq(), icon('play')),
    info(t.thumb, t.title, t.subtitle),
    h('div.a', {}, t.album || ''),
    h('div.d', {}, t.duration || '')), t);
}

// Título + artista, com a miniatura pequena à esquerda (aparece só com o botão de miniaturas ligado).
function info(thumb, title, sub) {
  return h('div.info', {},
    img(thumb, '.thumb'),
    h('div.txt', {}, h('div.t', {}, title), h('div.s', {}, sub)));
}

// Barrinhas dançando no lugar do número da música que está tocando.
const eq = () => h('span.eq', {}, h('i'), h('i'), h('i'));

function list(items, two) {
  const el = h('div.list' + (two ? '.two' : ''), {}, hideAI(items).map(row));
  // Com o filtro de IA ligado, confere o selo "IA" do YouTube em segundo plano.
  if (state.aiFilter) setTimeout(() => el.isConnected && scanAI(el), 600);
  return el;
}

// Ilustração do banner: sol laranja atrás de montanhas grafite. O sol muda de lugar por slide.
function bannerArt(i) {
  const cx = [600, 660, 540][i % 3];
  const cy = [96, 120, 84][i % 3];
  const svg = `<svg class="art" viewBox="0 0 800 208" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--sky-1)"/><stop offset="1" style="stop-color:var(--sky-2)"/></linearGradient>
      <radialGradient id="sun" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#ffb06a"/><stop offset="1" stop-color="#e5762a"/></radialGradient>
      <linearGradient id="fade" x1="0" x2="1"><stop offset=".3" style="stop-color:var(--panel)"/><stop offset=".72" style="stop-color:var(--panel)" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="800" height="208" fill="url(#sky)"/>
    <circle cx="${cx}" cy="${cy}" r="34" fill="url(#sun)" opacity=".85"/>
    <path d="M300 208 470 104l60 34 70-68 90 60 110-52v130z" style="fill:var(--mount-1)"/>
    <path d="M380 208 520 136l50 22 80-52 70 40 100-26v88z" style="fill:var(--mount-2)"/>
    <path d="M440 208 560 168l60 15 70-29 110 34v20z" style="fill:var(--mount-3)"/>
    <rect width="800" height="208" fill="url(#fade)"/>
  </svg>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = tt.createHTML(svg);
  return wrap.firstChild;
}

let bannerTimer = null;
function banner(items) {
  let idx = 0;
  const el = h('div.banner');
  const draw = () => {
    const it = items[idx];
    el.replaceChildren(
      bannerArt(idx),
      h('div.b-info', {},
        h('div.label', {}, t('Playlist em destaque')),
        h('h1', {}, it.title),
        h('p', {}, it.subtitle),
        h('button.cta', { onclick: () => playItem(it) }, h('span.play-circle', {}, icon('play')), t('Ouvir agora'))),
      items.length > 1 ? h('div.dots', {}, items.map((_, i) =>
        h('button' + (i === idx ? '.on' : ''), { onclick: () => show(i), 'aria-label': t('Destaque {0}', i + 1) }))) : null);
  };
  const show = (i) => {
    if (i === idx) return;
    el.classList.add('out');
    setTimeout(() => { idx = i; draw(); el.classList.remove('out'); el.classList.add('in'); }, 260);
    setTimeout(() => el.classList.remove('in'), 800);
  };
  draw();
  clearInterval(bannerTimer);
  if (items.length > 1) bannerTimer = setInterval(() => el.isConnected ? show((idx + 1) % items.length) : clearInterval(bannerTimer), 9000);
  return el;
}

const loading = () => h('div.skeleton', {}, h('i.sk-title'), [...Array(7)].map((_, i) => h('i.sk-row', { style: `--i:${i}` })));
const errorBox = (e) => h('div.empty', {}, t('Não deu para carregar agora.') + ' ', h('button.btn', { onclick: () => renderMain() }, t('Tentar de novo')));

// Carrega e guarda no estado; recarrega se tiver mais de 5 minutos (para Recentes etc. não ficarem velhos).
const loadedAt = {};
async function load(key, fn) {
  if (!state[key] || Date.now() - (loadedAt[key] || 0) > 5 * 60000) {
    state[key] = await fn();
    loadedAt[key] = Date.now();
  }
  return state[key];
}

async function screenHome() {
  const [home, recent, pls] = await Promise.all([
    load('home', () => getShelves('FEmusic_home')),
    load('recent', getHistory).catch(() => []),
    load('playlists', getPlaylists).catch(() => []),
  ]);
  const playlistsFromHome = home.flatMap((s) => s.items).filter((i) => /PLAYLIST|ALBUM/.test(i.pageType || ''));
  const featured = [...playlistsFromHome, ...pls.filter((p) => p.browseId !== 'VLLM')].slice(0, 3);
  // Início enxuta: destaque, Recentes e uma seção da sua Início. O resto fica em Explorar.
  const first = home.find((s) => s.items.length);
  return [
    featured.length ? banner(featured) : null,
    recent.length ? section(t('Recentes'), list(recent.slice(0, 6), true), () => go({ name: 'recent' })) : null,
    first ? section(first.title, list(first.items.slice(0, 6), true), () => go({ name: 'shelf', shelf: first })) : null,
  ];
}

async function screenExplore() {
  const shelves = await load('explore', () => getShelves('FEmusic_explore'));
  return [h('h1.page-title', {}, t('Explorar')),
    ...shelves.filter((s) => s.items.length).map((s) =>
      section(s.title, list(s.items.slice(0, 6), true), () => go({ name: 'shelf', shelf: s })))];
}

async function screenLibrary() {
  const pls = await load('playlists', getPlaylists);
  return [h('h1.page-title', {}, t('Biblioteca')), section(t('Suas playlists'), list(pls))];
}

async function screenPlaylist(id) {
  const p = await getPlaylist(id);
  return [
    h('div.pl-header', {},
      img(p.thumb),
      h('div', {},
        h('div.label', {}, id.startsWith('MPRE') ? t('Álbum') : t('Playlist')),
        h('h1', {}, p.title),
        h('p', {}, p.subtitle),
        h('p', {}, p.info),
        h('button.cta', { onclick: () => playEndpoint(p.play) }, h('span.play-circle', {}, icon('play')), t('Ouvir agora')))),
    p.tracks.length ? list(p.tracks) : h('div.empty', {}, t('Nada por aqui ainda.')),
  ];
}

async function screenSearch(q) {
  const items = await search(q);
  if (!items.length) return [h('div.empty', {}, t('Nada encontrado para "{0}".', q))];
  return [h('h1.page-title', {}, `"${q}"`), section(t('Resultados'), list(items))];
}

async function screenRecent() {
  const recent = await load('recent', getHistory);
  return [h('h1.page-title', {}, t('Recentes')), list(recent)];
}

const screens = {
  home: screenHome,
  explore: screenExplore,
  library: screenLibrary,
  playlist: (r) => screenPlaylist(r.id),
  search: (r) => screenSearch(r.q),
  recent: screenRecent,
  shelf: async (r) => [h('h1.page-title', {}, r.shelf.title), list(r.shelf.items)],
  artist: (r) => screenArtist(r.id),
  stats: screenStats,
};

let renderId = 0;
async function renderMain(dir = 'fwd') {
  const id = ++renderId;
  const r = state.route;
  renderSide();
  ui.back.hidden = !state.history.length || r.name === 'home';
  if (r.name !== 'search') ui.search.value = '';
  // Carrega os dados enquanto a tela antiga sai; esqueleto só se demorar.
  const data = screens[r.name](r);
  data.catch(() => {});
  await leave(ui.content, dir);
  if (id !== renderId) return;
  ui.content.dataset.dir = dir;
  ui.content.replaceChildren();
  delete ui.content.dataset.leave;
  const slow = setTimeout(() => id === renderId && ui.content.replaceChildren(loading()), 120);
  ui.content.scrollTop = 0;
  try {
    const kids = await data;
    clearTimeout(slow);
    if (id === renderId) ui.content.replaceChildren(...kids.filter(Boolean));
  } catch (e) {
    clearTimeout(slow);
    console.warn('[vulpi]', e);
    if (id === renderId) ui.content.replaceChildren(errorBox(e));
  }
  if (id === renderId) renderSide();
}

// ---------- Vinil decorativo (canto direito, quando sobra espaço) ----------
function sleeveArt() {
  const svg = `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="vsky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--sky-1)"/><stop offset="1" style="stop-color:var(--sky-2)"/></linearGradient>
      <radialGradient id="vsun" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#ffb06a"/><stop offset="1" stop-color="#e5762a"/></radialGradient>
    </defs>
    <rect width="200" height="200" fill="url(#vsky)"/>
    <circle cx="128" cy="74" r="26" fill="url(#vsun)" opacity=".9"/>
    <path d="M-10 200 60 104l26 22 34-46 40 40 50-34v114z" style="fill:var(--mount-1)"/>
    <path d="M-10 200 40 150l30 14 40-36 34 26 66-30v76z" style="fill:var(--mount-2)"/>
    <path d="M-10 200 70 176l30 8 40-18 70 22v12z" style="fill:var(--mount-3)"/>
  </svg>`;
  const wrap = document.createElement('div');
  wrap.innerHTML = tt.createHTML(svg);
  return wrap.firstChild;
}

function buildVinyl() {
  ui.vinylLabel = h('div.label', {}, h('img', { src: VULPI_LOGO, alt: '', className: 'logo' }));
  return h('button.vinyl', { title: t('Tocar/pausar'), onclick: () => playerCmd.toggle() },
    h('div.disc', {}, h('div.spin', {}, ui.vinylLabel), h('div.shine')),
    h('div.sleeve', {}, sleeveArt(), h('div.sleeve-brand', {}, 'Vu', h('span.l', {}, 'l'), 'pi')),
    h('canvas.vinyl-viz', { width: 300, height: 44 }));
}

// ---------- Player ----------
function buildPlayer() {
  const p = {};
  p.thumb = h('div.ph');
  p.title = h('div.t', {}, t('Nada tocando'));
  p.artist = h('div.s', {}, t('Escolha uma música'));
  p.like = h('button.like', {
    title: t('Curtir'),
    onclick: () => {
      if (!state.now?.liked) burst(p.like);
      bump(p.like);
      playerCmd.like();
    },
  }, icon('heart'));
  p.play = h('button.ctl.main', { onclick: () => { bump(p.play); playerCmd.toggle(); }, title: t('Tocar/pausar') }, icon('play'));
  p.repeat = h('button.ctl.minor', { onclick: playerCmd.repeat, title: t('Repetir') }, icon('repeat'));
  p.cur = h('span.time', {}, '0:00');
  p.dur = h('span.time', {}, '0:00');
  p.fill = h('div.fill');
  p.knob = h('div.knob');
  p.tip = h('div.tip', {}, '0:00');
  p.bar = h('div.bar', {}, h('div.track-bg'), p.fill, p.knob, p.tip);
  p.queueBtn = h('button.ctl', { onclick: toggleQueue, title: t('Fila') }, icon('queue'));

  // Clicar ou arrastar na barra muda a posição.
  const seekAt = (e) => {
    const r = p.bar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  p.bar.addEventListener('pointerdown', (e) => {
    p.dragging = true;
    p.bar.setPointerCapture(e.pointerId);
    setProgress(seekAt(e));
  });
  p.bar.addEventListener('pointermove', (e) => {
    const f = seekAt(e);
    if (p.dragging) setProgress(f);
    // Balão com o tempo no ponto do mouse.
    p.tip.textContent = fmt(f * (state.now?.duration || 0));
    p.tip.style.left = `${f * 100}%`;
  });
  p.bar.addEventListener('pointerup', (e) => {
    p.dragging = false;
    playerCmd.seek(seekAt(e));
  });
  function setProgress(f) {
    p.fill.style.width = `${f * 100}%`;
    p.knob.style.left = `${f * 100}%`;
  }
  p.setProgress = setProgress;

  p.np = h('div.np', {}, p.thumb, h('div.meta', {}, p.title, p.artist), p.like);
  p.el = h('div.player.idle', {},
    p.np,
    h('div.controls', {},
      h('button.ctl.minor', { onclick: (e) => { bump(e.currentTarget); playerCmd.shuffle(); }, title: t('Aleatório') }, icon('shuffle')),
      h('button.ctl.big', { onclick: (e) => { bump(e.currentTarget); playerCmd.prev(); }, title: t('Anterior') }, icon('prev')),
      p.play,
      h('button.ctl.big', { onclick: (e) => { bump(e.currentTarget); playerCmd.next(); }, title: t('Próxima') }, icon('next')),
      p.repeat),
    h('div.right', {}, buildVolume(), p.cur, p.bar, p.dur,
      h('button.ctl', { title: t('Mini player'), onclick: (e) => { bump(e.currentTarget); bridge.send('mini'); } }, icon('mini')),
      h('button.ctl', { title: t('Modo foco (F)'), onclick: (e) => { bump(e.currentTarget); toggleFocus(true); } }, icon('focus')),
      p.queueBtn));
  return p;
}

function setText(el, v) { if (el.textContent !== v) el.textContent = v; }
function setIcon(btn, name) {
  if (btn.dataset.icon === name) return;
  const first = !btn.dataset.icon;
  btn.dataset.icon = name;
  const ic = icon(name);
  if (!first) ic.classList.add('swap'); // troca de ícone com giro (ex.: ▶ ⇄ ⏸)
  btn.replaceChildren(ic);
}

// Reinicia uma animação de CSS no elemento (por padrão a "mola" do clique).
function bump(el, cls = 'pop') {
  el.classList.remove(cls);
  void el.offsetWidth; // reinicia a animação
  el.classList.add(cls);
}

// Pontinhos laranja saindo do coração ao curtir.
function burst(el) {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const spark = h('span.spark', { style: `--dx:${Math.cos(a) * 20}px;--dy:${Math.sin(a) * 20}px` });
    el.append(spark);
    setTimeout(() => spark.remove(), 700);
  }
}

// Foto da conta, copiada da barra do site (ela carrega depois da página).
function updateAvatar() {
  if (ui.avatar.querySelector('img')) return;
  const src = document.querySelector('ytmusic-nav-bar img[src*="ggpht"], ytmusic-nav-bar img[src*="googleusercontent"]')?.src;
  if (src) ui.avatar.replaceChildren(h('img', { src, referrerPolicy: 'no-referrer' }));
}

function updatePlayer() {
  updateAvatar();
  const p = ui.player;
  const s = playerState();
  const prev = state.now;
  state.now = s;
  p.el.classList.toggle('idle', !s);
  shadow.host.classList.toggle('paused', !s?.playing); // equalizador para quando pausa
  sendState(s);
  trackStats(s, prev);
  checkSleep(s);
  updateVolumeUI();
  if (!s) return;
  highlightLyrics(s.time);
  if (!prev || prev.videoId !== s.videoId) {
    p.thumb.replaceWith(p.thumb = img(s.thumb));
    if (prev) bump(p.np, 'swap-in');
    // O selo do vinil mostra a capa da música atual.
    ui.vinylLabel.replaceChildren(img(s.thumb));
    renderSide(); // ponto na playlist que está tocando
    renderPanel();
    applyCoverColor();
    updateFocus(s);
    skipAI(s);
    prefetchQueueAI();
    // Destaca a música atual nas listas abertas.
    ui.content.querySelectorAll('.track[data-vid]').forEach((el) => el.classList.toggle('now', el.dataset.vid === s.videoId));
  } else if (s.thumb && p.thumb.src !== s.thumb && p.thumb.tagName === 'IMG') {
    p.thumb.src = s.thumb;
  } else if (s.thumb && p.thumb.tagName !== 'IMG') {
    p.thumb.replaceWith(p.thumb = img(s.thumb));
  }
  setText(p.title, s.title);
  setText(p.artist, s.artist);
  setIcon(p.play, s.playing ? 'pause' : 'play');
  setIcon(p.like, s.liked ? 'heartFill' : 'heart');
  p.like.classList.toggle('on', s.liked);
  setIcon(p.repeat, s.repeat === 'ONE' ? 'repeatOne' : 'repeat');
  p.repeat.classList.toggle('on', s.repeat !== 'NONE');
  setText(p.cur, fmt(s.time));
  setText(p.dur, fmt(s.duration));
  if (!p.dragging) p.setProgress(s.duration ? s.time / s.duration : 0);
  if (!ui.queue.hidden) renderQueue();
  if (state.panel === 'now') renderNowQueue();
}

// ---------- Painel da direita: "Tocando agora" ou "Letra" ----------
function savedPanel() {
  try { return localStorage.getItem('vulpi-panel') || 'now'; } catch { return 'now'; }
}

// mode: 'now' | 'lyrics' | 'off'
function setPanel(mode) {
  state.panel = mode;
  const open = mode !== 'off';
  ui.app.classList.toggle('with-panel', open);
  ui.panelBtn.classList.toggle('on', open);
  ui.panelBtn.title = open ? t('Esconder painel') : t('Mostrar painel');
  ui.tabs.forEach((t) => t.classList.toggle('on', t.dataset.mode === mode));
  const on = ui.tabs.find((t) => t.dataset.mode === mode);
  if (on) ui.tabPill.style.transform = `translateX(${on.offsetLeft - 4}px)`;
  try { localStorage.setItem('vulpi-panel', mode); } catch {}
  if (open) { ui.panelBody.dataset.mode = mode; renderPanel(); }
}

// Esconde o painel lembrando a aba, para o botão reabrir na mesma.
function closePanel() {
  if (state.panel !== 'off') state.lastPanel = state.panel;
  setPanel('off');
}

let lastPanel = '';
function renderPanel() {
  if (!ui.panelBody || state.panel === 'off') return;
  const s = state.now;
  const key = state.panel + (s?.videoId || '');
  if (key === lastPanel) return;
  lastPanel = key;
  bump(ui.panelBody, 'panel-in');
  if (!s) return ui.panelBody.replaceChildren(h('div.empty', {}, t('Nada tocando.')));
  if (state.panel === 'now') {
    ui.nowQueue = h('div.list');
    ui.panelBody.replaceChildren(
      h('div.now-art', {}, img(s.thumb.replace(/=w\d+-h\d+/, '=w544-h544'))),
      h('div.now-t', {}, s.title),
      h('div.now-s', {}, s.artist),
      h('button.ai-mark', { onclick: () => markAIArtist(s), title: t('Esconde e pula as músicas desse artista') }, icon('robot'), t('É IA? Bloquear artista')),
      h('div.label.up-next', {}, t('A seguir')),
      ui.nowQueue);
    queueSig2 = '';
    renderNowQueue();
  } else {
    const vid = s.videoId;
    ui.panelBody.replaceChildren(h('div.lyrics-head', {}, h('div.now-t', {}, s.title), h('div.now-s', {}, s.artist)), loading());
    lyricsFor(s).then((el) => {
      if (state.now?.videoId !== vid || state.panel !== 'lyrics') return;
      ui.panelBody.lastChild.replaceWith(el);
    }).catch(() => ui.panelBody.lastChild.replaceWith(h('div.empty', {}, t('Não deu para carregar a letra.'))));
  }
}

// Próximas 5 da fila, no painel "Tocando agora".
let queueSig2 = '';
function renderNowQueue() {
  if (!ui.nowQueue?.isConnected) return;
  const q = playerQueue();
  const at = q.findIndex((i) => i.selected);
  const next = hideAI(q.slice(at + 1)).slice(0, 5);
  const sig = next.map((i) => i.title).join('|');
  if (sig === queueSig2) return;
  queueSig2 = sig;
  ui.nowQueue.replaceChildren(...(next.length ? next.map((t, i) =>
    h('button.track', { onclick: () => playEndpoint(t.play), style: `--i:${i}` },
      info(t.thumb, t.title, t.artist),
      h('div.d', {}, t.duration))) : [h('div.empty', {}, t('Fim da fila.'))]));
}

// ---------- Fila ----------
function toggleQueue() {
  ui.queue.hidden = !ui.queue.hidden;
  ui.player.queueBtn.classList.toggle('on', !ui.queue.hidden);
  if (!ui.queue.hidden) renderQueue(true);
}

let queueSig = '';
function renderQueue(force) {
  const q = playerQueue();
  const sig = q.map((i) => i.title + i.selected).join('|');
  if (!force && sig === queueSig) return;
  queueSig = sig;
  ui.queueList.replaceChildren(...(q.length ? hideAI(q).map((t) =>
    h('button.track' + (t.selected ? '.now' : ''), { onclick: () => playEndpoint(t.play) },
      info(t.thumb, t.title, t.artist),
      h('div.d', {}, t.duration))) : [h('div.empty', {}, t('A fila está vazia.'))]));
  ui.queueList.querySelector('.now')?.scrollIntoView({ block: 'nearest' });
}

// Ícone da janela/aba: o logo do Vulpi no lugar do ícone do YouTube Music.
function setFavicon() {
  document.querySelectorAll('link[rel~="icon"]').forEach((l) => l.remove());
  document.head.append(h('link', { rel: 'icon', type: 'image/png', href: VULPI_ICON }));
}

// Tema claro/escuro, lembrado entre aberturas. Também pinta a barra de título do Edge.
function savedTheme() {
  try { return localStorage.getItem('vulpi-theme'); } catch { return null; }
}

function toggleTheme() {
  bump(ui.themeBtn);
  const light = !shadow.host.classList.contains('light');
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return setTheme(light);
  const r = ui.themeBtn.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  shadow.host.classList.add('vt'); // sem transições de cor durante o círculo
  const t = document.startViewTransition(() => setTheme(light));
  t.ready.then(() => document.documentElement.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
    { duration: 750, easing: 'cubic-bezier(.65, 0, .35, 1)', pseudoElement: '::view-transition-new(root)' },
  ));
  // O tema antigo afunda um pouco enquanto o novo cresce.
  t.ready.then(() => document.documentElement.animate(
    [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(.97)', filter: 'brightness(.7)' }],
    { duration: 750, easing: 'cubic-bezier(.65, 0, .35, 1)', pseudoElement: '::view-transition-old(root)' },
  ));
  t.finished.finally(() => shadow.host.classList.remove('vt'));
}

// Miniaturas pequenas nas listas (desligadas por padrão), lembradas entre aberturas.
function setThumbs(on) {
  shadow.host.classList.toggle('thumbs', on);
  ui.thumbBtn.classList.toggle('on', on);
  ui.thumbBtn.title = on ? t('Esconder miniaturas') : t('Mostrar miniaturas');
  try { localStorage.setItem('vulpi-thumbs', on ? '1' : '0'); } catch {}
}

function savedThumbs() {
  try { return localStorage.getItem('vulpi-thumbs') === '1'; } catch { return false; }
}

function setTheme(light) {
  shadow.host.classList.toggle('light', light);
  setIcon(ui.themeBtn, light ? 'moon' : 'sun');
  ui.themeBtn.title = light ? t('Tema escuro') : t('Tema claro');
  const bg = light ? '#faf8f6' : '#131211';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = bg; });
  try { localStorage.setItem('vulpi-theme', light ? 'light' : 'dark'); } catch {}
  paintAccent();
}

// ---------- Montagem ----------
function mount() {
  const host = h('div', { id: 'vulpi-host' });
  shadow = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(VULPI_CSS);
  shadow.adoptedStyleSheets = [sheet];

  ui.nav = h('nav.nav');
  ui.navPill = h('div.nav-pill');
  ui.plList = h('div.pl-list');
  ui.back = h('button.icon-btn', { onclick: back, title: t('Voltar'), hidden: true }, icon('back'));
  ui.search = h('input', {
    placeholder: t('Buscar músicas, artistas, álbuns...'),
    onkeydown: (e) => {
      if (e.key === 'Enter' && ui.search.value.trim()) go({ name: 'search', q: ui.search.value.trim() });
    },
  });
  ui.content = h('div.content');
  const item = (ic, label, onclick, k) => h('button', { onclick: () => { ui.menu.hidden = true; onclick(); } }, icon(ic), label, h('span.k', {}, k || ''));
  ui.sleepItem = h('button', { onclick: cycleSleep, title: t('Clique para trocar') }, icon('timer'), t('Timer de sono'), h('span.k', {}, t('desligado')));
  ui.colorItem = h('button.toggle', { onclick: () => setCoverColor(!state.coverColor) }, icon('palette'), t('Cor da capa'), h('span.k', {}, icon('check')));
  ui.aiBtn = h('button.icon-btn', { onclick: () => { bump(ui.aiBtn); setAIFilter(!state.aiFilter); } }, icon('robot'));
  ui.vizItem = h('button.toggle', { onclick: () => setVisualizer(!state.viz) }, icon('wave'), t('Visualizador'), h('span.k', {}, icon('check')));
  ui.menu = h('div.menu', { hidden: true },
    item('command', t('Busca rápida'), openPalette, 'Ctrl+K'),
    item('focus', t('Modo foco'), () => toggleFocus(true), 'F'),
    item('mini', t('Mini player'), () => bridge.send('mini')),
    item('chart', t('Estatísticas'), () => go({ name: 'stats' })),
    h('div.menu-sep'),
    ui.sleepItem, ui.colorItem, ui.vizItem,
    h('div.menu-sep'),
    item('globe', t('Idioma: Português'), switchLang));
  ui.panelBtn = h('button.icon-btn', {
    onclick: () => { bump(ui.panelBtn); state.panel === 'off' ? setPanel(state.lastPanel || 'now') : closePanel(); },
  }, icon('panel'));
  ui.tabPill = h('i.tab-pill');
  ui.tabs = [['now', t('Tocando agora')], ['lyrics', t('Letra')]].map(([mode, label]) =>
    h('button.tab', { 'data-mode': mode, onclick: () => { state.lastPanel = mode; setPanel(mode); } }, label));
  ui.panelBody = h('div.panel-body');
  ui.panel = h('aside.panel', {},
    h('div.panel-head', {},
      h('div.tabs', {}, ui.tabPill, ui.tabs),
      h('button.icon-btn', { title: t('Esconder painel'), onclick: closePanel }, icon('close'))),
    ui.panelBody);
  ui.thumbBtn = h('button.icon-btn', { onclick: () => { bump(ui.thumbBtn); setThumbs(!shadow.host.classList.contains('thumbs')); } }, icon('image'));
  ui.themeBtn = h('button.icon-btn', { onclick: toggleTheme, title: t('Trocar tema') });
  ui.avatar = h('button.avatar', { onclick: () => { ui.menu.hidden = !ui.menu.hidden; }, title: t('Conta') }, icon('user'));
  ui.player = buildPlayer();
  ui.queueList = h('div.queue-list');
  ui.queue = h('div.queue', { hidden: true },
    h('header', {}, h('span.label', {}, t('Fila')), h('button.ctl', { onclick: toggleQueue, title: t('Fechar') }, icon('close'))),
    ui.queueList);

  const app = ui.app = h('div.app', {},
    h('aside.side', {},
      h('div.brand', {}, h('img', { src: VULPI_LOGO, alt: '' }), h('span', {}, 'Vu', h('span.l', {}, 'l'), 'pi')),
      h('div.nav-wrap', {}, ui.navPill, ui.nav),
      h('div.label', {}, t('Playlists')),
      ui.plList),
    h('main.main', {},
      h('div.top', {}, ui.back,
        h('label.search', {}, icon('search'), ui.search),
        h('button.icon-btn.menu-btn', { title: t('Menu (Ctrl+K)'), onclick: (e) => { bump(e.currentTarget); openPalette(); } }, icon('menu')),
        h('div.spacer'), ui.aiBtn, ui.panelBtn, ui.thumbBtn, ui.themeBtn, ui.avatar),
      ui.content, ui.menu, buildVinyl()),
    ui.panel,
    ui.player.el,
    ui.queue);
  shadow.append(app);

  // Teclas digitadas na nossa interface não vão para os atalhos do site.
  for (const ev of ['keydown', 'keyup', 'keypress']) host.addEventListener(ev, (e) => e.stopPropagation());
  document.documentElement.append(host);
  document.documentElement.classList.add('vulpi-ui');
  document.documentElement.classList.remove('vulpi-boot');
  setFavicon();
  setTheme(savedTheme() === 'light');
  setThumbs(savedThumbs());
  state.panel = 'off';
  requestAnimationFrame(() => setPanel(savedPanel()));
  setCoverColor(savedFlag('vulpi-cover-color'));
  state.aiFilter = savedFlag('vulpi-ai-filter');
  ui.aiBtn.classList.toggle('on', state.aiFilter);
  ui.aiBtn.title = state.aiFilter ? t('Filtro de IA ligado (clique para desligar)') : t('Filtrar músicas feitas por IA');
  ui.vizItem.classList.toggle('on', savedFlag('vulpi-viz'));
  // O visualizador só pode ligar depois de um clique (senão o navegador deixa o áudio mudo).
  shadow.addEventListener('pointerdown', () => { if (savedFlag('vulpi-viz') && !viz) setVisualizer(true); }, { once: true });

  // Fecha o menu ao clicar fora.
  shadow.addEventListener('pointerdown', (e) => {
    if (!ui.menu.hidden && !e.composedPath().some((n) => n === ui.menu || n === ui.avatar)) ui.menu.hidden = true;
  });
  // Botão "voltar" do mouse.
  window.addEventListener('mouseup', (e) => { if (e.button === 3) back(); });
  window.addEventListener('keydown', (e) => {
    const typing = e.composedPath()[0]?.tagName === 'INPUT';
    if (e.ctrlKey && e.code === 'KeyK') { e.preventDefault(); e.stopPropagation(); openPalette(); }
    if (e.code === 'KeyF' && !typing && !e.ctrlKey && !e.altKey) toggleFocus();
    if (e.code === 'Escape' && state.focus) toggleFocus(false);
    // Espaço = tocar/pausar, fora de campos de texto.
    if (e.code === 'Space' && !typing) {
      e.preventDefault();
      e.stopPropagation();
      playerCmd.toggle();
    }
  }, true);

  renderMain();
  load('playlists', getPlaylists).then(renderSide).catch(() => {});
  setInterval(updatePlayer, 500);
}

// Tela de erro do Vulpi (no lugar da interface original do site), com botão para recarregar.
function fatal(title, detail) {
  document.getElementById('vulpi-fatal')?.remove();
  const box = document.createElement('div');
  box.id = 'vulpi-fatal';
  const light = (() => { try { return localStorage.getItem('vulpi-theme') === 'light'; } catch { return false; } })();
  box.style.cssText = `position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
    background:${light ? '#faf8f6' : '#131211'};color:${light ? '#1e1a17' : '#f2eeea'};font:15px 'Segoe UI',system-ui,sans-serif;text-align:center;padding:24px`;
  const logo = document.createElement('img');
  logo.src = VULPI_LOGO;
  logo.style.cssText = `width:72px;height:72px;${light ? 'filter:brightness(.12)' : ''}`;
  const h1 = document.createElement('div');
  h1.textContent = title;
  h1.style.cssText = 'font-size:20px;font-weight:600';
  const p = document.createElement('div');
  p.textContent = detail || '';
  p.style.cssText = `color:${light ? '#6c665f' : '#8f8a85'}`;
  const btn = document.createElement('button');
  btn.textContent = t('Recarregar');
  btn.style.cssText = 'margin-top:8px;padding:10px 22px;border:0;border-radius:20px;background:#fd8f36;color:#1e1a17;font:inherit;font-weight:600;cursor:pointer';
  btn.onclick = () => location.reload();
  box.append(logo, h1, p, btn);
  document.documentElement.append(box);
}

// Monta quando o site carregar. Até lá a página fica escondida atrás da tela de abertura do Vulpi.
// Sem login: avisa o app, que abre o login. Sem internet ou erro: tela de erro do Vulpi.
(function boot(started = Date.now()) {
  let logged;
  try { logged = window.ytcfg?.get?.('LOGGED_IN'); } catch {}
  if (logged === true && document.body && document.querySelector('ytmusic-app')) {
    try {
      mount();
    } catch (e) {
      console.warn('[vulpi] erro ao montar', e);
      fatal(t('Algo deu errado ao abrir o Vulpi.'), String(e?.message || e));
    }
    return;
  }
  if (logged === false) {
    // O app fecha esta janela e abre o login. Sem ponte (não deveria acontecer), mostra o aviso.
    if (bridge.ok()) bridge.send('loggedOut');
    else fatal(t('Algo deu errado ao abrir o Vulpi.'), '');
    return;
  }
  if (Date.now() - started > 25000) return fatal(t('Sem conexão com o YouTube Music.'), t('Confira a internet e tente de novo.'));
  setTimeout(() => boot(started), 200);
})();
