import { useCallback, useEffect, useState } from 'react';
import type { Channel, FlowItem } from '@/types';
import { loadChannels, loadFlows, saveChannels, saveFlows, uid } from '@/lib/storage';

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
  const [channels, setChannels] = useState<Channel[]>(() => loadChannels());
  const [flows, setFlows] = useState<FlowItem[]>(() => loadFlows());
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  useEffect(() => {
    saveChannels(channels);
  }, [channels]);

  useEffect(() => {
    saveFlows(flows);
  }, [flows]);

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
      color: pickColor(channels.length),
    };
    setChannels((prev) => [...prev, channel]);
    setActiveChannelId(channel.id);
    return channel;
  }, [channels.length]);

  const renameChannel = useCallback((id: string, name: string) => {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)));
  }, []);

  const deleteChannel = useCallback((id: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
    setFlows((prev) => prev.filter((f) => f.channelId !== id));
  }, []);

  const addFlow = useCallback((flow: Omit<FlowItem, 'id' | 'createdAt' | 'pinned'>) => {
    const item: FlowItem = {
      ...flow,
      id: uid(),
      createdAt: Date.now(),
      pinned: false,
    };
    setFlows((prev) => [...prev, item]);
    return item;
  }, []);

  const deleteFlow = useCallback((id: string) => {
    setFlows((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const togglePin = useCallback((id: string) => {
    setFlows((prev) => prev.map((f) => (f.id === id ? { ...f, pinned: !f.pinned } : f)));
  }, []);

  const clearChannel = useCallback((channelId: string) => {
    setFlows((prev) => prev.filter((f) => f.channelId !== channelId));
  }, []);

  const updateFlowImage = useCallback((id: string, image: string) => {
    setFlows((prev) => prev.map((f) => (f.id === id ? { ...f, image } : f)));
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
    deleteFlow,
    togglePin,
    clearChannel,
    updateFlowImage,
  };
}
