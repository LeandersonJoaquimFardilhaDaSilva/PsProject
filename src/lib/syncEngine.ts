import type { Channel, FlowItem } from '@/types';

export interface SyncData {
  channels: Channel[];
  flows: FlowItem[];
  deletedChannelIds: string[];
  deletedFlowIds: string[];
}

export interface SyncConfig {
  serverUrl: string;
  token: string;
  lastSyncedAt?: number;
  autoSync?: boolean;
}

const SYNC_CONFIG_KEY = 'flow_sync_config';

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(config: SyncConfig | null) {
  try {
    if (config) {
      localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
    } else {
      localStorage.removeItem(SYNC_CONFIG_KEY);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('flow-sync-config-updated', { detail: config }));
    }
  } catch {
    // storage full or unavailable
  }
}

/**
 * Algoritmo de reconciliação bidirecional (Offline-First).
 * Mescla dados locais e remotos garantindo que itens e canais novos sejam preservados
 * e que itens excluídos em qualquer dos dispositivos não retornem.
 */
export function reconcileSyncData(local: SyncData, incoming: SyncData): SyncData {
  const safeLocalDeletedChannels = Array.isArray(local?.deletedChannelIds) ? local.deletedChannelIds : [];
  const safeIncomingDeletedChannels = Array.isArray(incoming?.deletedChannelIds) ? incoming.deletedChannelIds : [];
  const mergedDeletedChannels = new Set([
    ...safeLocalDeletedChannels,
    ...safeIncomingDeletedChannels,
  ]);

  const safeLocalDeletedFlows = Array.isArray(local?.deletedFlowIds) ? local.deletedFlowIds : [];
  const safeIncomingDeletedFlows = Array.isArray(incoming?.deletedFlowIds) ? incoming.deletedFlowIds : [];
  const mergedDeletedFlows = new Set([
    ...safeLocalDeletedFlows,
    ...safeIncomingDeletedFlows,
  ]);

  const safeLocalChannels = Array.isArray(local?.channels) ? local.channels : [];
  const safeIncomingChannels = Array.isArray(incoming?.channels) ? incoming.channels : [];

  // Reconciliar canais
  const channelMap = new Map<string, Channel>();
  for (const ch of [...safeLocalChannels, ...safeIncomingChannels]) {
    if (!ch || !ch.id) continue;
    if (mergedDeletedChannels.has(ch.id)) continue;

    const existing = channelMap.get(ch.id);
    if (!existing) {
      channelMap.set(ch.id, ch);
    } else {
      // Se já existe, preserva o com createdAt mais recente ou propriedades mais completas
      channelMap.set(ch.id, {
        ...existing,
        ...ch,
        name: ch.name || existing.name,
        color: ch.color || existing.color,
      });
    }
  }

  const safeLocalFlows = Array.isArray(local?.flows) ? local.flows : [];
  const safeIncomingFlows = Array.isArray(incoming?.flows) ? incoming.flows : [];

  // Reconciliar flows / mensagens
  const flowMap = new Map<string, FlowItem>();
  for (const flow of [...safeLocalFlows, ...safeIncomingFlows]) {
    if (!flow || !flow.id) continue;
    if (mergedDeletedFlows.has(flow.id)) continue;
    // Se o canal pai foi excluído, o item também não deve existir
    if (mergedDeletedChannels.has(flow.channelId)) continue;

    const existing = flowMap.get(flow.id);
    if (!existing) {
      flowMap.set(flow.id, flow);
    } else {
      // Mescla atualizações (pinned, image, arquivos, logs, etc.), mantendo a versão mais atual
      flowMap.set(flow.id, {
        ...existing,
        ...flow,
        pinned: flow.pinned ?? existing.pinned,
        image: flow.image || existing.image,
        fileName: flow.fileName || existing.fileName,
        filePath: flow.filePath || existing.filePath,
        fileSize: flow.fileSize ?? existing.fileSize,
        fileType: flow.fileType || existing.fileType,
        fileUrl: flow.fileUrl || existing.fileUrl,
        transferSpeed: flow.transferSpeed || existing.transferSpeed,
        logs: flow.logs || existing.logs,
      });
    }
  }

  return {
    channels: Array.from(channelMap.values()),
    flows: Array.from(flowMap.values()),
    deletedChannelIds: Array.from(mergedDeletedChannels),
    deletedFlowIds: Array.from(mergedDeletedFlows),
  };
}

/**
 * Cliente WebSocket de sincronização em tempo real (Push Instantâneo)
 * Substitui o polling HTTP e recebe atualizações do PC em milissegundos
 */
export class WebSocketSyncClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private token: string;
  private onDataUpdated: (data: any) => void;
  private onStatusChange: (status: 'connected' | 'connecting' | 'disconnected') => void;
  private onRequestFileTransfer?: (data: { fileId: string; channelName: string; fileName: string }) => void;
  private onFileProgress?: (data: { fileId: string; percent: number; speed?: string; loaded?: number; total?: number }) => void;
  private onDirectEvent?: (data: { eventType: string; data: any }) => void;
  private onNetPing?: (data: { seq: number; timestamp: number; origin: string }) => void;
  private onNetPong?: (data: { seq: number; originTimestamp: number; replyTimestamp: number; origin: string }) => void;
  private reconnectTimer: any = null;
  private pingInterval: any = null;
  private lastPongTime = Date.now();
  private reconnectAttempts = 0;
  private isDestroyed = false;

  constructor(
    serverUrl: string,
    token: string,
    onDataUpdated: (data: any) => void,
    onStatusChange: (status: 'connected' | 'connecting' | 'disconnected') => void,
    onRequestFileTransfer?: (data: { fileId: string; channelName: string; fileName: string }) => void,
    onFileProgress?: (data: { fileId: string; percent: number; speed?: string; loaded?: number; total?: number }) => void,
    onDirectEvent?: (data: { eventType: string; data: any }) => void,
    onNetPing?: (data: { seq: number; timestamp: number; origin: string }) => void,
    onNetPong?: (data: { seq: number; originTimestamp: number; replyTimestamp: number; origin: string }) => void
  ) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.onDataUpdated = onDataUpdated;
    this.onStatusChange = onStatusChange;
    this.onRequestFileTransfer = onRequestFileTransfer;
    this.onFileProgress = onFileProgress;
    this.onDirectEvent = onDirectEvent;
    this.onNetPing = onNetPing;
    this.onNetPong = onNetPong;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
    }

    this.connect();
  }

  private handleVisibilityChange = () => {
    if (this.isDestroyed) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      console.log('[WebSocketSync] App voltou ao primeiro plano, verificando socket...');
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.reconnectNow();
      }
    }
  };

  private handleOnline = () => {
    if (this.isDestroyed) return;
    console.log('[WebSocketSync] Rede online detectada, restabelecendo conexão...');
    this.reconnectNow();
  };

  setNetTestHandlers(
    onNetPing?: (data: { seq: number; timestamp: number; origin: string }) => void,
    onNetPong?: (data: { seq: number; originTimestamp: number; replyTimestamp: number; origin: string }) => void
  ) {
    this.onNetPing = onNetPing;
    this.onNetPong = onNetPong;
  }

  setDirectEventHandler(handler?: (data: { eventType: string; data: any }) => void) {
    this.onDirectEvent = handler;
  }

  updateConfig(serverUrl: string, token: string) {
    if (this.serverUrl !== serverUrl || this.token !== token) {
      this.serverUrl = serverUrl;
      this.token = token;
      this.reconnectNow();
    }
  }

  private cleanupWs() {
    this.stopPing();
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  reconnectNow() {
    if (this.isDestroyed) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.cleanupWs();
    this.connect();
  }

  connect() {
    if (this.isDestroyed) return;
    this.cleanupWs();

    try {
      this.onStatusChange('connecting');
      let wsUrl = this.serverUrl
        .replace(/^http:/i, 'ws:')
        .replace(/^https:/i, 'wss:')
        .replace(/\/+$/, '');
      if (!/^wss?:\/\//i.test(wsUrl)) {
        wsUrl = `ws://${wsUrl}`;
      }
      const fullUrl = `${wsUrl}/ws?token=${encodeURIComponent(this.token)}`;

      const socket = new WebSocket(fullUrl);
      this.ws = socket;

      socket.onopen = () => {
        if (this.isDestroyed || this.ws !== socket) return;
        this.reconnectAttempts = 0;
        this.lastPongTime = Date.now();
        this.onStatusChange('connected');
        console.log('[WebSocketSync] Conectado em tempo real com o PC!');

        // Inicia heartbeat contínuo a cada 10 segundos
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            } catch {
              // ignore
            }
          }
          // Se não receber sinal há mais de 35s, força reconexão
          if (Date.now() - this.lastPongTime > 35000) {
            console.warn('[WebSocketSync] Timeout de heartbeat (35s), reconectando...');
            this.reconnectNow();
          }
        }, 10000);
      };

      socket.onmessage = (event) => {
        if (this.isDestroyed || this.ws !== socket) return;
        try {
          const msg = JSON.parse(event.data);
          this.lastPongTime = Date.now();

          if (msg.type === 'pong' || msg.type === 'server_ping') {
            if (msg.type === 'server_ping' && this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }
            return;
          }

          if (msg.type === 'sync_data_updated' || msg.type === 'sync_response') {
            this.onDataUpdated(msg.data);
          } else if (msg.type === 'file_uploaded') {
            this.onDataUpdated({ type: 'file_uploaded', file: msg.data });
          } else if (msg.type === 'request_file_transfer') {
            this.onRequestFileTransfer?.(msg);
          } else if (msg.type === 'file_transfer_progress') {
            this.onFileProgress?.(msg);
          } else if (msg.type === 'direct_event') {
            this.onDirectEvent?.(msg);
          } else if (msg.type === 'net_ping') {
            this.onNetPing?.(msg);
          } else if (msg.type === 'net_pong') {
            this.onNetPong?.(msg);
          }
        } catch (err) {
          console.error('[WebSocketSync] Erro ao ler mensagem recebida:', err);
        }
      };

      socket.onclose = () => {
        if (this.isDestroyed || this.ws !== socket) return;
        this.stopPing();
        this.onStatusChange('disconnected');
        this.scheduleReconnect();
      };

      socket.onerror = (err) => {
        if (this.isDestroyed || this.ws !== socket) return;
        console.warn('[WebSocketSync] Erro no socket cliente:', err);
        this.stopPing();
        this.onStatusChange('disconnected');
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error('[WebSocketSync] Erro ao instanciar WebSocket:', err);
      this.stopPing();
      this.onStatusChange('disconnected');
      this.scheduleReconnect();
    }
  }

  sendSyncRequest(payload: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'sync_request', payload }));
      return true;
    }
    return false;
  }

  sendDirectEvent(eventType: string, data: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'direct_event', eventType, data }));
      return true;
    }
    return false;
  }

  sendNetPing(seq: number, origin: string = 'mobile'): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'net_ping', seq, timestamp: Date.now(), origin }));
      return true;
    }
    return false;
  }

  sendNetPong(seq: number, originTimestamp: number, origin: string = 'mobile'): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'net_pong', seq, originTimestamp, replyTimestamp: Date.now(), origin }));
      return true;
    }
    return false;
  }

  sendFileProgress(data: { fileId: string; percent: number; speed?: string; loaded?: number; total?: number }): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'file_transfer_progress', ...data }));
      return true;
    }
    return false;
  }

  requestFileTransfer(fileId: string, channelName: string, fileName: string): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'request_file_transfer', fileId, channelName, fileName }));
      return true;
    }
    return false;
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  scheduleReconnect() {
    if (this.isDestroyed || this.reconnectTimer) return;
    const delay = Math.min(10000, Math.floor(1500 * Math.pow(1.35, Math.min(this.reconnectAttempts, 8))));
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  destroy() {
    this.isDestroyed = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
    }
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupWs();
  }
}

/**
 * Envia os dados locais para o servidor de sincronização do PC e recebe os dados mesclados.
 */
export async function sendSyncRequestToPc(
  serverUrl: string,
  token: string,
  localData: SyncData,
  deviceName: string = 'Celular'
): Promise<SyncData> {
  // Normalizar URL (garantir protocolo http:// se ausente)
  let normalizedUrl = serverUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `http://${normalizedUrl}`;
  }
  normalizedUrl = normalizedUrl.replace(/\/+$/, '');
  const endpoint = `${normalizedUrl}/api/sync`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token,
      deviceName,
      channels: localData.channels,
      flows: localData.flows,
      deletedChannelIds: localData.deletedChannelIds,
      deletedFlowIds: localData.deletedFlowIds,
    }),
  });

  if (!response.ok) {
    let errorText = 'Falha na sincronização';
    try {
      const errJson = await response.json();
      if (errJson.error) errorText = errJson.error;
    } catch {
      errorText = `Erro ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorText);
  }

  const result = await response.json();
  return {
    channels: Array.isArray(result?.channels) ? result.channels : [],
    flows: Array.isArray(result?.flows) ? result.flows : [],
    deletedChannelIds: Array.isArray(result?.deletedChannelIds) ? result.deletedChannelIds : [],
    deletedFlowIds: Array.isArray(result?.deletedFlowIds) ? result.deletedFlowIds : [],
  };
}

/**
 * Verifica o status de conexão com o PC
 */
export async function testPcConnection(serverUrl: string): Promise<{ ok: boolean; device?: string; ip?: string; port?: number }> {
  let normalizedUrl = serverUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `http://${normalizedUrl}`;
  }
  normalizedUrl = normalizedUrl.replace(/\/+$/, '');
  const endpoint = `${normalizedUrl}/api/status`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return { ok: false };
    const json = await res.json();
    return { ok: true, device: json.device, ip: json.ip, port: json.port };
  } catch {
    clearTimeout(timeoutId);
    return { ok: false };
  }
}
