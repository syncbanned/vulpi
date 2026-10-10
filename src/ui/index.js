// Junta a interface própria (src/ui) num script só, para injetar na página do YouTube Music.
const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const png = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', '..', 'assets', f)).toString('base64');

module.exports = `(() => {
if (location.hostname !== 'music.youtube.com' || window.__vulpiUI) return;
window.__vulpiUI = true;
const VULPI_CSS = ${JSON.stringify(read('app.css'))};
const VULPI_LOGO = ${JSON.stringify(png('logo.png'))};
const VULPI_ICON = ${JSON.stringify(png('icon.png'))};
${['i18n.js', 'icons.js', 'data.js', 'player.js', 'extras.js', 'app.js'].map(read).join(';\n')}
})();`;
