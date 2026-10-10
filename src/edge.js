// Abre o YouTube Music no Microsoft Edge de verdade (janela de app, perfil próprio do Vulpi)
// e conversa com ele pelo protocolo DevTools via pipe: sem porta de rede, só o Vulpi controla.
// O Google aceita o login porque é o navegador oficial, não um navegador embutido.
// O login em si é feito com o Edge "puro" (sem pipe): com o controle ligado o Google bloqueia.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE_PATHS = [
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
];

function findEdge() {
  return EDGE_PATHS.find((p) => fs.existsSync(p));
}

function args(url, profileDir) {
  return [
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    // A interface do Vulpi às vezes manda tocar depois de buscar dados (fora do clique).
    '--autoplay-policy=no-user-gesture-required',
    `--app=${url}`,
  ];
}

// Edge sem nenhum controle, só para o login. Devolve o processo.
function launchPlain({ url, profileDir }) {
  return spawn(findEdge(), args(url, profileDir), { stdio: 'ignore' });
}

// Liga o Edge com controle e devolve { send(method, params, sessionId), on(handler), proc }.
function launch({ url, profileDir }) {
  const proc = spawn(findEdge(), [...args(url, profileDir), '--remote-debugging-pipe'], {
    stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
  });

  const [, , , toEdge, fromEdge] = proc.stdio;
  let id = 0;
  const pending = new Map();
  const handlers = [];
  let buf = '';

  // Mensagens do pipe são JSON separados por \0.
  fromEdge.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let end;
    while ((end = buf.indexOf('\0')) !== -1) {
      const msg = JSON.parse(buf.slice(0, end));
      buf = buf.slice(end + 1);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else {
        handlers.forEach((h) => h(msg));
      }
    }
  });
  fromEdge.on('error', () => {});
  toEdge.on('error', () => {}); // Edge fechado: ignora escrita pendente.

  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      toEdge.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
  }

  return { send, on: (h) => handlers.push(h), proc };
}

// Script que liga o CSS e a meta theme-color (cor da barra de título).
// Roda em todo documento novo, antes do site. Usa adoptedStyleSheets porque o site
// apaga <style> estranhos do <head>; uma folha "adotada" não fica no DOM.
function styleScript(css, themeColor) {
  return `(() => {
  if (window.__vulpiTheme) return;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(${JSON.stringify(css)});
  window.__vulpiTheme = sheet;
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  const meta = () => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const m = document.createElement('meta');
    m.name = 'theme-color';
    m.content = ${JSON.stringify(themeColor)};
    document.head.appendChild(m);
  };
  document.head ? meta() : document.addEventListener('DOMContentLoaded', meta);
  if (location.hostname !== 'music.youtube.com') return;
  // No começo do carregamento a página ainda não tem nem o <html>: espera ele aparecer.
  const onRoot = (fn) => {
    if (document.documentElement) return fn(document.documentElement);
    new MutationObserver((_, o) => { if (document.documentElement) { o.disconnect(); fn(document.documentElement); } })
      .observe(document, { childList: true });
  };
  // Tela de abertura do Vulpi até a interface montar: o site original nunca aparece.
  onRoot((root) => {
    if (!document.getElementById('vulpi-host')) root.classList.add('vulpi-boot');
    try { if (localStorage.getItem('vulpi-theme') === 'light') root.classList.add('vulpi-boot-light'); } catch {}
  });
  // A janela se chama "Vulpi" (e não "YouTube Music"), inclusive para o Discord.
  const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
  const fixTitle = () => { if (desc.get.call(document) !== 'Vulpi') desc.set.call(document, 'Vulpi'); };
  try { Object.defineProperty(document, 'title', { configurable: true, get: () => desc.get.call(document), set: fixTitle }); } catch {}
  const watch = () => {
    fixTitle();
    new MutationObserver(fixTitle).observe(document.head, { subtree: true, childList: true, characterData: true });
  };
  document.head ? watch() : document.addEventListener('DOMContentLoaded', watch);
})();`;
}

// Roda um script numa página já anexada (sessionId): agora e em todo carregamento.
async function injectScript(edge, sessionId, source) {
  await edge.send('Page.addScriptToEvaluateOnNewDocument', { source }, sessionId);
  await edge.send('Runtime.evaluate', { expression: source }, sessionId);
}

const injectStyle = (edge, sessionId, css, themeColor) =>
  injectScript(edge, sessionId, styleScript(css, themeColor));

// Espera o site carregar e diz se a conta está logada (true/false).
// O próprio YouTube Music guarda isso em ytcfg.
async function isLoggedIn(edge, sessionId, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await edge.send('Runtime.evaluate', {
      expression: "window.ytcfg && ytcfg.get('LOGGED_IN')",
      returnByValue: true,
    }, sessionId);
    const v = r.result.value;
    if (v === true || v === false) return v;
    await new Promise((res) => setTimeout(res, 500));
  }
  return false;
}

module.exports = { launch, launchPlain, findEdge, injectScript, injectStyle, isLoggedIn };
