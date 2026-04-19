const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const QRCode = require('qrcode');
const { WhatsAppService } = require('./whatsapp');
const { Store } = require('./store');
const { Scheduler } = require('./scheduler');
const { registerIpcHandlers } = require('./ipc-handlers');

let mainWindow;
let whatsappService;
let store;
let scheduler;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'WhatsApp Sender',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#090709',
    icon: (() => {
      const p = path.join(__dirname, '..', '..', 'build', 'icon.png');
      return require('fs').existsSync(p) ? p : undefined;
    })(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.setName('WhatsApp Sender');

app.whenReady().then(() => {
  // macOS dock ikonu
  if (process.platform === 'darwin') {
    try {
      const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.png');
      if (require('fs').existsSync(iconPath)) {
        app.dock.setIcon(iconPath);
      }
    } catch (e) {}
  }
  store = new Store();
  whatsappService = new WhatsAppService();
  scheduler = new Scheduler(whatsappService);

  // macOS edit menüsü — Cmd+A, Cmd+Z, Cmd+C, Cmd+V, Cmd+X
  const menuTemplate = [
    ...(process.platform === 'darwin' ? [{ label: app.getName(), submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ]}] : []),
    { label: 'Düzenle', submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  createWindow();
  registerIpcHandlers(ipcMain, mainWindow, whatsappService, store, scheduler);

  let lastQrDataUrl = null;

  whatsappService.on('qr', async (qr) => {
    lastQrDataUrl = await QRCode.toDataURL(qr, { width: 250, margin: 2 });
  });

  whatsappService.on('ready', () => {
    lastQrDataUrl = null;
  });

  // Renderer polling — WhatsApp durumunu sorgula
  ipcMain.handle('whatsapp:poll', () => {
    return {
      isReady: whatsappService.isReady,
      qr: lastQrDataUrl,
    };
  });

  whatsappService.on('message-status', (data) => {
    mainWindow.webContents.send('whatsapp:message-status', data);
  });

  whatsappService.on('bulk-pause', (data) => {
    mainWindow.webContents.send('bulk:pause', data);
  });

  whatsappService.on('bulk-stopped', (data) => {
    mainWindow.webContents.send('bulk:stopped', data);
  });

  whatsappService.initialize();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  scheduler.stopAll();
  whatsappService.destroy();
  if (process.platform !== 'darwin') app.quit();
});
