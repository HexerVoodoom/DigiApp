// DigiApp Desktop — processo principal do Electron.
// Cria uma faixa transparente, sempre no topo, encostada na barra de tarefas
// do Windows. O pet anda nessa faixa; a janela é "click-through" (cliques
// atravessam para o que estiver embaixo) exceto quando o mouse está sobre o
// pet ou o menu — o renderer avisa via IPC ('set-interactive').
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('node:path');

// Altura da faixa: o pet fica no rodapé (~96px) e o menu/balão abre acima.
const STRIP_HEIGHT = 360;
const FULL_APP_URL = 'https://digiapp-a5e.pages.dev';

/** @type {BrowserWindow | null} */
let overlayWin = null;
/** @type {BrowserWindow | null} */
let fullAppWin = null;
/** @type {Tray | null} */
let tray = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (overlayWin) overlayWin.showInactive();
  });

  app.whenReady().then(() => {
    createOverlay();
    createTray();
    screen.on('display-metrics-changed', positionOverlay);
    screen.on('display-added', positionOverlay);
    screen.on('display-removed', positionOverlay);
  });
}

function positionOverlay() {
  if (!overlayWin) return;
  // workArea exclui a barra de tarefas → o rodapé da janela encosta no topo
  // da barra, e o pet "anda em cima" dela como se fosse o chão.
  const wa = screen.getPrimaryDisplay().workArea;
  overlayWin.setBounds({
    x: wa.x,
    y: wa.y + wa.height - STRIP_HEIGHT,
    width: wa.width,
    height: STRIP_HEIGHT,
  });
}

function createOverlay() {
  const wa = screen.getPrimaryDisplay().workArea;
  overlayWin = new BrowserWindow({
    x: wa.x,
    y: wa.y + wa.height - STRIP_HEIGHT,
    width: wa.width,
    height: STRIP_HEIGHT,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 'screen-saver' fica acima de (quase) tudo, inclusive da própria taskbar.
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Começa deixando tudo atravessar; forward:true mantém os mousemove
  // chegando ao renderer (só funciona no Windows — nosso alvo).
  overlayWin.setIgnoreMouseEvents(true, { forward: true });

  overlayWin.loadFile(path.join(__dirname, '..', 'dist-renderer', 'index.html'));
  overlayWin.once('ready-to-show', () => overlayWin.showInactive());
  overlayWin.on('closed', () => { overlayWin = null; });
}

function createTray() {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, 'assets', 'icon.png'))
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('DigiApp Desktop');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Mostrar/ocultar pet',
      click: () => {
        if (!overlayWin) return;
        overlayWin.isVisible() ? overlayWin.hide() : overlayWin.showInactive();
      },
    },
    { label: 'Abrir DigiApp completo', click: openFullApp },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]));
}

function openFullApp() {
  if (fullAppWin) {
    fullAppWin.focus();
    return;
  }
  // O app web completo (mesmo do celular): logando com o mesmo e-mail, o
  // cloud save já sincroniza o progresso — o overlay ainda não (ver README).
  fullAppWin = new BrowserWindow({
    width: 480,
    height: 860,
    title: 'DigiApp',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  fullAppWin.loadURL(FULL_APP_URL);
  fullAppWin.on('closed', () => { fullAppWin = null; });
}

ipcMain.on('set-interactive', (_e, on) => {
  if (!overlayWin) return;
  overlayWin.setIgnoreMouseEvents(!on, { forward: true });
});

ipcMain.on('open-full-app', openFullApp);
ipcMain.on('overlay-quit', () => app.quit());

app.on('window-all-closed', () => {
  // Overlay é o app: fechar tudo = sair (sem comportamento macOS de ficar vivo).
  app.quit();
});
