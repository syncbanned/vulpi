<p align="center"><img src="assets/app-icon.png" width="96" alt="Vulpi"></p>

<h1 align="center">Vulpi</h1>

<p align="center">A minimal, good-looking desktop player for YouTube Music on Windows.<br>
<a href="#português">Leia em português</a></p>

> **Disclaimer:** Vulpi is not affiliated with, endorsed or sponsored by YouTube or Google.
> "YouTube Music" is a trademark of Google LLC. Sign-in, content and playback all come from the official site.

## What it is

Vulpi opens the official YouTube Music site in a Microsoft Edge app window and draws its own interface on top
of it: a clean sidebar, featured playlists, recent songs and a custom player. You sign in with your own Google
account and keep everything YouTube Music already gives you (history, library, playlists, recommendations).

Vulpi does **not** download music, extract audio streams, block ads or touch Premium features. Audio always
plays in the official player.

## Features

- Own interface with light/dark theme, optional small thumbnails, "Now playing" / "Lyrics" side panel and an animated vinyl.
- **Tray menu**: current song, play/pause, next/previous, like, mini player, focus mode, sleep timer and settings.
- **Windows notification** when the song changes (only when the window isn't focused).
- **Mini player** that stays on top of other windows.
- **Volume** control (click to mute, scroll to adjust).
- **Quick search** (Ctrl+K or the ≡ button): search and play, or run actions.
- **Focus mode** (F): big cover, blurred background and lyrics.
- **Synced lyrics** from [LRCLIB](https://lrclib.net) when available, otherwise YouTube Music's lyrics.
- **Cover color** (optional): the accent color follows the song's cover.
- **Listening stats** (kept only on your computer).
- **Artist pages**, and drag songs onto sidebar playlists to add them.
- **AI music filter** (robot button): hides and skips songs the uploader labeled as AI on YouTube, songs with
  AI keywords in the title, and artists you block. Hidden songs stay in your playlists.
- **Discord**: shows "Listening to Vulpi" on your profile, like Spotify.
- **Open with Windows** (from the tray), already minimized.
- **Automatic updates**: new versions download in the background and install on restart.
- English, Portuguese and German (follows Windows; switch in the avatar menu).

## Requirements

- Windows 10 or 11 with Microsoft Edge (it comes with Windows).

## Install

Download the latest `Vulpi-Setup-x.y.z.exe` from [Releases](../../releases) and run it.

The installer is not code-signed yet, so Windows SmartScreen may say "Windows protected your PC".
Click **More info → Run anyway**. On PCs with **Smart App Control** turned on, unsigned installers are blocked;
in that case build it yourself (below).

On first launch, follow the prompt to sign in. The sign-in is saved.

## Build from source

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm start
```

Install as a program for your user (copies to `%LOCALAPPDATA%\Programs\Vulpi`, adds Desktop and Start menu
shortcuts and an entry in "Installed apps"):

```bash
npm run dist
npm run install-app
```

Tests: `npm test`. Icons: `npm run icons` (from `assets/logo-mark.png`, `assets/logo-source.jpg` and
`assets/app-icon.png`).

## How it works

- `src/edge.js` starts Edge with a profile only for Vulpi (`%APPDATA%\Vulpi\edge-profile`) and talks to it
  through the DevTools protocol over a pipe (no network port). Google blocks sign-in in controlled browsers, so
  the first sign-in happens in a plain Edge window.
- `src/ui` is the interface, injected into the page. Data comes from InnerTube, the site's internal API, called
  from inside your signed-in page (`src/ui/data.js`). If YouTube changes its data, that's where to fix it.
- `src/main.js` runs the tray, notifications, mini player, Discord Rich Presence (`src/discord.js`) and the
  bridge between the page and the app.
- The page sees `navigator.webdriver = true` because Edge is remote-controlled; Vulpi does not hide that.

## License

MIT. See [LICENSE](LICENSE).

---

## Português

Player desktop minimalista para o YouTube Music no Windows. O Vulpi abre o site oficial numa janela do
Microsoft Edge e desenha uma interface própria por cima. Você entra com a sua conta Google. O Vulpi não baixa
músicas, não extrai áudio e não bloqueia anúncios.

**Instalar:** baixe o `Vulpi-Setup-x.y.z.exe` em [Releases](../../releases). Como o instalador ainda não tem
assinatura digital, o Windows pode mostrar "O Windows protegeu o seu PC": clique em **Mais informações →
Executar assim mesmo**.

**Compilar:** `npm install`, `npm start`. Para instalar como programa: `npm run dist` e `npm run install-app`.

O app segue o idioma do Windows (português, inglês ou alemão) e dá para trocar no menu do avatar.
