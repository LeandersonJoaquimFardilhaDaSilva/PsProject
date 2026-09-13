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
  const mergedDeletedChannels = new Set([
    ...(local.deletedChannelIds || []),
    ...(incoming.deletedChannelIds || []),
  ]);

  const mergedDeletedFlows = new Set([
    ...(local.deletedFlowIds || []),
    ...(incoming.deletedFlowIds || []),
  ]);

  // Reconciliar canais
  const channelMap = new Map<string, Channel>();
  for (const ch of [...(local.channels || []), ...(incoming.channels || [])]) {
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

  // Reconciliar flows / mensagens
  const flowMap = new Map<string, FlowItem>();
  for (const flow of [...(local.flows || []), ...(incoming.flows || [])]) {
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
  private reconnectTimer: any = null;
  private isDestroyed = false;

  constructor(
    serverUrl: string,
    token: string,
    onDataUpdated: (data: any) => void,
    onStatusChange: (status: 'connected' | 'connecting' | 'disconnected') => void
  ) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.onDataUpdated = onDataUpdated;
    this.onStatusChange = onStatusChange;
    this.connect();
  }

  connect() {
    if (this.isDestroyed) return;
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

      this.ws = new WebSocket(fullUrl);

      this.ws.onopen = () => {
        if (this.isDestroyed) return;
        this.onStatusChange('connected');
        console.log('[WebSocketSync] Conectado em tempo real com o PC!');
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'sync_data_updated' || msg.type === 'sync_response') {
            this.onDataUpdated(msg.data);
          } else if (msg.type === 'file_uploaded') {
            this.onDataUpdated({ type: 'file_uploaded', file: msg.data });
          }
        } catch (err) {
          console.error('[WebSocketSync] Erro ao ler mensagem recebida:', err);
        }
      };

      this.ws.onclose = () => {
        this.onStatusChange('disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.onStatusChange('disconnected');
      };
    } catch {
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

  scheduleReconnect() {
    if (this.isDestroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  destroy() {
    this.isDestroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
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
    channels: result.channels || [],
    flows: result.flows || [],
    deletedChannelIds: result.deletedChannelIds || [],
    deletedFlowIds: result.deletedFlowIds || [],
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
