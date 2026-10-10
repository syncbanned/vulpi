// Dados da conta pelo InnerTube (a API interna que o próprio site usa), chamado
// de dentro da página logada, com a sessão do usuário. O formato do InnerTube muda
// às vezes: todo o conserto fica neste arquivo.

const ORIGIN = 'https://music.youtube.com';

async function authHeader() {
  const sapisid = (document.cookie.match(/(?:^|; )(?:SAPISID|__Secure-3PAPISID)=([^;]+)/) || [])[1];
  if (!sapisid) return {};
  const ts = Math.floor(Date.now() / 1000);
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${sapisid} ${ORIGIN}`));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { Authorization: `SAPISIDHASH ${ts}_${hex}` };
}

// Contexto do site; em inglês ou alemão, pede os dados (títulos das seções etc.) nesse idioma também.
function contextFor() {
  const ctx = window.ytcfg.get('INNERTUBE_CONTEXT');
  if (LANG === 'pt' || new RegExp('^' + LANG, 'i').test(ctx?.client?.hl || '')) return ctx;
  return { ...ctx, client: { ...ctx.client, hl: LANG } };
}

async function innertube(endpoint, body) {
  const res = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Origin': ORIGIN,
      'X-Goog-AuthUser': String(window.ytcfg?.get('SESSION_INDEX') || 0),
      ...(await authHeader()),
    },
    body: JSON.stringify({ context: contextFor(), ...body }),
  });
  if (!res.ok) throw new Error(`InnerTube ${endpoint}: ${res.status}`);
  return res.json();
}

// Procura todas as ocorrências de uma chave no JSON, em qualquer profundidade.
// Assim não dependemos do caminho exato, que é o que mais muda.
function findAll(obj, key, acc = []) {
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === key) acc.push(v);
      else findAll(v, key, acc);
    }
  }
  return acc;
}

const runsText = (t) => (t?.runs || []).map((r) => r.text).join('') || t?.simpleText || '';

// Troca a miniatura pela versão grande.
function bigThumb(thumbs) {
  const url = (thumbs || []).slice(-1)[0]?.url || '';
  return url.replace(/=w\d+-h\d+/, '=w544-h544').replace(/=s\d+$/, '=s544');
}

// Card (musicTwoRowItemRenderer): playlist, álbum, artista ou vídeo.
function fromTwoRow(r) {
  const nav = r.navigationEndpoint || {};
  const play = r.thumbnailOverlay?.musicItemThumbnailOverlayRenderer?.content
    ?.musicPlayButtonRenderer?.playNavigationEndpoint;
  return {
    title: runsText(r.title),
    subtitle: runsText(r.subtitle),
    thumb: bigThumb(r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails),
    browseId: nav.browseEndpoint?.browseId,
    pageType: nav.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType,
    play: nav.watchEndpoint ? { watchEndpoint: nav.watchEndpoint } : play,
  };
}

// Linha (musicResponsiveListItemRenderer): música de playlist, histórico, busca.
function fromRow(r) {
  const cols = (r.flexColumns || []).map((c) => c.musicResponsiveListItemFlexColumnRenderer?.text);
  const play = r.overlay?.musicItemThumbnailOverlayRenderer?.content
    ?.musicPlayButtonRenderer?.playNavigationEndpoint;
  const videoId = r.playlistItemData?.videoId || play?.watchEndpoint?.videoId;
  return {
    title: runsText(cols[0]),
    subtitle: runsText(cols[1]),
    album: runsText(cols[2]),
    duration: runsText(r.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text),
    thumb: bigThumb(r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails),
    videoId,
    browseId: r.navigationEndpoint?.browseEndpoint?.browseId,
    pageType: r.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType,
    play: play || (videoId ? { watchEndpoint: { videoId } } : null),
  };
}

const browse = (browseId) => innertube('browse', { browseId });

// Prateleiras de uma tela (Início, Explorar): [{ title, items }].
async function getShelves(browseId) {
  const json = await browse(browseId);
  return findAll(json, 'musicCarouselShelfRenderer').map((s) => ({
    title: runsText(s.header?.musicCarouselShelfBasicHeaderRenderer?.title),
    items: (s.contents || []).map((c) =>
      c.musicTwoRowItemRenderer ? fromTwoRow(c.musicTwoRowItemRenderer)
        : c.musicResponsiveListItemRenderer ? fromRow(c.musicResponsiveListItemRenderer) : null,
    ).filter(Boolean),
  }));
}

// Histórico, sem repetir música.
async function getHistory() {
  const json = await browse('FEmusic_history');
  const seen = new Set();
  return findAll(json, 'musicResponsiveListItemRenderer').map(fromRow)
    .filter((i) => i.videoId && !seen.has(i.videoId) && seen.add(i.videoId));
}

// Playlists da biblioteca (sem o card "Nova playlist").
async function getPlaylists() {
  const json = await browse('FEmusic_liked_playlists');
  return findAll(json, 'musicTwoRowItemRenderer').map(fromTwoRow).filter((p) => p.browseId);
}

// Página de playlist ou álbum: { title, subtitle, info, thumb, play, tracks }.
async function getPlaylist(browseId) {
  const json = await browse(browseId);
  const h = findAll(json, 'musicResponsiveHeaderRenderer')[0] || findAll(json, 'musicDetailHeaderRenderer')[0] || {};
  const tracks = findAll(json, 'musicResponsiveListItemRenderer').map(fromRow).filter((t) => t.videoId);
  const playlistId = browseId.startsWith('VL') ? browseId.slice(2) : null;
  return {
    title: runsText(h.title),
    subtitle: runsText(h.subtitle),
    info: runsText(h.secondSubtitle),
    thumb: bigThumb(h.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails
      || h.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails),
    play: playlistId ? { watchPlaylistEndpoint: { playlistId } } : tracks[0]?.play,
    tracks,
  };
}

// Busca: músicas, artistas, álbuns e playlists, na ordem do site.
async function search(query) {
  const json = await innertube('search', { query });
  return findAll(json, 'musicResponsiveListItemRenderer').map(fromRow).filter((i) => i.title);
}

// Letra da música (texto fixo, sem sincronizar com o tempo): { text, source } ou null.
// O site guarda a letra numa aba "Letra" da tela de reprodução (browseId MPLYt...).
const lyricsCache = new Map();
async function getLyrics(videoId) {
  if (lyricsCache.has(videoId)) return lyricsCache.get(videoId);
  const next = await innertube('next', { videoId });
  const tab = findAll(next, 'tabRenderer').find((t) => t.endpoint?.browseEndpoint?.browseId?.startsWith('MPLYt'));
  let result = null;
  if (tab) {
    const page = await browse(tab.endpoint.browseEndpoint.browseId);
    const shelf = findAll(page, 'musicDescriptionShelfRenderer')[0];
    if (shelf) result = { text: runsText(shelf.description), source: runsText(shelf.footer) };
  }
  lyricsCache.set(videoId, result);
  return result;
}

// Página de artista: { title, info, thumb, play, songs, shelves }.
async function getArtist(browseId) {
  const json = await browse(browseId);
  const head = findAll(json, 'musicImmersiveHeaderRenderer')[0] || findAll(json, 'musicVisualHeaderRenderer')[0]
    || findAll(json, 'musicResponsiveHeaderRenderer')[0] || {};
  const thumbs = head.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails
    || head.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
  const songs = findAll(json, 'musicShelfRenderer')
    .flatMap((s) => (s.contents || []).map((c) => c.musicResponsiveListItemRenderer).filter(Boolean).map(fromRow));
  const shelves = findAll(json, 'musicCarouselShelfRenderer').map((s) => ({
    title: runsText(s.header?.musicCarouselShelfBasicHeaderRenderer?.title),
    items: (s.contents || []).map((c) => (c.musicTwoRowItemRenderer ? fromTwoRow(c.musicTwoRowItemRenderer) : null)).filter(Boolean),
  })).filter((s) => s.items.length);
  return {
    title: runsText(head.title),
    info: runsText(head.subscriptionButton?.subscribeButtonRenderer?.subscriberCountText) || runsText(head.monthlyListenerCount),
    thumb: bigThumb(thumbs),
    play: head.playButton?.buttonRenderer?.navigationEndpoint || head.startRadioButton?.buttonRenderer?.navigationEndpoint || songs[0]?.play,
    songs,
    shelves,
  };
}

// Adiciona uma música a uma playlist sua (sem o "VL" do começo do id).
async function addToPlaylist(playlistId, videoId) {
  const r = await innertube('browse/edit_playlist', {
    playlistId,
    actions: [{ action: 'ACTION_ADD_VIDEO', addedVideoId: videoId }],
  });
  if (r.status && r.status !== 'STATUS_SUCCEEDED') throw new Error(r.status);
}

// Curte uma música (vai para "Músicas que gostei").
const likeVideo = (videoId) => innertube('like/like', { target: { videoId } });
