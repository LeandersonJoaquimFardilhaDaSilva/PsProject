import { useCallback, useEffect, useRef, useState } from 'react';
import type { Channel, FlowItem, FlowLogEntry } from '@/types';
import {
  loadChannels,
  loadFlows,
  saveChannels,
  saveFlows,
  uid,
  loadDeletedChannelIds,
  saveDeletedChannelIds,
  addDeletedChannelId,
  loadDeletedFlowIds,
  saveDeletedFlowIds,
  addDeletedFlowId,
} from '@/lib/storage';

const CHANNEL_COLORS = [
  '#ff3e6c',
  '#00e5ff',
  '#ff9f43',
  '#26de81',
  '#fd79a8',
  '#74b9ff',
  '#ffe66d',
  '#a29bfe',
];

function pickColor(index: number): string {
  return CHANNEL_COLORS[index % CHANNEL_COLORS.length];
}

export function useFlowStore() {
  const memoryRef = useRef<{ channels: Channel[]; flows: FlowItem[] }>({
    channels: loadChannels(),
    flows: loadFlows(),
  });

  const [channels, setChannels] = useState<Channel[]>(() => memoryRef.current.channels);
  const [flows, setFlows] = useState<FlowItem[]>(() => memoryRef.current.flows);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (channels.length > 0 && (activeChannelId === null || !channels.find((c) => c.id === activeChannelId))) {
      setActiveChannelId(channels[0].id);
    }
    if (channels.length === 0) {
      setActiveChannelId(null);
    }
  }, [channels, activeChannelId]);

  const createChannel = useCallback((name: string) => {
    const channel: Channel = {
      id: uid(),
      name: name.trim() || 'Novo Canal',
      createdAt: Date.now(),
      color: pickColor(memoryRef.current.channels.length),
    };
    memoryRef.current.channels = [...memoryRef.current.channels, channel];
    saveChannels(memoryRef.current.channels);
    setChannels(memoryRef.current.channels);
    setActiveChannelId(channel.id);
    return channel;
  }, []);

  const renameChannel = useCallback((id: string, name: string) => {
    memoryRef.current.channels = memoryRef.current.channels.map((c) =>
      c.id === id ? { ...c, name: name.trim() || c.name } : c
    );
    saveChannels(memoryRef.current.channels);
    setChannels(memoryRef.current.channels);
  }, []);

  const deleteChannel = useCallback((id: string) => {
    addDeletedChannelId(id);
    memoryRef.current.channels = memoryRef.current.channels.filter((c) => c.id !== id);
    saveChannels(memoryRef.current.channels);
    setChannels(memoryRef.current.channels);

    const remaining: FlowItem[] = [];
    for (const f of memoryRef.current.flows) {
      if (f.channelId === id) {
        addDeletedFlowId(f.id);
      } else {
        remaining.push(f);
      }
    }
    memoryRef.current.flows = remaining;
    saveFlows(remaining);
    setFlows(remaining);
  }, []);

  const addFlow = useCallback((flow: Omit<FlowItem, 'id' | 'createdAt' | 'pinned'>) => {
    const item: FlowItem = {
      ...flow,
      id: uid(),
      createdAt: Date.now(),
      pinned: false,
      logs: flow.logs || [
        {
          timestamp: Date.now(),
          level: 'info',
          message: `Item (${flow.type}) criado localmente`,
        },
      ],
    };
    memoryRef.current.flows = [...memoryRef.current.flows, item];
    saveFlows(memoryRef.current.flows);
    setFlows(memoryRef.current.flows);
    return item;
  }, []);

  const addFlowDirect = useCallback((item: FlowItem) => {
    if (!item || !item.id) return;
    if (memoryRef.current.flows.some((f) => f.id === item.id)) return;
    memoryRef.current.flows = [...memoryRef.current.flows, item];
    saveFlows(memoryRef.current.flows);
    setFlows(memoryRef.current.flows);
  }, []);

  const addFlowLog = useCallback((flowId: string, log: FlowLogEntry) => {
    memoryRef.current.flows = memoryRef.current.flows.map((f) =>
      f.id === flowId
        ? { ...f, logs: [...(f.logs || []), log] }
        : f
    );
    saveFlows(memoryRef.current.flows);
    setFlows(memoryRef.current.flows);
  }, []);

  const deleteFlow = useCallback((id: string) => {
    addDeletedFlowId(id);
    memoryRef.current.flows = memoryRef.current.flows.filter((f) => f.id !== id);
    saveFlows(memoryRef.current.flows);
    setFlows(memoryRef.current.flows);
  }, []);

  const togglePin = useCallback((id: string) => {
    memoryRef.current.flows = memoryRef.current.flows.map((f) =>
      f.id === id ? { ...f, pinned: !f.pinned } : f
    );
    saveFlows(memoryRef.current.flows);
    setFlows(memoryRef.current.flows);
  }, []);

  const clearChannel = useCallback((channelId: string) => {
    const remaining: FlowItem[] = [];
    for (const f of memoryRef.current.flows) {
      if (f.channelId === channelId) {
        addDeletedFlowId(f.id);
      } else {
        remaining.push(f);
      }
    }
    memoryRef.current.flows = remaining;
    saveFlows(remaining);
    setFlows(remaining);
  }, []);

  const updateFlowImage = useCallback((id: string, image: string) => {
    memoryRef.current.flows = memoryRef.current.flows.map((f) =>
      f.id === id ? { ...f, image } : f
    );
    saveFlows(memoryRef.current.flows);
    setFlows(memoryRef.current.flows);
  }, []);

  const updateFlowPreview = useCallback((id: string, preview: Partial<FlowItem>) => {
    memoryRef.current.flows = memoryRef.current.flows.map((f) =>
      f.id === id ? { ...f, ...preview, isLoadingPreview: false } : f
    );
    saveFlows(memoryRef.current.flows);
    setFlows(memoryRef.current.flows);
  }, []);

  const replaceStoreData = useCallback(
    (newChannels: Channel[], newFlows: FlowItem[], deletedChannelIds?: string[], deletedFlowIds?: string[]) => {
      if (deletedChannelIds && Array.isArray(deletedChannelIds)) saveDeletedChannelIds(deletedChannelIds);
      if (deletedFlowIds && Array.isArray(deletedFlowIds)) saveDeletedFlowIds(deletedFlowIds);
      const safeChannels = Array.isArray(newChannels) ? newChannels : [];
      const safeFlows = Array.isArray(newFlows) ? newFlows : [];
      memoryRef.current.channels = safeChannels;
      memoryRef.current.flows = safeFlows;
      saveChannels(safeChannels);
      saveFlows(safeFlows);
      setChannels(safeChannels);
      setFlows(safeFlows);
    },
    []
  );

  const getSyncPayload = useCallback(() => {
    return {
      channels: memoryRef.current.channels,
      flows: memoryRef.current.flows,
      deletedChannelIds: loadDeletedChannelIds(),
      deletedFlowIds: loadDeletedFlowIds(),
    };
  }, []);

  return {
    channels,
    flows,
    activeChannelId,
    setActiveChannelId,
    createChannel,
    renameChannel,
    deleteChannel,
    addFlow,
    addFlowDirect,
    deleteFlow,
    togglePin,
    clearChannel,
    updateFlowImage,
    updateFlowPreview,
    addFlowLog,
    replaceStoreData,
    getSyncPayload,
  };
}
