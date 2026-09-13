import type { Channel, FlowItem } from '@/types';

const CHANNELS_KEY = 'flow_channels';
const FLOWS_KEY = 'flow_items';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage may be full or unavailable
  }
}

export function loadChannels(): Channel[] {
  return read<Channel[]>(CHANNELS_KEY, []);
}

export function saveChannels(channels: Channel[]) {
  write(CHANNELS_KEY, channels);
}

export function loadFlows(): FlowItem[] {
  return read<FlowItem[]>(FLOWS_KEY, []);
}

export function saveFlows(flows: FlowItem[]) {
  write(FLOWS_KEY, flows);
}

const DELETED_CHANNELS_KEY = 'flow_deleted_channels';
const DELETED_FLOWS_KEY = 'flow_deleted_flows';

export function loadDeletedChannelIds(): string[] {
  return read<string[]>(DELETED_CHANNELS_KEY, []);
}

export function saveDeletedChannelIds(ids: string[]) {
  write(DELETED_CHANNELS_KEY, Array.from(new Set(ids)));
}

export function addDeletedChannelId(id: string) {
  const current = loadDeletedChannelIds();
  if (!current.includes(id)) {
    saveDeletedChannelIds([...current, id]);
  }
}

export function loadDeletedFlowIds(): string[] {
  return read<string[]>(DELETED_FLOWS_KEY, []);
}

export function saveDeletedFlowIds(ids: string[]) {
  write(DELETED_FLOWS_KEY, Array.from(new Set(ids)));
}

export function addDeletedFlowId(id: string) {
  const current = loadDeletedFlowIds();
  if (!current.includes(id)) {
    saveDeletedFlowIds([...current, id]);
  }
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

