// Ponte com o player oficial do YouTube Music, que fica escondido atrás da nossa interface.
// Tocar = pedir ao próprio site para abrir o item (resolveCommand). Nada de stream direto.

const $yt = (sel) => document.querySelector(sel);
const ytPlayer = () => document.getElementById('movie_player');
const ytBar = () => $yt('ytmusic-player-bar');

// Às vezes o site carrega a música e fica parado (sem tocar); aí damos o play.
function playEndpoint(endpoint) {
  if (!endpoint) return;
  $yt('ytmusic-app')?.resolveCommand(endpoint);
  if (!endpoint.watchEndpoint && !endpoint.watchPlaylistEndpoint) return;
  let tries = 0;
  const timer = setInterval(() => {
    const p = ytPlayer();
    const st = p?.getPlayerState?.();
    if (++tries > 24 || st === 1) return clearInterval(timer);
    if (tries > 3 && (st === -1 || st === 5)) p.playVideo();
  }, 250);
}

// Capa da música atual: a da barra do site, ou a da fila, ou a miniatura do vídeo.
function thumbOf(bar, videoId) {
  const src = bar.querySelector('img.image')?.src || '';
  if (src.startsWith('http')) return src.replace(/=w\d+-h\d+/, '=w240-h240');
  const q = document.querySelector('ytmusic-player-queue-item[selected]')?.data?.thumbnail?.thumbnails;
  return q?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// Estado atual do player, lido do player oficial e da barra dele.
function playerState() {
  const p = ytPlayer();
  const bar = ytBar();
  if (!p || !bar || !p.getVideoData) return null;
  const data = p.getVideoData();
  if (!data?.video_id) return null;
  const likeBtn = bar.querySelector('ytmusic-like-button-renderer button');
  const byline = bar.querySelector('.byline')?.textContent?.trim() || data.author || '';
  return {
    videoId: data.video_id,
    title: bar.querySelector('.title')?.textContent?.trim() || data.title,
    artist: byline.split(' • ')[0],
    thumb: thumbOf(bar, data.video_id),
    playing: p.getPlayerState() === 1 || p.getPlayerState() === 3,
    time: p.getCurrentTime() || 0,
    duration: p.getDuration() || 0,
    liked: likeBtn?.getAttribute('aria-pressed') === 'true',
    repeat: bar.getAttribute('repeat-mode') || 'NONE', // NONE | ALL | ONE
  };
}

const playerCmd = {
  toggle() {
    const p = ytPlayer();
    if (!p) return;
    p.getPlayerState() === 1 ? p.pauseVideo() : p.playVideo();
  },
  next: () => ytBar()?.querySelector('.next-button')?.click(),
  prev: () => ytBar()?.querySelector('.previous-button')?.click(),
  shuffle: () => ytBar()?.querySelector('.shuffle')?.click(),
  repeat: () => ytBar()?.querySelector('.repeat')?.click(),
  like: () => ytBar()?.querySelector('ytmusic-like-button-renderer button')?.click(),
  seek: (frac) => {
    const p = ytPlayer();
    if (p) p.seekTo(frac * p.getDuration(), true);
  },
};

// Fila de reprodução, lida da fila do próprio site.
function playerQueue() {
  return [...document.querySelectorAll('ytmusic-player-queue-item')].map((el) => {
    const d = el.data || {};
    return {
      title: runsText(d.title),
      artist: runsText(d.shortBylineText),
      duration: runsText(d.lengthText),
      thumb: (d.thumbnail?.thumbnails || []).slice(-1)[0]?.url || '',
      selected: el.hasAttribute('selected'),
      videoId: d.videoId,
      play: d.navigationEndpoint,
    };
  });
}
