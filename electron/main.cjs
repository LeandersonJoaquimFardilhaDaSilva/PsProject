const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 840,
    minHeight: 560,
    frame: false,
    backgroundColor: '#0a0a0f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Mostra a janela suavemente assim que o conteúdo estiver pronto
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.env.ELECTRON_TEST === 'true') {
      setTimeout(() => {
        console.log('TEST_ELECTRON_SUCCESS');
        app.quit();
      }, 1200);
    }
  });

  // Interceptar cliques em links que abririam nova aba/janela e abrir no navegador padrão do SO
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : null);

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl).catch((err) => {
      console.error('Falha ao carregar servidor dev Vite, tentando novamente...', err);
      setTimeout(() => mainWindow.loadURL(devServerUrl), 1500);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Notificar o renderer quando o estado de maximização mudar
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized-change', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized-change', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers para os botões da TitleBar
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('is-window-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('open-external', async (_, url) => {
  if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
