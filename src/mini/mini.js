// Mini player: mostra a música atual e manda os botões para o app.
const $ = (id) => document.getElementById(id);
const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.4-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z" fill="currentColor"/></svg>';
const PAUSE = '<svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor"/></svg>';

let playing = null;
let thumb = '';
let base = { time: 0, duration: 0, at: 0 };

// Textos em português ou inglês (o idioma vem junto do estado).
const TEXT = {
  pt: { idle: 'Nada tocando', prev: 'Anterior', play: 'Tocar/pausar', next: 'Próxima', like: 'Curtir', expand: 'Abrir o Vulpi', close: 'Fechar mini player' },
  en: { idle: 'Nothing playing', prev: 'Previous', play: 'Play/pause', next: 'Next', like: 'Like', expand: 'Open Vulpi', close: 'Close mini player' },
};
let lang = '';

window.mini.onState((s) => {
  if (s.lang !== lang) {
    lang = s.lang === 'pt' ? 'pt' : 'en';
    const tx = TEXT[lang];
    document.documentElement.lang = lang;
    for (const id of ['prev', 'play', 'next', 'like', 'expand', 'close']) $(id).title = tx[id];
    if (!s.videoId) $('title').textContent = tx.idle;
  }
  document.body.classList.toggle('light', !!s.light);
  document.body.classList.toggle('idle', !s.videoId);
  if (!s.videoId) return;
  $('title').textContent = s.title;
  $('artist').textContent = s.artist;
  if (s.thumb !== thumb) {
    thumb = s.thumb;
    $('art').src = s.thumb;
    $('bg').style.backgroundImage = `url("${s.thumb}")`;
    document.body.classList.remove('swap');
    void document.body.offsetWidth;
    document.body.classList.add('swap');
  }
  if (s.playing !== playing) {
    playing = s.playing;
    $('play').innerHTML = s.playing ? PAUSE : PLAY;
  }
  $('like').classList.toggle('on', !!s.liked);
  $('heart').setAttribute('fill', s.liked ? 'currentColor' : 'none');
  base = { time: s.time, duration: s.duration, at: performance.now() };
});

// Barra de progresso andando suave entre as atualizações.
(function tick() {
  requestAnimationFrame(tick);
  const t = base.time + (playing ? (performance.now() - base.at) / 1000 : 0);
  $('fill').style.width = base.duration ? `${Math.min(100, (t / base.duration) * 100)}%` : '0';
})();

$('play').innerHTML = PLAY;
for (const [id, cmd] of [['prev', 'prev'], ['play', 'toggle'], ['next', 'next'], ['like', 'like'], ['expand', 'expand'], ['close', 'close']]) {
  $(id).addEventListener('click', () => window.mini.cmd(cmd));
}
