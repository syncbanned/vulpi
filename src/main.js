// O Vulpi não tem janela própria: ele abre o YouTube Music no Edge (src/edge.js),
// aplica o tema e a interface (src/theme.css, src/ui) e fica na bandeja.
// A página conversa com o app por uma "ponte" (Runtime.addBinding): daí saem a bandeja,
// as notificações, o mini player e o Discord. Fechou o Edge, o Vulpi fecha.
const { app, Tray, Menu, Notification, BrowserWindow, dialog, shell, nativeImage, net, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const { isAllowed } = require('./allow');
const { launch, launchPlain, findEdge, injectScript, injectStyle, isLoggedIn } = require('./edge');
const { DiscordPresence, activityFor } = require('./discord');

const HOME = 'https://music.youtube.com/';
const BG = '#131211';
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const CSS = fs.readFileSync(path.join(__dirname, 'theme.css'), 'utf8') +
  `:root { --vulpi-logo: url("data:image/png;base64,${fs.readFileSync(path.join(ASSETS_DIR, 'logo.png')).toString('base64')}"); }`;
const UI = require('./ui');
const ASSETS = path.join(__dirname, '..', 'assets');

let profileDir;
let logFile;
let configFile;
let edge = null;      // Edge com controle
let mainTarget = null;
let mainSession = null;
let tray = null;
let mini = null;      // janela do mini player
let player = {};      // último estado do player mandado pela página
let sleepChoice = 0;  // opção do timer de sono escolhida na bandeja
let quitting = false;
const hidden = process.argv.includes('--hidden'); // aberto com o Windows: começa minimizado
const discord = new DiscordPresence((...a) => log(...a));

// Idioma: o da interface (mandado pela página) ou, antes disso, o do Windows.
const lang = () => player.lang || (/^pt/i.test(app.getLocale()) ? 'pt' : /^de/i.test(app.getLocale()) ? 'de' : 'en');
const EN = {
  'Entre na sua conta do YouTube Music': 'Sign in to your YouTube Music account',
  'Vai abrir uma janela do Edge. Clique em "Fazer login", entre com a sua conta e depois feche a janela. O Vulpi abre de novo, já logado.':
    'An Edge window will open. Click "Sign in", sign in to your account and then close the window. Vulpi will reopen, already signed in.',
  'Fazer login': 'Sign in',
  'Sair': 'Quit',
  'O Vulpi precisa do Microsoft Edge, que não foi encontrado. Instale o Edge em microsoft.com/edge e abra o Vulpi de novo.':
    'Vulpi needs Microsoft Edge, which was not found. Install Edge from microsoft.com/edge and open Vulpi again.',
  'Nada tocando': 'Nothing playing',
  'Pausar': 'Pause',
  'Tocar': 'Play',
  'Próxima': 'Next',
  'Anterior': 'Previous',
  'Curtir': 'Like',
  'Descurtir': 'Unlike',
  'Mini player': 'Mini player',
  'Fechar mini player': 'Close mini player',
  'Modo foco': 'Focus mode',
  'Timer de sono': 'Sleep timer',
  'Desligado': 'Off',
  '15 minutos': '15 minutes',
  '30 minutos': '30 minutes',
  '60 minutos': '60 minutes',
  'Fim da música': 'End of song',
  'Configurações': 'Settings',
  'Notificações ao trocar de música': 'Notify on song change',
  'Mostrar no Discord': 'Show on Discord',
  'Abrir com o Windows': 'Open with Windows',
  'Abrir arquivo de configurações': 'Open settings file',
  'Mostrar Vulpi': 'Show Vulpi',
  'Fechar': 'Quit',
};
const DE = {
  'Entre na sua conta do YouTube Music': 'Melde dich bei deinem YouTube-Music-Konto an',
  'Vai abrir uma janela do Edge. Clique em "Fazer login", entre com a sua conta e depois feche a janela. O Vulpi abre de novo, já logado.':
    'Ein Edge-Fenster öffnet sich. Klicke auf „Anmelden“, melde dich mit deinem Konto an und schließe dann das Fenster. Vulpi öffnet sich danach angemeldet wieder.',
  'Fazer login': 'Anmelden',
  'Sair': 'Beenden',
  'O Vulpi precisa do Microsoft Edge, que não foi encontrado. Instale o Edge em microsoft.com/edge e abra o Vulpi de novo.':
    'Vulpi benötigt Microsoft Edge, das nicht gefunden wurde. Installiere Edge von microsoft.com/edge und öffne Vulpi erneut.',
  'Nada tocando': 'Nichts wird abgespielt',
  'Pausar': 'Pause',
  'Tocar': 'Abspielen',
  'Próxima': 'Weiter',
  'Anterior': 'Zurück',
  'Curtir': 'Mag ich',
  'Descurtir': 'Mag ich nicht mehr',
  'Mini player': 'Miniplayer',
  'Fechar mini player': 'Miniplayer schließen',
  'Modo foco': 'Fokusmodus',
  'Timer de sono': 'Sleep-Timer',
  'Desligado': 'Aus',
  '15 minutos': '15 Minuten',
  '30 minutos': '30 Minuten',
  '60 minutos': '60 Minuten',
  'Fim da música': 'Songende',
  'Configurações': 'Einstellungen',
  'Notificações ao trocar de música': 'Bei Songwechsel benachrichtigen',
  'Mostrar no Discord': 'Auf Discord anzeigen',
  'Abrir com o Windows': 'Mit Windows starten',
  'Abrir arquivo de configurações': 'Einstellungsdatei öffnen',
  'Mostrar Vulpi': 'Vulpi anzeigen',
  'Fechar': 'Beenden',
};
const tr = (s) => (lang() === 'pt' ? s : (lang() === 'de' ? DE : EN)[s] || s);

// ---------- Registro e configurações ----------
// Registro simples em %APPDATA%\Vulpi\vulpi.log, para investigar problemas.
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
  try { fs.appendFileSync(logFile, line); } catch {}
}

// %APPDATA%\Vulpi\config.json
const VULPI_DISCORD_ID = '1558397030429229168';
const config = { notifications: true, discord: true, discordClientId: VULPI_DISCORD_ID, openAtLogin: false };
function loadConfig() {
  try { Object.assign(config, JSON.parse(fs.readFileSync(configFile, 'utf8'))); } catch {}
}
function saveConfig() {
  try { fs.writeFileSync(configFile, JSON.stringify(config, null, 2)); } catch {}
}

// O ID do aplicativo do Discord é só número.
const discordId = () => (/^\d{15,25}$/.test(String(config.discordClientId).trim()) ? String(config.discordClientId).trim() : VULPI_DISCORD_ID);

function openOutside(url) {
  if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
}

// ---------- Edge ----------
// Abre o Edge puro para o login. Com o controle ligado o Google bloqueia.
let loggingIn = false;
async function login() {
  if (loggingIn) return;
  loggingIn = true;
  if (edge) {
    const old = edge;
    edge = null;
    await old.send('Browser.close').catch(() => {});
    await new Promise((res) => (old.proc.exitCode !== null ? res() : old.proc.once('exit', res)));
  }
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Vulpi',
    message: tr('Entre na sua conta do YouTube Music'),
    detail: tr('Vai abrir uma janela do Edge. Clique em "Fazer login", entre com a sua conta e depois feche a janela. O Vulpi abre de novo, já logado.'),
    buttons: [tr('Fazer login'), tr('Sair')],
  });
  if (response === 1) return app.quit();
  launchPlain({ url: HOME, profileDir }).once('exit', start);
}

async function onPage(targetInfo) {
  const { sessionId } = await edge.send('Target.attachToTarget', {
    targetId: targetInfo.targetId,
    flatten: true,
  });
  await edge.send('Page.enable', {}, sessionId);
  // A ponte precisa existir antes da interface carregar.
  await edge.send('Runtime.addBinding', { name: 'vulpiBridge' }, sessionId);
  await injectStyle(edge, sessionId, CSS, BG);
  await injectScript(edge, sessionId, UI);
  log('injetado em', targetInfo.url);
  // Erros da interface dentro da página vão para o log.
  await edge.send('Runtime.enable', {}, sessionId);

  if (mainTarget) return; // só a primeira página é a janela principal
  mainTarget = targetInfo.targetId;
  mainSession = sessionId;
  const current = edge;
  if (hidden) minimize().catch(() => {});
  const logged = await isLoggedIn(edge, sessionId);
  log('logado:', logged);
  if (!logged && edge === current) login();
}

function start() {
  loggingIn = false;
  mainTarget = null;
  mainSession = null;
  const current = launch({ url: HOME, profileDir });
  edge = current;

  current.on((msg) => {
    if (edge !== current) return;
    const info = msg.params && msg.params.targetInfo;

    if (msg.method === 'Runtime.bindingCalled' && msg.params.name === 'vulpiBridge' && msg.sessionId === mainSession) {
      onBridge(msg.params.payload);
    }
    if (msg.method === 'Runtime.exceptionThrown') log('erro na página', msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
    if (msg.method === 'Runtime.consoleAPICalled' && JSON.stringify(msg.params.args).includes('[vulpi]')) log('página', msg.params.args.map((a) => a.value ?? a.description));

    if (msg.method === 'Target.targetCreated' && info.type === 'page') {
      onPage(info).catch((e) => log('erro em onPage', e));
    }

    // Clicou em "Fazer login" com o controle ligado: o Google bloquearia, então troca para o Edge puro.
    if (msg.method === 'Target.targetInfoChanged' && info.type === 'page') {
      let host = '';
      try { host = new URL(info.url).hostname; } catch {}
      if (info.targetId === mainTarget && /^accounts\.google\./.test(host)) {
        login();
      } else if (info.targetId !== mainTarget && /^https?:/.test(info.url) && !isAllowed(info.url)) {
        // Janela nova para outro site: abre no navegador padrão.
        current.send('Target.closeTarget', { targetId: info.targetId }).catch(() => {});
        openOutside(info.url);
      }
    }
  });

  current.proc.once('exit', () => {
    if (edge === current) app.quit();
  });
  current.send('Target.setDiscoverTargets', { discover: true });
}

async function setWindowState(windowState) {
  if (!edge || !mainTarget) return;
  const { windowId } = await edge.send('Browser.getWindowForTarget', { targetId: mainTarget });
  await edge.send('Browser.setWindowBounds', { windowId, bounds: { windowState } });
}
const minimize = () => setWindowState('minimized');

// Traz a janela do Edge para frente (e desminimiza).
async function show() {
  await setWindowState('normal');
  await edge.send('Target.activateTarget', { targetId: mainTarget });
}

// Manda um comando para a interface na página (tocar, pular, volume...).
function pageCmd(name, arg) {
  if (!edge || !mainSession) return;
  edge.send('Runtime.evaluate', {
    expression: `window.__vulpi?.cmd(${JSON.stringify(name)}, ${JSON.stringify(arg ?? null)})`,
    userGesture: true,
  }, mainSession).catch(() => {});
}

function pageReply(id, data) {
  if (!edge || !mainSession || !Number.isInteger(id)) return;
  edge.send('Runtime.evaluate', {
    expression: `window.__vulpi?.reply(${id}, ${JSON.stringify(data ?? null)})`,
  }, mainSession).catch(() => {});
}

// ---------- Ponte: mensagens da página ----------
// Qualquer script da página pode chamar a ponte, então tudo aqui é tratado como não confiável:
// só tipos conhecidos, e só baixa imagens/letras de endereços conhecidos.
const IMG_HOSTS = /^(i\d?\.ytimg\.com|[a-z0-9-]+\.googleusercontent\.com|[a-z0-9-]+\.ggpht\.com)$/;
const safeImg = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && IMG_HOSTS.test(x.hostname); } catch { return false; } };

function onBridge(payload) {
  let m;
  try { m = JSON.parse(payload); } catch { return; }
  if (!m || typeof m !== 'object') return;
  if (m.type === 'state') onState(m);
  else if (m.type === 'mini') toggleMini();
  else if (m.type === 'loggedOut') { log('sessão encerrada: abrindo login'); login(); }
  else if (m.type === 'color') coverColor(m.thumb).then((c) => pageReply(m.id, c)).catch(() => pageReply(m.id, null));
  else if (m.type === 'lrc') syncedLyrics(m).then((l) => pageReply(m.id, l)).catch(() => pageReply(m.id, null));
  else if (m.type === 'aitag') aiTagged(m.videoId).then((v) => pageReply(m.id, v)).catch(() => pageReply(m.id, null));
}

function onState(s) {
  const prev = player;
  const str = (v) => (typeof v === 'string' ? v.slice(0, 300) : '');
  player = {
    videoId: str(s.videoId), title: str(s.title), artist: str(s.artist), thumb: safeImg(s.thumb) ? s.thumb : '',
    playing: !!s.playing, time: +s.time || 0, duration: +s.duration || 0, liked: !!s.liked,
    volume: +s.volume || 0, light: !!s.light, focused: !!s.focused, sleep: str(s.sleep),
    lang: ['pt', 'de'].includes(s.lang) ? s.lang : 'en',
  };
  if (!prev.at) log('ponte: primeiro estado recebido', player.videoId || '(nada tocando)');
  const changed = player.videoId !== prev.videoId;
  if (changed && player.videoId && player.playing) notify(player);
  if (changed || player.playing !== prev.playing || player.liked !== prev.liked || player.sleep !== prev.sleep) updateTray();
  // Discord: atualiza ao trocar de música, pausar/tocar ou se o tempo pular (busca na barra).
  const drift = Math.abs((player.time - (prev.time || 0)) - (Date.now() - (prev.at || 0)) / 1000);
  if (changed || player.playing !== prev.playing || drift > 3) {
    discord.set(config.discord ? activityFor(player, lang()) : null);
  }
  player.at = Date.now();
  mini?.webContents.send('state', player);
}

// ---------- Notificação ao trocar de música ----------
async function notify(s) {
  if (!config.notifications || s.focused || !Notification.isSupported()) return;
  let icon;
  try { icon = nativeImage.createFromBuffer(Buffer.from(await (await net.fetch(s.thumb)).arrayBuffer())); } catch {}
  new Notification({ title: s.title, body: s.artist, icon, silent: true }).show();
}

// ---------- Cor da capa ----------
// Média das cores mais vivas da capa (para o laranja do tema acompanhar a música).
async function coverColor(thumb) {
  if (!safeImg(thumb)) return null;
  const img = nativeImage.createFromBuffer(Buffer.from(await (await net.fetch(thumb)).arrayBuffer())).resize({ width: 24, height: 24 });
  const px = img.toBitmap(); // BGRA
  let best = null;
  const buckets = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i + 2] / 255, g = px[i + 1] / 255, b = px[i] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    const d = max - min;
    if (d < 0.08 || l < 0.12 || l > 0.92) continue; // cinzas, pretos e brancos não contam
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = Math.round(h * 60 + 360) % 360;
    const key = Math.round(h / 20);
    const bk = buckets.get(key) || { w: 0, h: 0, s: 0 };
    const w = s * (1 - Math.abs(l - 0.5));
    bk.w += w; bk.h += h * w; bk.s += s * w;
    buckets.set(key, bk);
    if (!best || bk.w > best.w) best = bk;
  }
  if (!best || best.w < 0.5) return null;
  return { h: Math.round(best.h / best.w), s: Math.round((best.s / best.w) * 100) };
}

// ---------- Letra sincronizada (lrclib.net, aberto e gratuito) ----------
async function syncedLyrics(m) {
  const q = new URLSearchParams({
    track_name: String(m.title || '').slice(0, 200),
    artist_name: String(m.artist || '').slice(0, 200),
  });
  if (m.duration > 0) q.set('duration', String(Math.round(m.duration)));
  const res = await net.fetch(`https://lrclib.net/api/get?${q}`, { headers: { 'User-Agent': 'Vulpi (https://github.com/)' } });
  if (!res.ok) return null;
  const j = await res.json();
  return j.syncedLyrics ? { synced: j.syncedLyrics } : null;
}

// ---------- Selo "IA" do YouTube ----------
// Quem publica marca o vídeo como "conteúdo alterado ou sintético" e o YouTube mostra o selo "IA".
// O YouTube Music não repassa esse selo, mas o YouTube normal sim: consultamos a página do vídeo
// (dados públicos, sem login) e procuramos o selo no vídeo principal.
const aiCache = new Map();
function findAll(o, key, acc = []) {
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === key) acc.push(v); else findAll(v, key, acc); }
  return acc;
}
function aiTagged(videoId) {
  if (!/^[\w-]{11}$/.test(String(videoId))) return Promise.resolve(false);
  if (!aiCache.has(videoId)) {
    aiCache.set(videoId, (async () => {
      const res = await net.fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20251001.01.00', hl: 'en' } }, videoId }),
      });
      if (!res.ok) throw new Error(`next ${res.status}`);
      const j = await res.json();
      const primary = findAll(j, 'videoPrimaryInfoRenderer')[0] || {};
      const badge = (primary.badges || []).some((b) => {
        const m = b.metadataBadgeRenderer || {};
        return m.label === 'AI' || /made with AI|altered or synthetic/i.test(m.accessibilityData?.label || '');
      });
      const how = JSON.stringify(findAll(j, 'howThisWasMadeSectionViewModel')[0] || '');
      return badge || /altered or fully generated|altered or synthetic/i.test(how);
    })().catch((e) => { aiCache.delete(videoId); throw e; }));
  }
  return aiCache.get(videoId);
}

// ---------- Mini player ----------
function toggleMini() {
  if (mini) return mini.close();
  const { workArea } = screen.getPrimaryDisplay();
  const w = 380, hgt = 84;
  mini = new BrowserWindow({
    width: w, height: hgt,
    x: workArea.x + workArea.width - w - 20, y: workArea.y + workArea.height - hgt - 20,
    frame: false, resizable: false, maximizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false,
    backgroundColor: player.light ? '#faf8f6' : '#161514',
    title: 'Vulpi mini', icon: path.join(ASSETS, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'mini', 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  mini.setAlwaysOnTop(true, 'floating');
  mini.loadFile(path.join(__dirname, 'mini', 'mini.html'));
  // Com o mini player aberto, a janela principal sai da frente (minimiza).
  mini.once('ready-to-show', () => { mini.show(); mini.webContents.send('state', player); minimize().catch(() => {}); });
  mini.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mini.webContents.on('will-navigate', (e) => e.preventDefault());
  // Fechou o mini player: a janela principal volta.
  mini.on('closed', () => { mini = null; updateTray(); if (!quitting) show().catch(() => {}); });
  updateTray();
}

const MINI_CMDS = new Set(['toggle', 'next', 'prev', 'like']);
ipcMain.on('mini-cmd', (e, name) => {
  if (!mini || e.sender !== mini.webContents) return;
  if (MINI_CMDS.has(name)) pageCmd(name);
  else if (name === 'expand') mini.close();
  else if (name === 'close') mini.close();
});

// ---------- Bandeja ----------
function setOpenAtLogin(on) {
  config.openAtLogin = on;
  saveConfig();
  app.setLoginItemSettings({
    openAtLogin: on,
    path: process.execPath,
    args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'],
  });
}

function updateTray() {
  if (!tray) return;
  const p = player;
  const has = !!p.videoId;
  const toggle = (key) => (item) => { config[key] = item.checked; saveConfig(); if (key === 'discord') discord.set(config.discord ? activityFor(player, lang()) : null); };
  const sleepOn = p.sleep ? sleepChoice : 0;
  const sleepItem = (label, v) => ({ label, type: 'radio', checked: sleepOn === v, click: () => { sleepChoice = v; pageCmd('sleep', v); } });
  tray.setToolTip(has ? `Vulpi — ${p.title} · ${p.artist}`.slice(0, 127) : 'Vulpi');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: has ? `♪  ${p.title}`.slice(0, 60) : tr('Nada tocando'), enabled: false },
    ...(has ? [{ label: `    ${p.artist}`.slice(0, 60), enabled: false }] : []),
    { type: 'separator' },
    { label: p.playing ? tr('Pausar') : tr('Tocar'), enabled: has, click: () => pageCmd('toggle') },
    { label: tr('Próxima'), enabled: has, click: () => pageCmd('next') },
    { label: tr('Anterior'), enabled: has, click: () => pageCmd('prev') },
    { label: p.liked ? tr('Descurtir') : tr('Curtir'), enabled: has, click: () => pageCmd('like') },
    { type: 'separator' },
    { label: mini ? tr('Fechar mini player') : tr('Mini player'), click: toggleMini },
    { label: tr('Modo foco'), click: () => { show().catch(() => {}); pageCmd('focus'); } },
    { label: tr('Timer de sono'), submenu: [
      sleepItem(tr('Desligado'), 0), sleepItem(tr('15 minutos'), 15), sleepItem(tr('30 minutos'), 30), sleepItem(tr('60 minutos'), 60), sleepItem(tr('Fim da música'), 'end'),
    ] },
    { type: 'separator' },
    { label: tr('Configurações'), submenu: [
      { label: tr('Notificações ao trocar de música'), type: 'checkbox', checked: config.notifications, click: toggle('notifications') },
      { label: tr('Mostrar no Discord'), type: 'checkbox', checked: config.discord, click: toggle('discord') },
      { label: tr('Abrir com o Windows'), type: 'checkbox', checked: config.openAtLogin, click: (i) => setOpenAtLogin(i.checked) },
      { type: 'separator' },
      { label: tr('Abrir arquivo de configurações'), click: () => shell.openPath(configFile) },
    ] },
    { type: 'separator' },
    { label: tr('Mostrar Vulpi'), click: () => show().catch(() => {}) },
    { label: tr('Fechar'), click: () => app.quit() },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS, 'tray.png')));
  tray.on('click', () => show().catch(() => {}));
  updateTray();
}

// Se o arquivo de configurações mudar (ex.: colou o ID do Discord), aplica na hora.
function watchConfig() {
  fs.watchFile(configFile, { interval: 2000 }, () => {
    loadConfig();
    discord.setClientId(discordId());
    updateTray();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => show().catch(() => {}));

  app.whenReady().then(() => {
    if (!findEdge()) {
      dialog.showErrorBox('Vulpi', tr('O Vulpi precisa do Microsoft Edge, que não foi encontrado. Instale o Edge em microsoft.com/edge e abra o Vulpi de novo.'));
      return app.quit();
    }
    app.setAppUserModelId('com.vulpi.app'); // nome "Vulpi" nas notificações do Windows
    profileDir = path.join(app.getPath('userData'), 'edge-profile');
    logFile = path.join(app.getPath('userData'), 'vulpi.log');
    configFile = path.join(app.getPath('userData'), 'config.json');
    loadConfig();
    saveConfig(); // cria o arquivo com os padrões, para dar para editar
    discord.setClientId(discordId());
    watchConfig();
    log('início', process.argv.join(' '));
    createTray();
    start();
  });

  // O mini player é uma janela do Electron; fechar ele não fecha o app.
  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    quitting = true;
    discord.set(null);
    discord.close();
    if (edge) edge.send('Browser.close').catch(() => {});
  });
}
