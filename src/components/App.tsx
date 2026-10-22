import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, AlertCircle, FolderPlus, X, Lock } from 'lucide-react';
import { useFlowStore } from '@/hooks/useFlowStore';
import { useNetworkTest } from '@/hooks/useNetworkTest';
import { Sidebar } from '@/components/Sidebar';
import { TitleBar } from '@/components/TitleBar';
import { FlowCard } from '@/components/FlowCard';
import { Composer } from '@/components/Composer';
import { SyncModal } from '@/components/SyncModal';
import { SettingsModal } from '@/components/SettingsModal';
import { fetchLinkPreview, getDomain } from '@/lib/linkPreview';
import { generatePdfThumbnail, isPdfFile } from '@/lib/pdfHelper';
import {
  reconcileSyncData,
  loadSyncConfig,
  sendSyncRequestToPc,
  WebSocketSyncClient,
  type SyncData,
} from '@/lib/syncEngine';
import {
  saveLocalFile,
  uploadFileToPcStream,
  formatBytes,
  registerOriginalFile,
  getRegisteredOriginalFile,
  downloadFileWithProgress,
  downloadImageDirect,
  type TransferProgress,
} from '@/lib/fileTransferEngine';
import type { FlowFilter, FlowItem } from '@/types';

export function App() {
  const store = useFlowStore();
  const storeRef = useRef(store);
  storeRef.current = store;
  const wsClientRef = useRef<WebSocketSyncClient | null>(null);

  const [filter, setFilter] = useState<FlowFilter>('all');
  const [search, setSearch] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isPrivateNewChannel, setIsPrivateNewChannel] = useState(false);
  const [showPrivate, setShowPrivate] = useState(false);
  const createFolderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creatingChannel) {
      const timer = setTimeout(() => {
        createFolderInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [creatingChannel]);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [activeWsClientsCount, setActiveWsClientsCount] = useState(0);
  const [syncConfigVersion, setSyncConfigVersion] = useState(0);
  const [offlineToast, setOfflineToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);

  function triggerOfflineToast(msg = 'Conecte o dispositivo de origem') {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setOfflineToast(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setOfflineToast(null);
      toastTimeoutRef.current = null;
    }, 2500);
  }
  const [syncActivity, setSyncActivity] = useState<{
    lastSyncTime?: number;
    lastDevice?: string;
    itemsCount?: number;
  }>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
      } else if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    });
  }, []);
  const [downloadProgressMap, setDownloadProgressMap] = useState<
    Record<
      string,
      {
        percent: number;
        speed?: string;
        loaded?: number;
        total?: number;
        isDownloading?: boolean;
        isSuccess?: boolean;
      }
    >
  >({});

  const activeChannel = store.channels.find((c) => c.id === store.activeChannelId) || null;
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

  const networkTest = useNetworkTest({
    isElectron,
    onSendPing: (data) => {
      if (isElectron && window.electronAPI?.sendNetTestPing) {
        window.electronAPI.sendNetTestPing(data);
        return true;
      }
      if (wsClientRef.current) {
        return wsClientRef.current.sendNetPing(data.seq, 'mobile');
      }
      return false;
    },
    onSendPong: (data) => {
      if (isElectron && window.electronAPI?.sendNetTestPong) {
        window.electronAPI.sendNetTestPong(data);
        return true;
      }
      if (wsClientRef.current) {
        return wsClientRef.current.sendNetPong(data.seq, data.originTimestamp, 'mobile');
      }
      return false;
    },
  });

  const networkTestRef = useRef(networkTest);
  networkTestRef.current = networkTest;

  function broadcastDataChange() {
    if (window.electronAPI?.broadcastSyncPush) {
      window.electronAPI.broadcastSyncPush({
        type: 'sync_data_updated',
        data: storeRef.current.getSyncPayload(),
      });
    } else {
      wsClientRef.current?.sendSyncRequest(storeRef.current.getSyncPayload());
    }
  }

  function broadcastDirectEvent(eventType: string, data: any) {
    if (window.electronAPI?.broadcastDirectEvent) {
      window.electronAPI.broadcastDirectEvent({ eventType, data });
    } else {
      wsClientRef.current?.sendDirectEvent(eventType, data);
    }
  }

  // 1. Servidor PC (Electron): Escutar sincronizações e arquivos vindos do celular
  useEffect(() => {
    if (!window.electronAPI?.onSyncIncoming) return;

    const cleanup = window.electronAPI.onSyncIncoming(async (incomingData) => {
      try {
        const currentLocal = storeRef.current.getSyncPayload();
        const safeIncoming = {
          channels: Array.isArray(incomingData?.channels) ? incomingData.channels : [],
          flows: Array.isArray(incomingData?.flows) ? incomingData.flows : [],
          deletedChannelIds: Array.isArray(incomingData?.deletedChannelIds) ? incomingData.deletedChannelIds : [],
          deletedFlowIds: Array.isArray(incomingData?.deletedFlowIds) ? incomingData.deletedFlowIds : [],
        };
        const merged = reconcileSyncData(currentLocal, safeIncoming);

        storeRef.current.replaceStoreData(
          merged.channels,
          merged.flows,
          merged.deletedChannelIds,
          merged.deletedFlowIds
        );

        await window.electronAPI!.sendSyncResponse(incomingData.syncId, {
          channels: merged.channels,
          flows: merged.flows,
          deletedChannelIds: merged.deletedChannelIds,
          deletedFlowIds: merged.deletedFlowIds,
        });

        setSyncActivity({
          lastSyncTime: Date.now(),
          lastDevice: 'Celular',
          itemsCount: merged.flows.length,
        });
      } catch (err) {
        console.error('[App] Erro na reconciliação sync-incoming:', err);
        try {
          const fallbackLocal = storeRef.current.getSyncPayload();
          await window.electronAPI!.sendSyncResponse(incomingData.syncId, {
            channels: fallbackLocal.channels,
            flows: fallbackLocal.flows,
            deletedChannelIds: fallbackLocal.deletedChannelIds,
            deletedFlowIds: fallbackLocal.deletedFlowIds,
          });
        } catch {
          // ignore
        }
      }
    });

    const cleanupClient = window.electronAPI.onSyncClientConnected?.((client) => {
      setSyncActivity((prev) => ({
        ...prev,
        lastSyncTime: client.timestamp,
        lastDevice: client.device,
      }));
      // Sincroniza mensagens automaticamente com o aparelho recém-conectado
      broadcastDataChange();
    });

    window.electronAPI.getSyncInfo?.().then((info) => {
      if (info?.clientCount !== undefined) {
        setActiveWsClientsCount(info.clientCount);
      }
    });

    const cleanupWsCount = window.electronAPI.onWsClientsCountChange?.((count) => {
      setActiveWsClientsCount(count);
      if (count > 0) {
        setSyncActivity((prev) => ({
          ...prev,
          lastSyncTime: Date.now(),
          lastDevice: 'Celular (WebSocket)',
        }));
        // Sincroniza mensagens automaticamente com os clientes conectados
        broadcastDataChange();
      }
    });

    const cleanupHeartbeat = window.electronAPI.onSyncClientHeartbeat?.((client) => {
      setSyncActivity((prev) => ({
        ...prev,
        lastSyncTime: client.timestamp,
        lastDevice: client.device,
      }));
    });

    // Acompanhamento de progresso de upload no PC
    const cleanupProgress = window.electronAPI.onFileProgress?.((data) => {
      setDownloadProgressMap((prev) => ({
        ...prev,
        [data.fileId]: {
          percent: data.percent,
          speed: data.speed,
          loaded: data.loaded,
          total: data.total,
          isDownloading: data.percent < 100,
          isSuccess: data.percent >= 100,
        },
      }));
    });

    // Notificação de arquivo recebido via Stream binário puro do celular
    const cleanupFile = window.electronAPI.onFileReceivedFromMobile?.((fileInfo) => {
      const existing = storeRef.current.flows.find(
        (f) => f.id === fileInfo.fileId || (f.fileName === fileInfo.fileName && f.type === 'file')
      );

      if (existing) {
        storeRef.current.updateFlowPreview(existing.id, {
          filePath: fileInfo.filePath,
          fileSize: fileInfo.fileSize,
          transferSpeed: fileInfo.speed,
        });
        storeRef.current.addFlowLog(existing.id, {
          timestamp: Date.now(),
          level: 'success',
          message: `Arquivo recebido e salvo no disco (${fileInfo.speed})`,
          details: `Local: ${fileInfo.filePath}`,
        });
        setDownloadProgressMap((prev) => ({
          ...prev,
          [existing.id]: { percent: 100, isDownloading: false, isSuccess: true },
        }));
      } else {
        const targetChannel =
          storeRef.current.channels.find(
            (c) => c.name.toLowerCase() === (fileInfo.channelName || '').toLowerCase()
          ) ||
          activeChannel ||
          storeRef.current.channels[0];

        if (targetChannel) {
          const item = storeRef.current.addFlow({
            type: 'file',
            channelId: targetChannel.id,
            fileName: fileInfo.fileName,
            filePath: fileInfo.filePath,
            fileSize: fileInfo.fileSize,
            fileType: fileInfo.fileName.split('.').pop()?.toLowerCase() || 'file',
            transferSpeed: fileInfo.speed,
            logs: [
              {
                timestamp: Date.now(),
                level: 'success',
                message: `Arquivo recebido via Stream binário (${fileInfo.speed})`,
                details: `Salvo no disco em: ${fileInfo.filePath}`,
              },
            ],
          });
          setDownloadProgressMap((prev) => ({
            ...prev,
            [item.id]: { percent: 100, isDownloading: false, isSuccess: true },
          }));
        }
      }
    });

    const cleanupPing = window.electronAPI.onNetTestPing?.((data) => {
      networkTestRef.current.handleIncomingPing(data);
    });
    const cleanupPong = window.electronAPI.onNetTestPong?.((data) => {
      networkTestRef.current.handleIncomingPong(data);
    });
    const cleanupDirect = window.electronAPI.onDirectEvent?.((event) => {
      if (event.eventType === 'new_flow_item' && event.data) {
        storeRef.current.addFlowDirect(event.data);
        if (event.data.type === 'link' && event.data.url && event.data.isLoadingPreview) {
          setTimeout(() => {
            const currentItem = storeRef.current.flows.find((f) => f.id === event.data.id);
            if (currentItem && currentItem.isLoadingPreview) {
              fetchLinkPreview(event.data.url)
                .then((preview) => {
                  storeRef.current.updateFlowPreview(event.data.id, {
                    title: preview.title || getDomain(event.data.url),
                    description: preview.description || '',
                    image: preview.image || `https://www.google.com/s2/favicons?domain=${getDomain(event.data.url)}&sz=128`,
                    siteName: preview.siteName || getDomain(event.data.url),
                    isLoadingPreview: false,
                  });
                })
                .catch(() => {
                  storeRef.current.updateFlowPreview(event.data.id, { isLoadingPreview: false });
                });
            }
          }, 3500);
        }
      } else if (event.eventType === 'update_flow_item' && event.data?.id) {
        storeRef.current.updateFlowPreview(event.data.id, event.data.preview);
      } else if (event.eventType === 'delete_flow_item' && event.data?.id) {
        storeRef.current.deleteFlow(event.data.id);
      }
    });

    // 1b. Integração com a Extensão do Navegador (Chrome/Edge/Brave)
    const cleanupExtGetData = window.electronAPI.onExtensionGetData?.((data) => {
      window.electronAPI?.sendExtensionDataResponse?.(data.reqId, {
        channels: storeRef.current.channels,
        flows: storeRef.current.flows,
      });
    });

    const cleanupExtAddLink = window.electronAPI.onExtensionAddLink?.(async ({ linkId, link }) => {
      try {
        const targetChannel =
          storeRef.current.channels.find((c) => c.id === link.channelId) ||
          activeChannel ||
          storeRef.current.channels[0];

        if (!targetChannel) {
          throw new Error('Nenhuma pasta disponível no Tove');
        }

        const isActualUrl = link.url && /^https?:\/\//i.test(link.url);
        const item = storeRef.current.addFlow({
          type: isActualUrl ? 'link' : 'text',
          channelId: targetChannel.id,
          url: isActualUrl ? link.url : undefined,
          text: link.text || (!isActualUrl ? link.url : undefined),
          title: link.title || link.url || 'Link sem título',
          description: link.description || '',
          image: link.image || '',
          siteName: link.siteName || '',
          isLoadingPreview: Boolean(isActualUrl && !link.image),
          logs: [
            {
              timestamp: Date.now(),
              level: 'info',
              message: `Recebido da extensão do navegador: ${link.title || link.url || 'Item'}`,
            },
          ],
        });

        broadcastDirectEvent('new_flow_item', item);
        broadcastDataChange();

        // Se o link não tiver thumbnail da extensão, busca metadados em segundo plano
        if (isActualUrl && !link.image) {
          fetchLinkPreview(link.url)
            .then((preview) => {
              if (preview && (preview.image || preview.description || preview.title)) {
                handleUpdateFlowPreview(item.id, {
                  title: preview.title || item.title,
                  description: preview.description || item.description,
                  image: preview.image || item.image,
                  siteName: preview.siteName || item.siteName,
                  isLoadingPreview: false,
                });
              } else {
                handleUpdateFlowPreview(item.id, { isLoadingPreview: false });
              }
            })
            .catch(() => {
              handleUpdateFlowPreview(item.id, { isLoadingPreview: false });
            });
        }

        await window.electronAPI?.sendExtensionLinkResponse?.(linkId, item);
      } catch (err: any) {
        console.error('[App] Erro ao processar link da extensão:', err);
        await window.electronAPI?.sendExtensionLinkResponse?.(linkId, { error: err.message || 'Falha ao processar link' });
      }
    });

    return () => {
      cleanup();
      cleanupClient?.();
      cleanupWsCount?.();
      cleanupHeartbeat?.();
      cleanupProgress?.();
      cleanupFile?.();
      cleanupPing?.();
      cleanupPong?.();
      cleanupDirect?.();
      cleanupExtGetData?.();
      cleanupExtAddLink?.();
    };
  }, []);

  // Manter cache do processo principal sempre atualizado para a extensão
  useEffect(() => {
    if (isElectron && window.electronAPI?.updateStoreCache) {
      window.electronAPI.updateStoreCache({
        channels: store.channels,
        flows: store.flows,
      });
    }
  }, [store.channels, store.flows, isElectron]);

  // Escuta atualizações de configuração de sincronização para reconectar imediatamente
  useEffect(() => {
    const handleConfigUpdated = () => {
      setSyncConfigVersion((v) => v + 1);
    };
    window.addEventListener('flow-sync-config-updated', handleConfigUpdated);
    return () => window.removeEventListener('flow-sync-config-updated', handleConfigUpdated);
  }, []);

  // 2. Cliente Mobile / Web: Push em Tempo Real via WebSocket (Persistente e Estável)
  useEffect(() => {
    if (isElectron) return; // No PC, o Electron roda o servidor WebSocket

    const config = loadSyncConfig();
    if (!config || !config.serverUrl || !config.token) {
      setIsWsConnected(false);
      return;
    }

    // Auto-sync imediato de mensagens na inicialização
    sendSyncRequestToPc(config.serverUrl, config.token, storeRef.current.getSyncPayload(), 'Cliente')
      .then((merged) => {
        if (merged) {
          storeRef.current.replaceStoreData(
            merged.channels,
            merged.flows,
            merged.deletedChannelIds,
            merged.deletedFlowIds
          );
          setSyncActivity({
            lastSyncTime: Date.now(),
            lastDevice: 'PC (Sync Automático)',
            itemsCount: merged.flows.length,
          });
        }
      })
      .catch((err) => {
        console.log('[App] Auto-sync inicial aguardando WebSocket...', err?.message);
      });

    const wsClient = new WebSocketSyncClient(
      config.serverUrl,
      config.token,
      (data) => {
        if (data && (Array.isArray(data.channels) || Array.isArray(data.flows))) {
          try {
            const currentLocal = storeRef.current.getSyncPayload();
            const safeData = {
              channels: Array.isArray(data.channels) ? data.channels : [],
              flows: Array.isArray(data.flows) ? data.flows : [],
              deletedChannelIds: Array.isArray(data.deletedChannelIds) ? data.deletedChannelIds : [],
              deletedFlowIds: Array.isArray(data.deletedFlowIds) ? data.deletedFlowIds : [],
            };
            const merged = reconcileSyncData(currentLocal, safeData);
            storeRef.current.replaceStoreData(
              merged.channels,
              merged.flows,
              merged.deletedChannelIds,
              merged.deletedFlowIds
            );
            setSyncActivity({
              lastSyncTime: Date.now(),
              lastDevice: 'PC (WebSocket)',
              itemsCount: merged.flows.length,
            });
          } catch (err) {
            console.error('[App] Erro ao reconciliar push via WebSocket:', err);
          }
        }
      },
      (status) => {
        setIsWsConnected(status === 'connected');
        if (status === 'connected') {
          // Toda vez que conectar automaticamente, dispara sincronização de mensagens
          console.log('[App] Conectado via WebSocket! Executando sincronização automática de mensagens...');
          wsClient.sendSyncRequest(storeRef.current.getSyncPayload());
        }
      },
      // onRequestFileTransfer: quando o PC solicita o arquivo original presente no celular
      async (req) => {
        const reg = getRegisteredOriginalFile(req.fileId);
        if (reg && config.serverUrl && config.token) {
          try {
            uploadFileToPcStream(
              config.serverUrl,
              config.token,
              req.channelName,
              reg.file,
              req.fileName,
              req.fileId,
              (progress) => {
                wsClient.sendFileProgress({ fileId: req.fileId, ...progress });
                setDownloadProgressMap((prev) => ({
                  ...prev,
                  [req.fileId]: { ...progress, isDownloading: true },
                }));
              }
            ).then(() => {
              setDownloadProgressMap((prev) => ({
                ...prev,
                [req.fileId]: { percent: 100, isDownloading: false, isSuccess: true },
              }));
            }).catch((err) => {
              console.error('[WebSocketSync] Erro no upload sob demanda para o PC:', err);
              setDownloadProgressMap((prev) => ({
                ...prev,
                [req.fileId]: { percent: 0, isDownloading: false, isSuccess: false },
              }));
            });
          } catch (err) {
            console.error('[WebSocketSync] Erro no upload sob demanda para o PC:', err);
          }
        }
      },
      // onFileProgress
      (prog) => {
        setDownloadProgressMap((prev) => ({
          ...prev,
          [prog.fileId]: {
            percent: prog.percent,
            speed: prog.speed,
            loaded: prog.loaded,
            total: prog.total,
            isDownloading: prog.percent < 100,
            isSuccess: prog.percent >= 100,
          },
        }));
      },
      // onDirectEvent
      (event) => {
        if (event.eventType === 'new_flow_item' && event.data) {
          storeRef.current.addFlowDirect(event.data);
          if (event.data.type === 'link' && event.data.url && event.data.isLoadingPreview) {
            setTimeout(() => {
              const currentItem = storeRef.current.flows.find((f) => f.id === event.data.id);
              if (currentItem && currentItem.isLoadingPreview) {
                fetchLinkPreview(event.data.url)
                  .then((preview) => {
                    storeRef.current.updateFlowPreview(event.data.id, {
                      title: preview.title || getDomain(event.data.url),
                      description: preview.description || '',
                      image: preview.image || `https://www.google.com/s2/favicons?domain=${getDomain(event.data.url)}&sz=128`,
                      siteName: preview.siteName || getDomain(event.data.url),
                      isLoadingPreview: false,
                    });
                  })
                  .catch(() => {
                    storeRef.current.updateFlowPreview(event.data.id, { isLoadingPreview: false });
                  });
              }
            }, 3500);
          }
        } else if (event.eventType === 'update_flow_item' && event.data?.id) {
          storeRef.current.updateFlowPreview(event.data.id, event.data.preview);
        } else if (event.eventType === 'delete_flow_item' && event.data?.id) {
          storeRef.current.deleteFlow(event.data.id);
        }
      },
      // onNetPing
      (data) => {
        networkTestRef.current.handleIncomingPing(data);
      },
      // onNetPong
      (data) => {
        networkTestRef.current.handleIncomingPong(data);
      }
    );

    wsClientRef.current = wsClient;

    return () => {
      wsClient.destroy();
      wsClientRef.current = null;
    };
  }, [isElectron, syncConfigVersion]);

  const flowsCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of store.flows) {
      counts[f.channelId] = (counts[f.channelId] || 0) + 1;
    }
    return counts;
  }, [store.flows]);

  const visibleFlows = useMemo(() => {
    if (!activeChannel) return [];
    let items = store.flows.filter((f) => f.channelId === activeChannel.id);
    if (filter !== 'all') {
      items = items.filter((f) => f.type === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (f) =>
          f.text?.toLowerCase().includes(q) ||
          f.title?.toLowerCase().includes(q) ||
          f.description?.toLowerCase().includes(q) ||
          f.siteName?.toLowerCase().includes(q) ||
          f.fileName?.toLowerCase().includes(q) ||
          f.imageName?.toLowerCase().includes(q)
      );
    }
    return [...items].sort((a, b) => a.createdAt - b.createdAt);
  }, [activeChannel, store.flows, filter, search]);

  // Rola para o final ao trocar de pasta
  useEffect(() => {
    scrollToBottom(false);
  }, [store.activeChannelId, scrollToBottom]);

  // Rola suavemente para baixo quando novas mensagens forem adicionadas
  useEffect(() => {
    scrollToBottom(true);
  }, [visibleFlows.length, scrollToBottom]);

  function handleCreateChannel() {
    setCreatingChannel(true);
    setNewChannelName('');
    setIsPrivateNewChannel(false);
    setIsSidebarOpenMobile(false);
  }

  function confirmCreateChannel() {
    const name = newChannelName.trim();
    if (name) {
      const isPriv = isPrivateNewChannel;
      store.createChannel(name, isPriv);
      if (isPriv) {
        setShowPrivate(true);
      }
      setTimeout(() => broadcastDataChange(), 50);
    }
    setCreatingChannel(false);
    setNewChannelName('');
    setIsPrivateNewChannel(false);
  }

  function handleToggleShowPrivate() {
    setShowPrivate((prev) => {
      const next = !prev;
      if (!next && activeChannel?.isPrivate) {
        const firstPublic = store.channels.find((c) => !c.isPrivate);
        store.setActiveChannelId(firstPublic ? firstPublic.id : null);
      } else if (next && !store.activeChannelId && store.channels.length > 0) {
        store.setActiveChannelId(store.channels[0].id);
      }
      return next;
    });
  }

  useEffect(() => {
    if (!showPrivate && activeChannel?.isPrivate) {
      const firstPublic = store.channels.find((c) => !c.isPrivate);
      store.setActiveChannelId(firstPublic ? firstPublic.id : null);
    }
  }, [showPrivate, activeChannel, store]);

  // Envio de Arquivo Binário (PDF, EXE, DOC, etc.) — Sem duplicação no remetente
  async function handleSendFile(file: File) {
    if (!activeChannel) return;
    const channelName = activeChannel.name;
    const ext = file.name.split('.').pop()?.toLowerCase() || 'file';
    let originalPath = '';
    if (isElectron && window.electronAPI?.getPathForFile) {
      try {
        originalPath = window.electronAPI.getPathForFile(file) || '';
      } catch (err) {
        console.warn('[App] Erro ao obter caminho do arquivo via getPathForFile:', err);
      }
    }
    if (!originalPath) {
      originalPath = (file as any).path || '';
    }

    const item = store.addFlow({
      type: 'file',
      channelId: activeChannel.id,
      fileName: file.name,
      fileSize: file.size,
      fileType: ext,
      filePath: originalPath,
      logs: [
        {
          timestamp: Date.now(),
          level: 'info',
          message: `Arquivo selecionado: ${file.name} (${formatBytes(file.size)})`,
          details: originalPath ? `Origem no disco: ${originalPath}` : 'Pronto para download',
        },
      ],
    });

    // Registra referência original em memória sem criar cópias desnecessárias
    registerOriginalFile(item.id, file, file.name, originalPath);

    if (isElectron && originalPath && window.electronAPI?.registerOriginalFile) {
      await window.electronAPI.registerOriginalFile({
        fileId: item.id,
        originalPath,
        fileName: file.name,
        fileSize: file.size,
      });
    }

    // Push instantâneo via WebSocket
    broadcastDirectEvent('new_flow_item', item);
    broadcastDataChange();

    if (isPdfFile(file.name, ext)) {
      generatePdfThumbnail(file, item.id)
        .then((thumb) => {
          handleUpdateFlowPreview(item.id, { pdfThumbnail: thumb });
        })
        .catch((err) => {
          console.warn('[App] Erro ao gerar thumbnail para PDF enviado:', err);
        });
    }
  }

  // Download Sob Demanda (Foto ou Arquivo) com barra de progresso em tempo real
  async function handleDownloadItem(item: FlowItem) {
    if (!activeChannel) return;
    const channelName = activeChannel.name;

    // 1. Download de Imagem
    if (item.type === 'image') {
      const imgData = item.imageData || item.image;
      if (!imgData) return;

      setDownloadProgressMap((prev) => ({
        ...prev,
        [item.id]: { percent: 20, isDownloading: true },
      }));

      try {
        const saved = await downloadImageDirect(
          channelName,
          item.imageName || `imagem_${Date.now()}.png`,
          imgData,
          (prog) => {
            setDownloadProgressMap((prev) => ({
              ...prev,
              [item.id]: { ...prog, isDownloading: true },
            }));
          }
        );

        store.addFlowLog(item.id, {
          timestamp: Date.now(),
          level: 'success',
          message: `Imagem salva em Documents/Tove/channels/${channelName}`,
          details: `Caminho: ${saved.filePath}`,
        });

        store.updateFlowPreview(item.id, { filePath: saved.filePath });
        setDownloadProgressMap((prev) => ({
          ...prev,
          [item.id]: { percent: 100, isDownloading: false, isSuccess: true },
        }));
      } catch (err: any) {
        store.addFlowLog(item.id, {
          timestamp: Date.now(),
          level: 'error',
          message: `Erro ao baixar imagem: ${err.message || 'Falha desconhecida'}`,
        });
        setDownloadProgressMap((prev) => ({
          ...prev,
          [item.id]: { percent: 0, isDownloading: false, isSuccess: false },
        }));
      }
      return;
    }

    // 2. Download de Arquivo Binário
    if (item.type === 'file') {
      const syncConfig = loadSyncConfig();

      // Se estiver no celular conectado ao servidor PC:
      if (!isElectron) {
        if (!isWsConnected || !syncConfig?.serverUrl || !syncConfig?.token) {
          triggerOfflineToast('Conecte o dispositivo de origem');
          return;
        }

        setDownloadProgressMap((prev) => ({
          ...prev,
          [item.id]: { percent: 5, isDownloading: true },
        }));

        try {
          const res = await downloadFileWithProgress(
            syncConfig.serverUrl,
            syncConfig.token,
            channelName,
            item.fileName || 'arquivo',
            item.id,
            item.filePath,
            (prog) => {
              setDownloadProgressMap((prev) => ({
                ...prev,
                [item.id]: { ...prog, isDownloading: true },
              }));
            }
          );

          store.addFlowLog(item.id, {
            timestamp: Date.now(),
            level: 'success',
            message: `Arquivo baixado para Documents/Tove/channels/${channelName}`,
            details: `Caminho: ${res.filePath} (${res.speed})`,
          });

          store.updateFlowPreview(item.id, {
            filePath: res.filePath,
            transferSpeed: res.speed,
          });

          setDownloadProgressMap((prev) => ({
            ...prev,
            [item.id]: { percent: 100, isDownloading: false, isSuccess: true },
          }));
        } catch (err: any) {
          triggerOfflineToast('Conecte o dispositivo de origem');
          store.addFlowLog(item.id, {
            timestamp: Date.now(),
            level: 'error',
            message: `Erro ao baixar arquivo: ${err.message || 'Falha'}`,
          });
          setDownloadProgressMap((prev) => ({
            ...prev,
            [item.id]: { percent: 0, isDownloading: false, isSuccess: false },
          }));
        }
        return;
      }

      // Se estiver no PC e o arquivo estiver no celular conectado:
      if (isElectron && window.electronAPI?.requestFileDownloadFromMobile) {
        if (!item.filePath && activeWsClientsCount === 0) {
          triggerOfflineToast('Conecte o dispositivo de origem');
          return;
        }

        setDownloadProgressMap((prev) => ({
          ...prev,
          [item.id]: { percent: 5, isDownloading: true },
        }));

        store.addFlowLog(item.id, {
          timestamp: Date.now(),
          level: 'info',
          message: 'Solicitando envio do arquivo original ao celular...',
        });

        await window.electronAPI.requestFileDownloadFromMobile({
          fileId: item.id,
          channelName,
          fileName: item.fileName || 'arquivo',
        });
      }
    }
  }

  function handleUpdateFlowPreview(id: string, preview: Partial<FlowItem>) {
    store.updateFlowPreview(id, preview);
    broadcastDirectEvent('update_flow_item', { id, preview });
    broadcastDataChange();
  }

  // Envio de Link
  function handleSendLink(
    url: string,
    title: string,
    description: string,
    image: string,
    siteName: string,
    isLoadingPreview?: boolean
  ) {
    if (!activeChannel) return;
    const item = store.addFlow({
      type: 'link',
      channelId: activeChannel.id,
      url,
      title,
      description,
      image,
      siteName,
      isLoadingPreview,
      logs: [
        {
          timestamp: Date.now(),
          level: 'info',
          message: `Link enviado: ${url}`,
        },
      ],
    });

    broadcastDirectEvent('new_flow_item', item);
    broadcastDataChange();
    return item;
  }

  // Envio de Texto simples
  function handleSendText(text: string) {
    if (!activeChannel) return;
    const item = store.addFlow({
      type: 'text',
      channelId: activeChannel.id,
      text,
      logs: [
        {
          timestamp: Date.now(),
          level: 'info',
          message: `Mensagem de texto enviada (${text.length} caracteres)`,
        },
      ],
    });

    broadcastDirectEvent('new_flow_item', item);
    broadcastDataChange();
  }

  // Envio de Imagem
  function handleSendImage(imageData: string, imageName: string) {
    if (!activeChannel) return;
    const item = store.addFlow({
      type: 'image',
      channelId: activeChannel.id,
      imageData,
      imageName,
      logs: [
        {
          timestamp: Date.now(),
          level: 'info',
          message: `Imagem enviada (${imageName || 'sem nome'})`,
        },
      ],
    });

    broadcastDirectEvent('new_flow_item', item);
    broadcastDataChange();
  }

  // Exclusão de Item com propagação instantânea
  function handleDeleteFlow(id: string) {
    store.deleteFlow(id);
    broadcastDirectEvent('delete_flow_item', { id });
    broadcastDataChange();
  }

  const isWsLive = isElectron
    ? activeWsClientsCount > 0 || Boolean(syncActivity.lastSyncTime && Date.now() - syncActivity.lastSyncTime < 60000)
    : isWsConnected;

  const isSyncConnected = isElectron
    ? activeWsClientsCount > 0 || Boolean(syncActivity.lastSyncTime && Date.now() - syncActivity.lastSyncTime < 60000)
    : isWsConnected || Boolean(syncActivity.lastSyncTime && Date.now() - syncActivity.lastSyncTime < 60000);

  return (
    <div className="relative flex h-screen w-screen max-w-[100vw] flex-col overflow-hidden bg-[#0a0a0f] text-white">
      {offlineToast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-[#161622]/95 px-4 py-2.5 text-sm font-medium text-amber-200 shadow-xl shadow-black/50 backdrop-blur-md transition-all animate-bounce">
          <AlertCircle size={18} className="text-amber-400 shrink-0" />
          <span>{offlineToast}</span>
        </div>
      )}

      <TitleBar
        channel={activeChannel}
        onClearChannel={() => activeChannel && store.clearChannel(activeChannel.id)}
        search={search}
        onSearchChange={setSearch}
        onOpenSync={() => setIsSyncModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        syncConnected={isSyncConnected}
        isWebSocketActive={isWsLive}
        activeClientsCount={isElectron ? activeWsClientsCount : undefined}
        onToggleSidebar={() => setIsSidebarOpenMobile((prev) => !prev)}
      />

      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        localData={store.getSyncPayload()}
        syncActivity={syncActivity}
        onSyncComplete={(merged) => {
          store.replaceStoreData(
            merged.channels,
            merged.flows,
            merged.deletedChannelIds,
            merged.deletedFlowIds
          );
          setSyncActivity({
            lastSyncTime: Date.now(),
            lastDevice: 'Dispositivo Pareado',
            itemsCount: merged.flows.length,
          });
        }}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        networkTest={networkTest}
        isWsConnected={isWsConnected}
        isElectron={isElectron}
        serverUrl={loadSyncConfig()?.serverUrl}
        activeClientsCount={isElectron ? activeWsClientsCount : undefined}
      />

      {/* Modal / Popup Criar Nova Pasta (Centralizado, sobre a aplicação com blur suave) */}
      {creatingChannel && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
          onClick={() => setCreatingChannel(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-create-folder-title"
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#16161e] p-5 shadow-2xl animate-[flowIn_0.15s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff3e6c] to-[#00e5ff] text-white shadow-md">
                  <FolderPlus size={18} />
                </div>
                <div>
                  <h3 id="modal-create-folder-title" className="text-base font-semibold text-white">
                    Nova Pasta
                  </h3>
                  <p className="text-xs text-white/50">Organize seus envios e arquivos</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreatingChannel(false)}
                className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4">
              <input
                ref={createFolderInputRef}
                autoFocus
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmCreateChannel();
                  if (e.key === 'Escape') setCreatingChannel(false);
                }}
                placeholder="Nome da pasta (ex: Estudos)"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#ff3e6c]/50 focus:bg-white/10"
              />
            </div>

            {/* Opções de Privacidade / Tipo de Pasta (Botões tipo Radio) */}
            <fieldset className="mt-4">
              <legend className="mb-2 text-xs font-medium text-white/50">Tipo de Pasta</legend>
              <div className="grid grid-cols-2 gap-2">
                <label
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition select-none ${
                    !isPrivateNewChannel
                      ? 'border-[#00e5ff]/50 bg-[#00e5ff]/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  <input
                    type="radio"
                    name="folderPrivacy"
                    value="public"
                    checked={!isPrivateNewChannel}
                    onChange={() => setIsPrivateNewChannel(false)}
                    className="accent-[#00e5ff] h-4 w-4 cursor-pointer"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate">Pública</span>
                    <span className="text-[10px] text-white/40 truncate">Visível por padrão</span>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition select-none ${
                    isPrivateNewChannel
                      ? 'border-[#ff3e6c]/50 bg-[#ff3e6c]/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  <input
                    type="radio"
                    name="folderPrivacy"
                    value="private"
                    checked={isPrivateNewChannel}
                    onChange={() => setIsPrivateNewChannel(true)}
                    className="accent-[#ff3e6c] h-4 w-4 cursor-pointer"
                  />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium truncate">Privada</span>
                      <Lock size={10} className="text-[#ff3e6c] shrink-0" />
                    </div>
                    <span className="text-[10px] text-white/40 truncate">Oculta por padrão</span>
                  </div>
                </label>
              </div>
            </fieldset>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreatingChannel(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmCreateChannel}
                disabled={!newChannelName.trim()}
                className="rounded-xl bg-gradient-to-r from-[#ff3e6c] to-[#00e5ff] px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:opacity-90 disabled:opacity-40"
              >
                Criar pasta
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden w-full max-w-[100vw] min-w-0">
        <Sidebar
          channels={store.channels}
          activeChannelId={store.activeChannelId}
          flowsCount={flowsCount}
          filter={filter}
          showPrivate={showPrivate}
          onToggleShowPrivate={handleToggleShowPrivate}
          onSelectChannel={store.setActiveChannelId}
          onCreateChannel={handleCreateChannel}
          onRenameChannel={store.renameChannel}
          onDeleteChannel={store.deleteChannel}
          onFilterChange={setFilter}
          isOpenMobile={isSidebarOpenMobile}
          onCloseMobile={() => setIsSidebarOpenMobile(false)}
        />

        <main className="flex flex-1 flex-col min-w-0 max-w-full overflow-x-hidden">
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-6 w-full max-w-full min-w-0"
          >
            {!activeChannel && <EmptyState onCreate={handleCreateChannel} />}
            {activeChannel && visibleFlows.length === 0 && (
              <FolderEmpty folderName={activeChannel.name} />
            )}
            {activeChannel && visibleFlows.length > 0 && (
              <div className="mx-auto w-full max-w-2xl space-y-3 min-w-0">
                {visibleFlows.map((item) => (
                  <FlowCard
                    key={item.id}
                    item={item}
                    onDelete={handleDeleteFlow}
                    onTogglePin={store.togglePin}
                    onUpdateImage={store.updateFlowImage}
                    onUpdateFlowPreview={handleUpdateFlowPreview}
                    onDownloadItem={handleDownloadItem}
                    downloadProgress={downloadProgressMap[item.id]}
                  />
                ))}
                <div ref={messagesEndRef} className="h-1" />
              </div>
            )}
          </div>

          {activeChannel && (
            <Composer
              channelId={activeChannel.id}
              onSendLink={handleSendLink}
              onUpdateFlowPreview={handleUpdateFlowPreview}
              onSendText={handleSendText}
              onSendImage={handleSendImage}
              onSendFile={handleSendFile}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff3e6c] to-[#00e5ff]">
        <Sparkles size={28} className="text-white" />
      </div>
      <h2 className="mb-2 text-xl font-bold text-white">Bem-vindo ao Tove</h2>
      <p className="mb-6 max-w-sm text-sm text-white/50">
        Crie pastas para organizar seus links, arquivos, textos e imagens por assunto. Tudo fica salvo
        localmente neste dispositivo.
      </p>
      <button
        onClick={onCreate}
        className="rounded-xl bg-gradient-to-r from-[#ff3e6c] to-[#00e5ff] px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
      >
        Criar primeira pasta
      </button>
    </div>
  );
}

function FolderEmpty({ folderName }: { folderName: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
        <Sparkles size={24} className="text-white/40" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-white">{folderName} está vazia</h3>
      <p className="text-sm text-white/40">
        Cole um link, escreva um texto ou envie fotos e arquivos (PDF, EXE, DOC...) abaixo.
      </p>
    </div>
  );
}
