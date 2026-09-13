const http = require('http');
const os = require('os');
const crypto = require('crypto');

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
  // Priorizar redes locais mais comuns (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  ips.sort((a, b) => {
    const aPrivate = a.startsWith('192.168.') || a.startsWith('10.') || a.startsWith('172.');
    const bPrivate = b.startsWith('192.168.') || b.startsWith('10.') || b.startsWith('172.');
    if (aPrivate && !bPrivate) return -1;
    if (!aPrivate && bPrivate) return 1;
    return 0;
  });
  return ips.length > 0 ? ips : ['127.0.0.1'];
}

function startSyncServer(options = {}) {
  let port = options.port || 54321;
  let token = options.token || crypto.randomBytes(8).toString('hex');
  const onSyncRequest = options.onSyncRequest || (async () => ({ channels: [], flows: [], deletedChannelIds: [], deletedFlowIds: [] }));
  const onClientConnected = options.onClientConnected || (() => {});

  const server = http.createServer(async (req, res) => {
    // Cabeçalhos CORS para permitir requisições do WebView do celular
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Sync-Token');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/api/status' && req.method === 'GET') {
      const ips = getLocalIps();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        device: 'Flow Desktop',
        version: '1.0.0',
        ip: ips[0],
        port,
      }));
      return;
    }

    if (url.pathname === '/api/sync' && req.method === 'POST') {
      let bodyData = '';
      req.on('data', (chunk) => {
        bodyData += chunk;
        // Limite de segurança: 100MB
        if (bodyData.length > 100 * 1024 * 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large' }));
          req.destroy();
        }
      });

      req.on('end', async () => {
        try {
          const payload = JSON.parse(bodyData || '{}');
          if (payload.token !== token) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Token de pareamento inválido ou expirado' }));
            return;
          }

          onClientConnected({
            ip: req.socket.remoteAddress,
            timestamp: Date.now(),
            device: payload.deviceName || 'Mobile Device',
          });

          // Dispara a reconciliação com o estado do PC
          const mergedResult = await onSyncRequest(payload);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            syncedAt: Date.now(),
            channels: mergedResult.channels || [],
            flows: mergedResult.flows || [],
            deletedChannelIds: mergedResult.deletedChannelIds || [],
            deletedFlowIds: mergedResult.deletedFlowIds || [],
          }));
        } catch (err) {
          console.error('[SyncServer] Erro ao processar sincronização:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || 'Erro interno no servidor de sincronização' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      const activePort = server.address().port;
      const ips = getLocalIps();
      console.log(`[SyncServer] Servidor de sincronização ativo em http://${ips[0]}:${activePort}`);
      resolve({
        server,
        port: activePort,
        token,
        ips,
        getQrData: () => ({
          protocol: 'flow-sync',
          version: 1,
          url: `http://${ips[0]}:${activePort}`,
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
};
