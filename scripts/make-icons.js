// Gera os ícones do Vulpi a partir das artes originais:
//   assets/logo-mark.png   (raposa escura, fundo transparente)  -> assets/logo.png (raposa branca, barra lateral)
//   assets/logo-source.jpg (quadro laranja com a raposa)        -> assets/icon.png (ícone da janela) e assets/tray.png (bandeja)
//   assets/app-icon.png    (ícone do app, 512px)               -> assets/icon.ico (atalho da área de trabalho, 16 a 256px)
// Uso: npm run icons
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const asset = (f) => path.join(root, 'assets', f);

// Pinta de branco o que é escuro; o resto fica transparente.
// O Electron trabalha com BGRA pré-multiplicado (cor já multiplicada pelo alfa).
function whiteMark() {
  const src = nativeImage.createFromPath(asset('logo-mark.png'));
  const { width, height } = src.getSize();
  const bmp = src.toBitmap();
  const out = Buffer.alloc(bmp.length);
  for (let i = 0; i < bmp.length; i += 4) {
    const a0 = bmp[i + 3] / 255;
    const r = a0 ? bmp[i + 2] / a0 : 255;
    const a = a0 * Math.max(0, Math.min(1, (240 - r) / 200));
    out[i] = out[i + 1] = out[i + 2] = Math.round(255 * a);
    out[i + 3] = Math.round(a * 255);
  }
  return nativeImage.createFromBitmap(out, { width, height });
}

// Quadro laranja com a raposa escura, recortado da arte original.
function tile() {
  const src = nativeImage.createFromPath(asset('logo-source.jpg'));
  return src.crop({ x: 254, y: 190, width: 500, height: 500 });
}

// .ico com vários tamanhos (cada um é um PNG dentro do arquivo), para o atalho ficar nítido.
function ico(img, sizes) {
  const pngs = sizes.map((s) => img.resize({ width: s, height: s, quality: 'best' }).toPNG());
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const o = 6 + i * 16;
    head[o] = s >= 256 ? 0 : s;
    head[o + 1] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(pngs[i].length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += pngs[i].length;
  });
  return Buffer.concat([head, ...pngs]);
}

app.whenReady().then(() => {
  fs.writeFileSync(asset('icon.ico'), ico(nativeImage.createFromPath(asset('app-icon.png')), [16, 24, 32, 48, 64, 128, 256]));
  fs.writeFileSync(asset('logo.png'), whiteMark().resize({ width: 192, quality: 'best' }).toPNG());
  fs.writeFileSync(asset('icon.png'), tile().resize({ width: 256, quality: 'best' }).toPNG());
  fs.writeFileSync(asset('tray.png'), tile().resize({ width: 32, quality: 'best' }).toPNG());
  console.log('ok');
  app.quit();
});
