import { useMemo, useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useFlowStore } from '@/hooks/useFlowStore';
import { Sidebar } from '@/components/Sidebar';
import { TitleBar } from '@/components/TitleBar';
import { FlowCard } from '@/components/FlowCard';
import { Composer } from '@/components/Composer';
import { SyncModal } from '@/components/SyncModal';
import { SettingsModal } from '@/components/SettingsModal';
import { reconcileSyncData, loadSyncConfig, sendSyncRequestToPc, type SyncData } from '@/lib/syncEngine';
import type { FlowFilter } from '@/types';

export function App() {
  const store = useFlowStore();
  const [filter, setFilter] = useState<FlowFilter>('all');
  const [search, setSearch] = useState('');
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [syncActivity, setSyncActivity] = useState<{
    lastSyncTime?: number;
    lastDevice?: string;
    itemsCount?: number;
  }>({});

  // Servidor PC: Escutar requisições de sincronização vindas do celular
  useEffect(() => {
    if (!window.electronAPI?.onSyncIncoming) return;

    const cleanup = window.electronAPI.onSyncIncoming(async (incomingData) => {
      const currentLocal = store.getSyncPayload();
      const merged = reconcileSyncData(currentLocal, {
        channels: incomingData.channels,
        flows: incomingData.flows,
        deletedChannelIds: incomingData.deletedChannelIds,
        deletedFlowIds: incomingData.deletedFlowIds,
      });

      store.replaceStoreData(merged.channels, merged.flows, merged.deletedChannelIds, merged.deletedFlowIds);

      // Responder para o processo principal com os dados mesclados
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

    return () => {
      cleanup();
      cleanupClient?.();
    };
  }, [store]);

  // Cliente Mobile / Web: Sincronização periódica em segundo plano se pareado
  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
    if (isElectron) return;

    const config = loadSyncConfig();
    if (!config || !config.autoSync || !config.serverUrl) return;

    const interval = setInterval(async () => {
      try {
        const local = store.getSyncPayload();
        const merged = await sendSyncRequestToPc(config.serverUrl, config.token, local);
        store.replaceStoreData(merged.channels, merged.flows, merged.deletedChannelIds, merged.deletedFlowIds);
        setSyncActivity({
          lastSyncTime: Date.now(),
          lastDevice: 'PC Desktop',
          itemsCount: merged.flows.length,
        });
      } catch {
        // Dispositivo temporariamente inacessível
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [store]);

  const activeChannel = store.channels.find((c) => c.id === store.activeChannelId) || null;

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
    if (filter !== 'all') items = items.filter((f) => f.type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (f) =>
          (f.title?.toLowerCase().includes(q)) ||
          (f.description?.toLowerCase().includes(q)) ||
          (f.text?.toLowerCase().includes(q)) ||
          (f.url?.toLowerCase().includes(q)) ||
          (f.imageName?.toLowerCase().includes(q))
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
    }
    setCreatingChannel(false);
    setNewChannelName('');
  }

  function handleSendLink(url: string, title: string, description: string, image: string, siteName: string) {
    if (!activeChannel) return;
    store.addFlow({ type: 'link', channelId: activeChannel.id, url, title, description, image, siteName });
  }

  function handleSendText(text: string) {
    if (!activeChannel) return;
    store.addFlow({ type: 'text', channelId: activeChannel.id, text });
  }

  function handleSendImage(imageData: string, imageName: string) {
    if (!activeChannel) return;
    store.addFlow({ type: 'image', channelId: activeChannel.id, imageData, imageName });
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0a0a0f] text-white">
      <TitleBar
        channel={activeChannel}
        onClearChannel={() => activeChannel && store.clearChannel(activeChannel.id)}
        search={search}
        onSearchChange={setSearch}
        onOpenSync={() => setIsSyncModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        syncConnected={Boolean(syncActivity.lastSyncTime && (Date.now() - syncActivity.lastSyncTime < 30000))}
        onToggleSidebar={() => setIsSidebarOpenMobile((prev) => !prev)}
      />

      <SyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        localData={store.getSyncPayload()}
        syncActivity={syncActivity}
        onSyncComplete={(merged) => {
          store.replaceStoreData(merged.channels, merged.flows, merged.deletedChannelIds, merged.deletedFlowIds);
          setSyncActivity({
            lastSyncTime: Date.now(),
            lastDevice: 'Celular',
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

          <div className="flex-1 overflow-y-auto px-6 py-6">
            {!activeChannel && (
              <EmptyState onCreate={handleCreateChannel} />
            )}
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
                  />
                ))}
              </div>
            )}
          </div>

          {activeChannel && (
            <Composer
              channelId={activeChannel.id}
              onSendLink={handleSendLink}
              onSendText={handleSendText}
              onSendImage={handleSendImage}
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
        Crie canais para organizar seus links, textos e imagens por assunto. Tudo fica salvo localmente neste dispositivo.
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
      <p className="text-sm text-white/40">Cole um link, escreva um texto ou envie uma imagem abaixo.</p>
    </div>
  );
}
