import { useMemo, useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { useFlowStore } from '@/hooks/useFlowStore';
import { Sidebar } from '@/components/Sidebar';
import { TitleBar } from '@/components/TitleBar';
import { FlowCard } from '@/components/FlowCard';
import { Composer } from '@/components/Composer';
import { SyncModal } from '@/components/SyncModal';
import { SettingsModal } from '@/components/SettingsModal';
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
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [syncActivity, setSyncActivity] = useState<{
    lastSyncTime?: number;
    lastDevice?: string;
    itemsCount?: number;
  }>({});
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

  // 1. Servidor PC (Electron): Escutar sincronizações e arquivos vindos do celular
  useEffect(() => {
    if (!window.electronAPI?.onSyncIncoming) return;

    const cleanup = window.electronAPI.onSyncIncoming(async (incomingData) => {
      const currentLocal = storeRef.current.getSyncPayload();
      const merged = reconcileSyncData(currentLocal, {
        channels: incomingData.channels,
        flows: incomingData.flows,
        deletedChannelIds: incomingData.deletedChannelIds,
        deletedFlowIds: incomingData.deletedFlowIds,
      });

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
    });

    const cleanupClient = window.electronAPI.onSyncClientConnected?.((client) => {
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

    return () => {
      cleanup();
      cleanupClient?.();
      cleanupProgress?.();
      cleanupFile?.();
    };
  }, []);

  // 2. Cliente Mobile / Web: Push em Tempo Real via WebSocket (Persistente e Estável)
  useEffect(() => {
    if (isElectron) return; // No PC, o Electron roda o servidor WebSocket

    const config = loadSyncConfig();
    if (!config || !config.serverUrl || !config.token) return;

    const wsClient = new WebSocketSyncClient(
      config.serverUrl,
      config.token,
      (data) => {
        if (data && (data.channels || data.flows)) {
          const currentLocal = storeRef.current.getSyncPayload();
          const merged = reconcileSyncData(currentLocal, data);
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
        }
      },
      (status) => {
        setIsWsConnected(status === 'connected');
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
      }
    );

    wsClientRef.current = wsClient;

    return () => {
      wsClient.destroy();
      wsClientRef.current = null;
    };
  }, [isElectron, isSyncModalOpen]);

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
    return [...items].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  }, [activeChannel, store.flows, filter, search]);

  function handleCreateChannel() {
    setCreatingChannel(true);
    setNewChannelName('');
  }

  function confirmCreateChannel() {
    const name = newChannelName.trim();
    if (name) {
      store.createChannel(name);
      setTimeout(() => broadcastDataChange(), 50);
    }
    setCreatingChannel(false);
    setNewChannelName('');
  }

  // Envio de Arquivo Binário (PDF, EXE, DOC, etc.) — Sem duplicação no remetente
  async function handleSendFile(file: File) {
    if (!activeChannel) return;
    const channelName = activeChannel.name;
    const ext = file.name.split('.').pop()?.toLowerCase() || 'file';
    const originalPath = (file as any).path || '';

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
          details: originalPath ? `Origem no disco: ${originalPath}` : 'Pronto para download sob demanda',
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
    broadcastDataChange();
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
          message: `Imagem salva em Documents/PsProject/channels/${channelName}`,
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
      if (!isElectron && syncConfig?.serverUrl && syncConfig?.token) {
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
            message: `Arquivo baixado para Documents/PsProject/channels/${channelName}`,
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

    broadcastDataChange();
    return item;
  }

  // Envio de Texto simples
  function handleSendText(text: string) {
    if (!activeChannel) return;
    store.addFlow({
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

    broadcastDataChange();
  }

  // Envio de Imagem
  function handleSendImage(imageData: string, imageName: string) {
    if (!activeChannel) return;
    store.addFlow({
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

    broadcastDataChange();
  }

  const isWsLive = isWsConnected || (isElectron && Boolean(syncActivity.lastSyncTime && Date.now() - syncActivity.lastSyncTime < 60000));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0a0a0f] text-white">
      <TitleBar
        channel={activeChannel}
        onClearChannel={() => activeChannel && store.clearChannel(activeChannel.id)}
        search={search}
        onSearchChange={setSearch}
        onOpenSync={() => setIsSyncModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        syncConnected={Boolean(syncActivity.lastSyncTime && Date.now() - syncActivity.lastSyncTime < 30000)}
        isWebSocketActive={isWsLive}
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
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          channels={store.channels}
          activeChannelId={store.activeChannelId}
          flowsCount={flowsCount}
          filter={filter}
          onSelectChannel={store.setActiveChannelId}
          onCreateChannel={handleCreateChannel}
          onRenameChannel={store.renameChannel}
          onDeleteChannel={store.deleteChannel}
          onFilterChange={setFilter}
          isOpenMobile={isSidebarOpenMobile}
          onCloseMobile={() => setIsSidebarOpenMobile(false)}
        />

        <main className="flex flex-1 flex-col">
          {creatingChannel && (
            <div className="border-b border-white/5 bg-[#0d0d12] px-4 py-3">
              <input
                autoFocus
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmCreateChannel();
                  if (e.key === 'Escape') setCreatingChannel(false);
                }}
                placeholder="Nome do canal (ex: Estudos)"
                className="w-64 rounded-lg border border-[#ff3e6c]/40 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none"
              />
              <button
                onClick={confirmCreateChannel}
                className="ml-2 rounded-lg bg-[#ff3e6c] px-3 py-2 text-sm font-medium text-white"
              >
                Criar
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
            {!activeChannel && <EmptyState onCreate={handleCreateChannel} />}
            {activeChannel && visibleFlows.length === 0 && (
              <ChannelEmpty channelName={activeChannel.name} />
            )}
            {activeChannel && visibleFlows.length > 0 && (
              <div className="mx-auto max-w-2xl space-y-3">
                {visibleFlows.map((item) => (
                  <FlowCard
                    key={item.id}
                    item={item}
                    onDelete={store.deleteFlow}
                    onTogglePin={store.togglePin}
                    onUpdateImage={store.updateFlowImage}
                    onDownloadItem={handleDownloadItem}
                    downloadProgress={downloadProgressMap[item.id]}
                  />
                ))}
              </div>
            )}
          </div>

          {activeChannel && (
            <Composer
              channelId={activeChannel.id}
              onSendLink={handleSendLink}
              onUpdateFlowPreview={store.updateFlowPreview}
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
      <h2 className="mb-2 text-xl font-bold text-white">Bem-vindo ao Flow</h2>
      <p className="mb-6 max-w-sm text-sm text-white/50">
        Crie canais para organizar seus links, arquivos, textos e imagens por assunto. Tudo fica salvo
        localmente neste dispositivo.
      </p>
      <button
        onClick={onCreate}
        className="rounded-xl bg-gradient-to-r from-[#ff3e6c] to-[#00e5ff] px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
      >
        Criar primeiro canal
      </button>
    </div>
  );
}

function ChannelEmpty({ channelName }: { channelName: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
        <Sparkles size={24} className="text-white/40" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-white">#{channelName} está vazio</h3>
      <p className="text-sm text-white/40">
        Cole um link, escreva um texto ou envie fotos e arquivos (PDF, EXE, DOC...) abaixo.
      </p>
    </div>
  );
}
