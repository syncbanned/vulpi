// Idioma da interface: português se o sistema estiver em português, senão inglês.
// Dá para trocar no menu do avatar (fica salvo). Os textos ficam escritos em português no código
// e t() devolve a tradução: t('Início') -> 'Home'. {0}, {1}... são trocados pelos argumentos.
const LANG = (() => {
  try {
    const saved = localStorage.getItem('vulpi-lang');
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {}
  return /^pt\b/i.test(navigator.language || '') ? 'pt' : 'en';
})();

const EN = {
  'Início': 'Home',
  'Explorar': 'Explore',
  'Biblioteca': 'Library',
  'Playlists': 'Playlists',
  'Ver tudo': 'See all',
  'Playlist em destaque': 'Featured playlist',
  'Ouvir agora': 'Play now',
  'Destaque {0}': 'Featured {0}',
  'Não deu para carregar agora.': "Couldn't load right now.",
  'Tentar de novo': 'Try again',
  'Recentes': 'Recent',
  'Suas playlists': 'Your playlists',
  'Álbum': 'Album',
  'Playlist': 'Playlist',
  'Artista': 'Artist',
  'Músicas': 'Songs',
  'Nada por aqui ainda.': 'Nothing here yet.',
  'Nada encontrado para "{0}".': 'Nothing found for "{0}".',
  'Resultados': 'Results',
  'Tocar/pausar': 'Play/pause',
  'Nada tocando': 'Nothing playing',
  'Nada tocando.': 'Nothing playing.',
  'Escolha uma música': 'Pick a song',
  'Curtir': 'Like',
  'Repetir': 'Repeat',
  'Fila': 'Queue',
  'Aleatório': 'Shuffle',
  'Anterior': 'Previous',
  'Próxima': 'Next',
  'Mini player': 'Mini player',
  'Modo foco': 'Focus mode',
  'Modo foco (F)': 'Focus mode (F)',
  'Sair do modo foco (Esc)': 'Exit focus mode (Esc)',
  'Esconder painel': 'Hide panel',
  'Mostrar painel': 'Show panel',
  'Tocando agora': 'Now playing',
  'Letra': 'Lyrics',
  'A seguir': 'Up next',
  'Fim da fila.': 'End of queue.',
  'A fila está vazia.': 'The queue is empty.',
  'Não deu para carregar a letra.': "Couldn't load the lyrics.",
  'Letra indisponível para esta música.': 'No lyrics available for this song.',
  'Esconde e pula as músicas desse artista': "Hides and skips this artist's songs",
  'É IA? Bloquear artista': 'AI? Block artist',
  'Esconder miniaturas': 'Hide thumbnails',
  'Mostrar miniaturas': 'Show thumbnails',
  'Tema escuro': 'Dark theme',
  'Tema claro': 'Light theme',
  'Trocar tema': 'Switch theme',
  'Voltar': 'Back',
  'Conta': 'Account',
  'Fechar': 'Close',
  'Menu (Ctrl+K)': 'Menu (Ctrl+K)',
  'Buscar músicas, artistas, álbuns...': 'Search songs, artists, albums...',
  'Buscar e tocar, ou escolher uma ação...': 'Search and play, or pick an action...',
  'Busca rápida': 'Quick search',
  'Estatísticas': 'Stats',
  'Timer de sono': 'Sleep timer',
  'Clique para trocar': 'Click to change',
  'desligado': 'off',
  'fim da música': 'end of song',
  'Timer de sono: {0}': 'Sleep timer: {0}',
  'Timer de sono desligado': 'Sleep timer off',
  'Timer de sono: música pausada. Boa noite!': 'Sleep timer: music paused. Good night!',
  'Cor da capa': 'Cover color',
  'Visualizador': 'Visualizer',
  'Não deu para ligar o visualizador.': "Couldn't start the visualizer.",
  'Idioma: Português': 'Language: English',
  'Volume (role para ajustar)': 'Volume (scroll to adjust)',
  'Volume {0}% (role para ajustar)': 'Volume {0}% (scroll to adjust)',
  'Filtrar músicas de IA': 'Filter AI music',
  'Filtrar músicas feitas por IA': 'Filter AI-made music',
  'Filtro de IA ligado (clique para desligar)': 'AI filter on (click to turn off)',
  'Filtro de IA ligado': 'AI filter on',
  'Filtro de IA desligado': 'AI filter off',
  '"{0}" marcado como IA': '"{0}" marked as AI',
  'Pulei uma música marcada como IA': 'Skipped a song marked as AI',
  '"{0}" adicionada a {1}': '"{0}" added to {1}',
  'Não deu para adicionar a {0}': "Couldn't add to {0}",
  'Ouça umas músicas e volte aqui. Os dados ficam só neste computador.': 'Listen to some music and come back. This data stays on this computer.',
  'Esta semana': 'This week',
  'Total': 'Total',
  'Músicas diferentes': 'Different songs',
  'Últimos 7 dias': 'Last 7 days',
  'Artistas mais ouvidos': 'Top artists',
  'Músicas mais ouvidas': 'Top songs',
  'Algo deu errado ao abrir o Vulpi.': 'Something went wrong while opening Vulpi.',
  'Sem conexão com o YouTube Music.': "Can't reach YouTube Music.",
  'Confira a internet e tente de novo.': 'Check your internet and try again.',
  'Recarregar': 'Reload',
};

function t(s, ...args) {
  let r = LANG === 'pt' ? s : (EN[s] ?? s);
  args.forEach((v, i) => { r = r.split(`{${i}}`).join(String(v)); });
  return r;
}

// Troca o idioma e recarrega a interface.
function switchLang() {
  try { localStorage.setItem('vulpi-lang', LANG === 'pt' ? 'en' : 'pt'); } catch {}
  location.reload();
}
