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

function startSyncServer(options = {}) {
  let port = options.port || 54321;
  let token = options.token || crypto.randomBytes(8).toString('hex');
  const documentsPath = options.documentsPath || path.join(os.homedir(), 'Documents');
  const baseFilesPath = path.join(documentsPath, 'PsProject', 'channels');

  // Garante a existência da pasta base de documentos
  try {
    fs.mkdirSync(baseFilesPath, { recursive: true });
  } catch (err) {
    console.error('[SyncServer] Erro ao criar diretório base PsProject:', err);
  }

  const onSyncRequest =
    options.onSyncRequest ||
    (async () => ({ channels: [], flows: [], deletedChannelIds: [], deletedFlowIds: [] }));
  const onClientConnected = options.onClientConnected || (() => {});
  const onFileReceived = options.onFileReceived || (() => {});

  // Servidor HTTP
  const server = http.createServer(async (req, res) => {
    // Cabeçalhos CORS completos
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Sync-Token, X-Channel-Name, X-File-Name, X-File-Id, X-File-Type'
    );

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // 1. Status Check
    if (url.pathname === '/api/status' && req.method === 'GET') {
      const ips = getLocalIps();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          device: 'Flow Desktop',
          version: '0.3.0',
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
    if (url.pathname === '/api/files/download' && req.method === 'GET') {
      const channelName = decodeURIComponent(url.searchParams.get('channelName') || 'Geral');
      const fileName = decodeURIComponent(url.searchParams.get('fileName') || '');

      if (!fileName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Nome do arquivo não especificado' }));
        return;
      }

      const filePath = path.join(baseFilesPath, sanitizeName(channelName), sanitizeName(fileName));

      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Arquivo não encontrado no disco' }));
        return;
      }

      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`,
      });

      fs.createReadStream(filePath).pipe(res);
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

    // Envia mensagem de boas-vindas e confirmação de conexão
    ws.send(
      JSON.stringify({
        type: 'connected',
        serverTime: Date.now(),
        device: 'Flow Desktop Server',
      })
    );

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
        } else if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (err) {
        console.error('[SyncServer WS] Erro ao processar mensagem WebSocket:', err);
      }
    });

    ws.on('close', () => {
      connectedWsClients.delete(ws);
      console.log(`[SyncServer WS] Cliente desconectado. Ativos: ${connectedWsClients.size}`);
    });

    ws.on('error', (err) => {
      console.warn('[SyncServer WS] Erro no socket cliente:', err.message);
      connectedWsClients.delete(ws);
    });
  });

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
        getQrData: () => ({
          protocol: 'flow-sync',
          version: 2,
          url: `http://${ips[0]}:${activePort}`,
          wsUrl: `ws://${ips[0]}:${activePort}/ws`,
          token,
          deviceName: 'Flow Desktop',
        }),
        regenerateToken: () => {
          token = crypto.randomBytes(8).toString('hex');
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
