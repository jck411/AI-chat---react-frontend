const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev'); // Optional: To detect development mode

// Disable GPU acceleration for better compatibility
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('enable-software-rasterizer');

// Set GTK_MODULES environment variable
process.env.GTK_MODULES = process.env.GTK_MODULES
  ? `${process.env.GTK_MODULES}:xapp-gtk3-module`
  : 'xapp-gtk3-module';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 680,
    webPreferences: {
      nodeIntegration: true, // Depending on your security needs
      contextIsolation: false, // Depending on your security needs
      preload: path.join(__dirname, 'preload.js'), // If you use a preload script
    },
  });

  const startURL = isDev
    ? 'http://localhost:3000' // React dev server
    : `file://${path.join(__dirname, '../build/index.html')}`; // Production build

  mainWindow.loadURL(startURL);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => (mainWindow = null));
}

// Handle IPC events if needed
ipcMain.on('some-event', (event, args) => {
  // Handle events from renderer
});

app.whenReady().then(createWindow);

// macOS specific behavior
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
