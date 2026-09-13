const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { startSyncServer, getLocalIps, sanitizeName } = require('./syncServer.cjs');

let mainWindow = null;
let syncServerInstance = null;

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

// IPC Handler para Raspagem Nativa de Links (Sem restrições de CORS no Desktop)
ipcMain.handle('fetch-direct-html', async (_, targetUrl) => {
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    throw new Error('URL inválida para extração de metadados');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.html); Twitterbot/1.0; Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 FlowApp/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const html = await res.text();
    return html;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
});

// IPC Handlers do Servidor de Sincronização Local
ipcMain.handle('get-sync-info', () => {
  if (!syncServerInstance) {
    const ips = getLocalIps();
    return {
      running: false,
      port: 54321,
      token: '',
      ips,
      qrData: null,
    };
  }
  return {
    running: true,
    port: syncServerInstance.port,
    token: syncServerInstance.token,
    ips: syncServerInstance.ips,
    qrData: syncServerInstance.getQrData(),
  };
});

ipcMain.handle('regenerate-sync-token', () => {
  if (syncServerInstance) {
    syncServerInstance.regenerateToken();
    return {
      running: true,
      port: syncServerInstance.port,
      token: syncServerInstance.token,
      ips: syncServerInstance.ips,
      qrData: syncServerInstance.getQrData(),
    };
  }
  return null;
});

// Handlers de Arquivos no Diretório Documents (v0.3.0)
ipcMain.handle('get-documents-folder', () => {
  const docs = app.getPath('documents');
  const target = path.join(docs, 'PsProject', 'channels');
  if (!fs.existsSync(target)) {
    try {
      fs.mkdirSync(target, { recursive: true });
    } catch {
      // Ignora
    }
  }
  return target;
});

ipcMain.handle('save-file-to-documents', async (_, { channelName, fileName, bufferData }) => {
  const docs = app.getPath('documents');
  const safeChannel = sanitizeName(channelName || 'Geral');
  const safeFile = sanitizeName(fileName || `arquivo_${Date.now()}`);
  const targetDir = path.join(docs, 'PsProject', 'channels', safeChannel);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const filePath = path.join(targetDir, safeFile);
  const buffer = Buffer.from(bufferData);
  await fs.promises.writeFile(filePath, buffer);

  return {
    filePath,
    fileSize: buffer.length,
    fileName: safeFile,
    channelName: safeChannel,
  };
});

ipcMain.handle('open-file-location', async (_, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

ipcMain.handle('open-file-external', async (_, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    await shell.openPath(filePath);
    return true;
  }
  return false;
});

ipcMain.handle('broadcast-sync-push', (_, data) => {
  if (syncServerInstance?.broadcast) {
    syncServerInstance.broadcast(data);
    return true;
  }
  return false;
});

ipcMain.handle('register-original-file', (_, { fileId, originalPath, fileName, fileSize }) => {
  if (syncServerInstance?.registerOriginalFile) {
    syncServerInstance.registerOriginalFile(fileId, originalPath, fileName, fileSize);
    return true;
  }
  return false;
});

ipcMain.handle('request-file-download-from-mobile', (_, { fileId, channelName, fileName }) => {
  if (syncServerInstance?.broadcast) {
    syncServerInstance.broadcast({
      type: 'request_file_transfer',
      fileId,
      channelName,
      fileName,
    });
    return true;
  }
  return false;
});

ipcMain.handle('send-net-test-ping', (_, data) => {
  if (syncServerInstance?.broadcast) {
    syncServerInstance.broadcast({ type: 'net_ping', ...data });
    return true;
  }
  return false;
});

ipcMain.handle('send-net-test-pong', (_, data) => {
  if (syncServerInstance?.broadcast) {
    syncServerInstance.broadcast({ type: 'net_pong', ...data });
    return true;
  }
  return false;
});

ipcMain.handle('broadcast-direct-event', (_, data) => {
  if (syncServerInstance?.broadcast) {
    syncServerInstance.broadcast({ type: 'direct_event', ...data });
    return true;
  }
  return false;
});

app.whenReady().then(async () => {
  try {
    syncServerInstance = await startSyncServer({
      documentsPath: app.getPath('documents'),
      onFileReceived: (fileInfo) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file-received-from-mobile', fileInfo);
        }
      },
      onFileProgress: (progressInfo) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('file-transfer-progress', progressInfo);
        }
      },
      onNetTestPing: (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('net-test-ping-received', data);
        }
      },
      onNetTestPong: (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('net-test-pong-received', data);
        }
      },
      onDirectEvent: (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('direct-event-received', data);
        }
      },
      onSyncRequest: async (payload) => {
        if (!mainWindow || mainWindow.isDestroyed()) {
          throw new Error('Janela do aplicativo não está disponível para sincronizar');
        }
        return new Promise((resolve, reject) => {
          const syncId = Math.random().toString(36).slice(2);
          const timer = setTimeout(() => {
            ipcMain.removeHandler(`sync-response-${syncId}`);
            reject(new Error('Tempo limite para reconciliação no desktop esgotado'));
          }, 10000);

          ipcMain.handleOnce(`sync-response-${syncId}`, (_event, mergedResult) => {
            clearTimeout(timer);
            resolve(mergedResult);
          });

          mainWindow.webContents.send('sync-incoming', {
            syncId,
            channels: payload.channels || [],
            flows: payload.flows || [],
            deletedChannelIds: payload.deletedChannelIds || [],
            deletedFlowIds: payload.deletedFlowIds || [],
          });
        });
      },
      onClientConnected: (clientInfo) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync-client-connected', clientInfo);
        }
      },
    });
  } catch (err) {
    console.error('Falha ao iniciar o servidor de sincronização:', err);
  }

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

