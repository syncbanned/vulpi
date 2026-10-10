// "Ouvindo no Vulpi" no perfil do Discord (Rich Presence), como o Discord faz com o Spotify.
// Fala direto com o Discord aberto no PC pelo pipe local discord-ipc-N. Não usa internet nem token:
// só o ID de um aplicativo criado em discord.com/developers (fica em config.json).
const net = require('net');

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;

function encode(op, data) {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

class DiscordPresence {
  constructor(log) {
    this.log = log;
    this.clientId = '';
    this.sock = null;
    this.ready = false;
    this.activity = null; // última atividade pedida (reenviada ao reconectar)
    this.retry = null;
  }

  // Liga com um ID de aplicativo; '' desliga.
  setClientId(id) {
    if (id === this.clientId) return;
    this.clientId = id;
    this.close();
    if (id) this.connect();
  }

  connect(n = 0) {
    if (!this.clientId || this.sock) return;
    if (n > 9) return this.scheduleRetry(); // Discord fechado: tenta de novo depois
    const sock = net.createConnection(`\\\\?\\pipe\\discord-ipc-${n}`);
    let buf = Buffer.alloc(0);
    sock.once('connect', () => {
      this.sock = sock;
      sock.write(encode(OP_HANDSHAKE, { v: 1, client_id: this.clientId }));
    });
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 8) {
        const len = buf.readInt32LE(4);
        if (buf.length < 8 + len) break;
        const msg = JSON.parse(buf.subarray(8, 8 + len).toString('utf8'));
        buf = buf.subarray(8 + len);
        if (msg.evt === 'READY') {
          this.ready = true;
          this.log('discord: conectado');
          this.push();
        } else if (msg.evt === 'ERROR') {
          this.log('discord: erro', msg.data);
        }
      }
    });
    sock.on('error', () => {
      if (this.sock === sock) return; // o 'close' cuida
      sock.destroy();
      this.connect(n + 1); // tenta o próximo pipe
    });
    sock.on('close', () => {
      if (this.sock !== sock) return;
      this.sock = null;
      this.ready = false;
      this.scheduleRetry();
    });
  }

  scheduleRetry() {
    clearTimeout(this.retry);
    if (this.clientId) this.retry = setTimeout(() => this.connect(), 15000);
  }

  close() {
    clearTimeout(this.retry);
    const s = this.sock;
    this.sock = null;
    this.ready = false;
    s?.destroy();
  }

  set(activity) {
    this.activity = activity;
    this.push();
  }

  push() {
    if (!this.ready || !this.sock) return;
    this.sock.write(encode(OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity: this.activity || undefined },
      nonce: String(Date.now() + Math.random()),
    }));
  }
}

// Atividade "Ouvindo" a partir do estado do player (null = some do perfil, ex.: pausado).
// lang: 'pt' ou 'en' (texto do botão).
function activityFor(s, lang = 'en') {
  if (!s?.videoId || !s.playing) return null;
  const now = Date.now();
  const start = now - Math.round(s.time * 1000);
  const cut = (t, n = 128) => (t && t.length > n ? t.slice(0, n - 1) + '…' : t || ' ');
  return {
    type: 2, // "Ouvindo"
    status_display_type: 2, // mostra o nome da música no lugar do nome do app, como o Spotify
    details: cut(s.title),
    state: cut(s.artist),
    timestamps: s.duration ? { start, end: start + Math.round(s.duration * 1000) } : { start },
    assets: {
      large_image: /^https:\/\//.test(s.thumb) ? s.thumb : undefined,
      large_text: cut(s.title),
    },
    buttons: [{ label: lang === 'pt' ? 'Ouvir no YouTube Music' : 'Listen on YouTube Music', url: `https://music.youtube.com/watch?v=${encodeURIComponent(s.videoId)}` }],
  };
}

module.exports = { DiscordPresence, activityFor };
