// Instala o Vulpi empacotado (dist/win-unpacked, gerado por `npm run dist`) só para este usuário:
// copia para %LOCALAPPDATA%\Programs\Vulpi, cria atalhos na área de trabalho e no Menu Iniciar
// e registra em "Aplicativos instalados" (com desinstalador).
// O instalador NSIS do electron-builder não funciona com o "Controle Inteligente de Aplicativos"
// do Windows 11 ligado (ele bloqueia um executável temporário que o NSIS precisa rodar).
// Uso: npm run dist && npm run install-app
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'dist', 'win-unpacked');
const dest = path.join(process.env.LOCALAPPDATA, 'Programs', 'Vulpi');
const exe = path.join(dest, 'Vulpi.exe');
const { version } = require('../package.json');

if (!fs.existsSync(path.join(src, 'Vulpi.exe'))) {
  console.error('Rode antes: npm run dist');
  process.exit(1);
}

const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'inherit' });
const q = (s) => `'${s.replace(/'/g, "''")}'`; // string do PowerShell

// Fecha o Vulpi instalado, se estiver aberto (os arquivos ficam presos).
ps(`Get-Process Vulpi -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq ${q(exe)} } | Stop-Process -Force; Start-Sleep 1`);

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
fs.copyFileSync(path.join(root, 'assets', 'icon.ico'), path.join(dest, 'icon.ico'));
// O electron-builder altera alguns bytes do executável, e o "Controle Inteligente de Aplicativos"
// do Windows bloqueia executáveis desconhecidos. O electron.exe original (o mesmo de `npm start`)
// é conhecido e roda normalmente: usamos ele como Vulpi.exe (ele carrega o app de resources/app.asar).
fs.copyFileSync(require.resolve('electron/dist/electron.exe', { paths: [root] }), exe);

// Desinstalador: tira atalhos, registro e a pasta (as configurações em %APPDATA%\Vulpi ficam).
fs.writeFileSync(path.join(dest, 'uninstall.cmd'), [
  '@echo off',
  'taskkill /im Vulpi.exe /f >nul 2>&1',
  'del "%USERPROFILE%\\Desktop\\Vulpi.lnk" >nul 2>&1',
  'del "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Vulpi.lnk" >nul 2>&1',
  'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Vulpi" /f >nul 2>&1',
  'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v com.vulpi.app /f >nul 2>&1',
  'cd /d "%TEMP%"',
  `start "" /b cmd /c "timeout /t 2 >nul & rmdir /s /q ""${dest}"""`,
  '',
].join('\r\n'));

ps(`
$ws = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'))) {
  $l = $ws.CreateShortcut((Join-Path $dir 'Vulpi.lnk'))
  $l.TargetPath = ${q(exe)}
  $l.Arguments = ''
  $l.WorkingDirectory = ${q(dest)}
  $l.IconLocation = ${q(path.join(dest, 'icon.ico'))} + ',0'
  $l.Description = 'Vulpi - YouTube Music player'
  $l.Save()
}
$k = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Vulpi'
New-Item $k -Force | Out-Null
Set-ItemProperty $k DisplayName 'Vulpi'
Set-ItemProperty $k DisplayVersion ${q(version)}
Set-ItemProperty $k Publisher 'Vulpi'
Set-ItemProperty $k DisplayIcon ${q(path.join(dest, 'icon.ico'))}
Set-ItemProperty $k InstallLocation ${q(dest)}
Set-ItemProperty $k UninstallString ('"' + ${q(path.join(dest, 'uninstall.cmd'))} + '"')
Set-ItemProperty $k NoModify 1 -Type DWord
Set-ItemProperty $k NoRepair 1 -Type DWord
ie4uinit.exe -show
`);

console.log(`Vulpi ${version} instalado em ${dest}`);
