const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  ips.sort((a, b) => {
    const aPrivate = a.startsWith('192.168.') || a.startsWith('10.') || a.startsWith('172.');
    const bPrivate = b.startsWith('192.168.') || b.startsWith('10.') || b.startsWith('172.');
    if (aPrivate && !bPrivate) return -1;
    if (!aPrivate && bPrivate) return 1;
    return 0;
  });
  return ips.length > 0 ? ips : ['127.0.0.1'];
}

function sanitizeName(name) {
  if (!name) return 'geral';
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'geral';
}

function isLoopbackAddress(addr) {
  if (!addr) return false;
  return (
    addr === '127.0.0.1' ||
    addr === '::1' ||
    addr === '::ffff:127.0.0.1' ||
    addr.startsWith('127.') ||
    addr === 'localhost'
  );
}

function isLocalExtension(req) {
  const remote = req.socket.remoteAddress || '';
  if (!isLoopbackAddress(remote)) return false;
  const clientHeader = (req.headers['x-flow-client'] || req.headers['x-tove-client'] || '').toLowerCase();
  const origin = req.headers['origin'] || '';
  const isExtensionOrigin =
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('edge-extension://') ||
    origin.startsWith('moz-extension://');
  return clientHeader === 'extension' || clientHeader === 'tove-extension' || isExtensionOrigin;
}

function isAuthorizedExtension(req, serverToken) {
  if (isLocalExtension(req)) return true;
  const reqToken =
    req.headers['x-sync-token'] ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    new URL(req.url, 'http://localhost').searchParams.get('token');
  return Boolean(reqToken && reqToken === serverToken);
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json',
  };
  return map[ext] || 'application/octet-stream';
}

function startSyncServer(options = {}) {
  let port = options.port || 54321;
  const documentsPath = options.documentsPath || path.join(os.homedir(), 'Documents');
  const baseFilesPath = path.join(documentsPath, 'Tove', 'channels');
  const legacyFilesPath = path.join(documentsPath, 'PsProject', 'channels');
  const tokenFilePath = path.join(documentsPath, 'Tove', 'sync_token.txt');
  const legacyTokenFilePath = path.join(documentsPath, 'PsProject', 'sync_token.txt');

  // Garante a existência da pasta base de documentos
  try {
    fs.mkdirSync(baseFilesPath, { recursive: true });
  } catch (err) {
    console.error('[SyncServer] Erro ao criar diretório base Tove:', err);
  }

  // Token persistente em disco para evitar que reinicializações do PC invalidem o pareamento do celular
  let token = options.token;
  if (!token) {
    try {
      if (fs.existsSync(tokenFilePath)) {
        token = fs.readFileSync(tokenFilePath, 'utf8').trim();
      } else if (fs.existsSync(legacyTokenFilePath)) {
        token = fs.readFileSync(legacyTokenFilePath, 'utf8').trim();
      }
    } catch {}
  }
  if (!token || token.length < 8) {
    token = crypto.randomBytes(8).toString('hex');
    try {
      fs.writeFileSync(tokenFilePath, token, 'utf8');
    } catch {}
  }

  const fileRegistry = new Map();
  const fileRegistryPath = path.join(documentsPath, 'Tove', 'file_registry.json');
  const legacyFileRegistryPath = path.join(documentsPath, 'PsProject', 'file_registry.json');
  try {
    const regPathToRead = fs.existsSync(fileRegistryPath) ? fileRegistryPath : legacyFileRegistryPath;
    if (fs.existsSync(regPathToRead)) {
      const parsed = JSON.parse(fs.readFileSync(regPathToRead, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'object' && v.originalPath && fs.existsSync(v.originalPath)) {
          fileRegistry.set(k, v);
        }
      }
    }
  } catch (err) {
    console.warn('[SyncServer] Aviso ao carregar file_registry.json:', err);
  }

  function persistFileRegistry() {
    try {
      const obj = Object.fromEntries(fileRegistry);
      fs.writeFileSync(fileRegistryPath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.warn('[SyncServer] Erro ao salvar file_registry.json:', err);
    }
  }

  const onSyncRequest =
    options.onSyncRequest ||
    (async () => ({ channels: [], flows: [], deletedChannelIds: [], deletedFlowIds: [] }));
  const onGetData = options.onGetData || (async () => ({ channels: [], flows: [] }));
  const onAddLink = options.onAddLink || (async (link) => link);
  const onClientConnected = options.onClientConnected || (() => {});
  const onWsClientCountChange = options.onWsClientCountChange || (() => {});
  const onClientActivity = options.onClientActivity || (() => {});
  const onFileReceived = options.onFileReceived || (() => {});
  const onFileProgress = options.onFileProgress || (() => {});
  const onNetTestPing = options.onNetTestPing || (() => {});
  const onNetTestPong = options.onNetTestPong || (() => {});
  const onDirectEvent = options.onDirectEvent || (() => {});

  // Servidor HTTP
  const server = http.createServer(async (req, res) => {
    // Cabeçalhos CORS completos
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Sync-Token, X-Channel-Name, X-File-Name, X-File-Id, X-File-Type, X-Flow-Client, X-Tove-Client, Range'
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Disposition, X-File-Size, X-File-Name, Content-Range, Accept-Ranges'
    );

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // 0. Endpoints da Extensão do Navegador (Chrome/Edge/Brave) & API
    if ((url.pathname === '/api/data' || url.pathname === '/data') && req.method === 'GET') {
      if (!isAuthorizedExtension(req, token)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Não autorizado. Conecte pelo mesmo computador ou utilize o token de sincronização.' }));
        return;
      }

      try {
        const storeData = await onGetData();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            channels: storeData.channels || [],
            flows: storeData.flows || [],
          })
        );
      } catch (err) {
        console.error('[SyncServer] Erro ao obter dados para a extensão:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Erro ao carregar dados' }));
      }
      return;
    }

    if ((url.pathname === '/api/links' || url.pathname === '/links') && req.method === 'POST') {
      if (!isAuthorizedExtension(req, token)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Não autorizado.' }));
        return;
      }

      let bodyData = '';
      req.on('data', (chunk) => {
        bodyData += chunk;
        if (bodyData.length > 10 * 1024 * 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload de link muito grande' }));
          req.destroy();
        }
      });

      req.on('end', async () => {
        try {
          const payload = JSON.parse(bodyData || '{}');
          if (!payload.url && !payload.text) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'URL ou texto não fornecido' }));
            return;
          }

          const createdItem = await onAddLink(payload);
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', item: createdItem }));
        } catch (err) {
          console.error('[SyncServer] Erro ao processar link da extensão:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Erro ao processar link' }));
        }
      });
      return;
    }

    if ((url.pathname === '/api/pairing-qr' || url.pathname === '/pairing-qr') && req.method === 'GET') {
      const qrData = {
        protocol: 'flow-sync',
        version: 2,
        url: `http://${getLocalIps()[0]}:${port}`,
        wsUrl: `ws://${getLocalIps()[0]}:${port}/ws`,
        token,
        deviceName: 'Tove Desktop',
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          payload: JSON.stringify(qrData),
          qrData,
          token,
          server: `http://${getLocalIps()[0]}:${port}/api`,
        })
      );
      return;
    }

    if ((url.pathname === '/api/pair' || url.pathname === '/pair') && req.method === 'POST') {
      let bodyData = '';
      req.on('data', (chunk) => { bodyData += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(bodyData || '{}');
          const clientToken = payload.invitation || payload.token || '';
          if (clientToken && clientToken !== token) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Token inválido' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', token }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Erro ao parear' }));
        }
      });
      return;
    }

    // 1. Status Check
    if ((url.pathname === '/api/status' || url.pathname === '/status') && req.method === 'GET') {
      const ips = getLocalIps();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          device: 'Tove Desktop',
          version: '1.1.0',
          websocketUrl: `ws://${ips[0]}:${port}/ws`,
          ip: ips[0],
          port,
          documentsPath: baseFilesPath,
        })
      );
      return;
    }

    // 2. Upload Binário Puro via Stream direto para o disco (Pipe)
    // Rota separada para arquivos pesados (0% overhead, sem Base64, sem RAM buffer)
    if (url.pathname === '/api/files/upload' && req.method === 'POST') {
      const reqToken =
        req.headers['x-sync-token'] ||
        req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
        url.searchParams.get('token');

      if (reqToken !== token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Token inválido' }));
        return;
      }

      const channelName =
        decodeURIComponent(req.headers['x-channel-name'] || url.searchParams.get('channelName') || 'Geral');
      const rawFileName =
        decodeURIComponent(req.headers['x-file-name'] || url.searchParams.get('fileName') || `arquivo_${Date.now()}`);
      const fileId = req.headers['x-file-id'] || url.searchParams.get('fileId') || crypto.randomUUID();

      const safeChannel = sanitizeName(channelName);
      const safeFileName = sanitizeName(rawFileName);
      const targetDir = path.join(baseFilesPath, safeChannel);

      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch (err) {
        console.error('[SyncServer] Erro ao criar pasta do canal:', err);
      }

      const targetFilePath = path.join(targetDir, safeFileName);
      const writeStream = fs.createWriteStream(targetFilePath);

      let bytesWritten = 0;
      const startTime = performance.now();

      req.on('data', (chunk) => {
        bytesWritten += chunk.length;
      });

      req.pipe(writeStream);

      writeStream.on('finish', () => {
        const durationSec = Math.max(0.001, (performance.now() - startTime) / 1000);
        const speedMBs = (bytesWritten / (1024 * 1024) / durationSec).toFixed(2);

        console.log(
          `[SyncServer] Arquivo gravado via Stream: ${safeFileName} (${(bytesWritten / (1024 * 1024)).toFixed(2)} MB a ${speedMBs} MB/s)`
        );

        const result = {
          status: 'ok',
          fileId,
          fileName: safeFileName,
          channelName: safeChannel,
          filePath: targetFilePath,
          fileSize: bytesWritten,
          speed: `${speedMBs} MB/s`,
          savedAt: Date.now(),
        };

        // Registra o arquivo salvo
        fileRegistry.set(fileId, { originalPath: targetFilePath, fileName: safeFileName, fileSize: bytesWritten });
        persistFileRegistry();

        onFileReceived(result);

        // Notifica clientes WebSocket em tempo real sobre o novo arquivo recebido
        broadcastWs({
          type: 'file_uploaded',
          data: result,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      });

      writeStream.on('error', (err) => {
        console.error('[SyncServer] Erro no stream de escrita de arquivo:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Erro ao gravar arquivo no disco' }));
      });

      return;
    }

    // 3. Download de Arquivos Binários via Stream direto do disco
    // Envia o arquivo diretamente de sua localização original (Downloads, DCIM, Documents, etc.)
    if (url.pathname === '/api/files/download' && req.method === 'GET') {
      const fileId = url.searchParams.get('fileId');
      const rawDirectPath = url.searchParams.get('filePath') || '';
      let directPath = '';
      try {
        directPath = decodeURIComponent(rawDirectPath).trim();
      } catch {
        directPath = rawDirectPath.trim();
      }
      const channelName = decodeURIComponent(url.searchParams.get('channelName') || 'Geral');
      const rawFileName = decodeURIComponent(url.searchParams.get('fileName') || '');

      let targetFilePath = null;

      // 1. Prioridade: busca pelo fileId registrado no PC (caminho original, ex: Downloads, DCIM, Desktop)
      if (fileId && fileRegistry.has(fileId)) {
        const reg = fileRegistry.get(fileId);
        if (reg.originalPath && fs.existsSync(reg.originalPath)) {
          targetFilePath = reg.originalPath;
        }
      }

      // 2. Prioridade: busca pelo caminho absoluto direto fornecido
      if (!targetFilePath && directPath && fs.existsSync(directPath)) {
        targetFilePath = directPath;
      }

      // 3. Fallback: busca na pasta Documents/Tove/channels/[channelName]/[fileName] ou PsProject legado
      if (!targetFilePath && rawFileName) {
        const fallbackPath = path.join(baseFilesPath, sanitizeName(channelName), sanitizeName(rawFileName));
        const legacyFallbackPath = path.join(legacyFilesPath, sanitizeName(channelName), sanitizeName(rawFileName));
        if (fs.existsSync(fallbackPath)) {
          targetFilePath = fallbackPath;
        } else if (fs.existsSync(legacyFallbackPath)) {
          targetFilePath = legacyFallbackPath;
        }
      }

      // 4. Fallback: busca por correspondência de nome no fileRegistry
      if (!targetFilePath && rawFileName) {
        for (const reg of fileRegistry.values()) {
          if (reg.fileName === rawFileName && reg.originalPath && fs.existsSync(reg.originalPath)) {
            targetFilePath = reg.originalPath;
            break;
          }
        }
      }

      if (!targetFilePath || !fs.existsSync(targetFilePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Arquivo original não encontrado no disco do servidor' }));
        return;
      }

      const stat = fs.statSync(targetFilePath);
      const downloadName = rawFileName || path.basename(targetFilePath);
      const mimeType = getMimeType(downloadName);
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': mimeType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(downloadName)}"`,
          'X-File-Size': stat.size.toString(),
          'X-File-Name': encodeURIComponent(downloadName),
        });

        fs.createReadStream(targetFilePath, { start, end }).pipe(res);
        return;
      }

      const isInline =
        url.searchParams.get('stream') === '1' ||
        url.searchParams.get('inline') === '1' ||
        mimeType === 'application/pdf' ||
        mimeType.startsWith('video/') ||
        mimeType.startsWith('image/');

      res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': isInline
          ? `inline; filename="${encodeURIComponent(downloadName)}"`
          : `attachment; filename="${encodeURIComponent(downloadName)}"`,
        'X-File-Size': stat.size.toString(),
        'X-File-Name': encodeURIComponent(downloadName),
      });

      fs.createReadStream(targetFilePath).pipe(res);
      return;
    }

    // 4. Sincronização de Metadados e Mensagens (HTTP Fallback)
    if (url.pathname === '/api/sync' && req.method === 'POST') {
      let bodyData = '';
      req.on('data', (chunk) => {
        bodyData += chunk;
        if (bodyData.length > 50 * 1024 * 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload de dados muito grande' }));
          req.destroy();
        }
      });

      req.on('end', async () => {
        try {
          const payload = JSON.parse(bodyData || '{}');
          if (payload.token !== token) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Token de pareamento inválido' }));
            return;
          }

          onClientConnected({
            ip: req.socket.remoteAddress,
            timestamp: Date.now(),
            device: payload.deviceName || 'Mobile Device',
          });

          const mergedResult = await onSyncRequest(payload);

          // Notifica clientes WebSocket conectados
          broadcastWs({
            type: 'sync_data_updated',
            data: {
              timestamp: Date.now(),
              itemsCount: mergedResult.flows?.length || 0,
            },
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'ok',
              syncedAt: Date.now(),
              channels: mergedResult.channels || [],
              flows: mergedResult.flows || [],
              deletedChannelIds: mergedResult.deletedChannelIds || [],
              deletedFlowIds: mergedResult.deletedFlowIds || [],
            })
          );
        } catch (err) {
          console.error('[SyncServer] Erro na sincronização:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Erro interno' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rota não encontrada' }));
  });

  // Servidor WebSocket integrado na mesma porta
  const wss = new WebSocketServer({ noServer: true });
  const connectedWsClients = new Set();

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/ws') {
      const clientToken = url.searchParams.get('token');
      if (clientToken && clientToken !== token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req) => {
    connectedWsClients.add(ws);
    const clientIp = req.socket.remoteAddress;
    console.log(`[SyncServer WS] Cliente conectado: ${clientIp} (Total: ${connectedWsClients.size})`);
    onWsClientCountChange(connectedWsClients.size);
    onClientConnected({
      ip: clientIp,
      timestamp: Date.now(),
      device: 'Celular (WebSocket)',
    });

    // Envia mensagem de boas-vindas e confirmação de conexão
    ws.send(
      JSON.stringify({
        type: 'connected',
        serverTime: Date.now(),
        device: 'Flow Desktop Server',
      })
    );

    const handleDisconnect = () => {
      if (connectedWsClients.has(ws)) {
        connectedWsClients.delete(ws);
        console.log(`[SyncServer WS] Cliente desconectado: ${clientIp}. Ativos: ${connectedWsClients.size}`);
        onWsClientCountChange(connectedWsClients.size);
      }
    };

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'sync_request') {
          const mergedResult = await onSyncRequest(data.payload);
          ws.send(
            JSON.stringify({
              type: 'sync_response',
              data: mergedResult,
            })
          );
          // Propaga as mudanças para os demais clientes
          broadcastWs(
            {
              type: 'sync_data_updated',
              data: mergedResult,
            },
            ws
          );
          onClientActivity({
            ip: clientIp,
            timestamp: Date.now(),
            device: 'Celular (WebSocket)',
          });
        } else if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          onClientActivity({
            ip: clientIp,
            timestamp: Date.now(),
            device: 'Celular (WebSocket)',
          });
        } else if (data.type === 'pong') {
          onClientActivity({
            ip: clientIp,
            timestamp: Date.now(),
            device: 'Celular (WebSocket)',
          });
        } else if (data.type === 'direct_event') {
          // Evento granular em tempo real (< 10ms)
          onDirectEvent(data);
          broadcastWs(data, ws);
          onClientActivity({
            ip: clientIp,
            timestamp: Date.now(),
            device: 'Celular (WebSocket)',
          });
        } else if (data.type === 'net_ping') {
          // Sinal de Ping do Teste de Rede
          onNetTestPing(data);
          broadcastWs(data, ws);
        } else if (data.type === 'net_pong') {
          // Sinal de Pong do Teste de Rede
          onNetTestPong(data);
          broadcastWs(data, ws);
        } else if (data.type === 'request_file_transfer') {
          // Repassa pedido de transferência de arquivo para outros dispositivos conectados
          broadcastWs(data, ws);
        } else if (data.type === 'file_transfer_progress') {
          // Repassa progresso para o PC e outros clientes
          onFileProgress(data);
          broadcastWs(data, ws);
        }
      } catch (err) {
        console.error('[SyncServer WS] Erro ao processar mensagem WebSocket:', err);
      }
    });

    ws.on('close', handleDisconnect);

    ws.on('error', (err) => {
      console.warn('[SyncServer WS] Erro no socket cliente:', err.message);
      handleDisconnect();
    });
  });

  // Heartbeat periódico (a cada 15 segundos) para manter ativas conexões no Android WebView / NAT
  const heartbeatInterval = setInterval(() => {
    for (const client of connectedWsClients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify({ type: 'server_ping', timestamp: Date.now() }));
        } catch {
          connectedWsClients.delete(client);
          onWsClientCountChange(connectedWsClients.size);
        }
      } else {
        connectedWsClients.delete(client);
        onWsClientCountChange(connectedWsClients.size);
      }
    }
  }, 15000);

  function broadcastWs(data, excludeWs = null) {
    const payload = JSON.stringify(data);
    for (const client of connectedWsClients) {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch {
          // Ignora clientes com conexão instável
        }
      }
    }
  }

  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      const activePort = server.address().port;
      const ips = getLocalIps();
      console.log(`[SyncServer] Servidor HTTP e WebSocket ativo em http://${ips[0]}:${activePort}`);
      resolve({
        server,
        wss,
        port: activePort,
        token,
        ips,
        documentsPath: baseFilesPath,
        broadcast: broadcastWs,
        registerOriginalFile: (fileId, originalPath, fileName, fileSize) => {
          fileRegistry.set(fileId, { originalPath, fileName, fileSize });
          persistFileRegistry();
          return true;
        },
        getClientCount: () => connectedWsClients.size,
        getFileRegistry: () => fileRegistry,
        getQrData: () => ({
          protocol: 'flow-sync',
          version: 2,
          url: `http://${ips[0]}:${activePort}`,
          wsUrl: `ws://${ips[0]}:${activePort}/ws`,
          token,
          deviceName: 'Tove Desktop',
        }),
        regenerateToken: () => {
          token = crypto.randomBytes(8).toString('hex');
          try {
            fs.writeFileSync(tokenFilePath, token, 'utf8');
          } catch {}
          return token;
        },
      });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[SyncServer] Porta ${port} em uso, tentando porta ${port + 1}...`);
        port += 1;
        server.listen(port, '0.0.0.0');
      } else {
        console.error('[SyncServer] Erro no servidor:', err);
      }
    });
  });
}

module.exports = {
  startSyncServer,
  getLocalIps,
  sanitizeName,
};
