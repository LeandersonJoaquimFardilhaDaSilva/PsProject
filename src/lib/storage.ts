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

function readArray<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
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
  return readArray<Channel>(CHANNELS_KEY, []);
}

export function saveChannels(channels: Channel[]) {
  const safe = Array.isArray(channels) ? channels : [];
  write(CHANNELS_KEY, safe);
}

export function loadFlows(): FlowItem[] {
  return readArray<FlowItem>(FLOWS_KEY, []);
}

export function saveFlows(flows: FlowItem[]) {
  const safe = Array.isArray(flows) ? flows : [];
  write(FLOWS_KEY, safe);
}

const DELETED_CHANNELS_KEY = 'flow_deleted_channels';
const DELETED_FLOWS_KEY = 'flow_deleted_flows';

export function loadDeletedChannelIds(): string[] {
  return readArray<string>(DELETED_CHANNELS_KEY, []);
}

export function saveDeletedChannelIds(ids: string[]) {
  const safe = Array.isArray(ids) ? ids : [];
  write(DELETED_CHANNELS_KEY, Array.from(new Set(safe)));
}

export function addDeletedChannelId(id: string) {
  const current = loadDeletedChannelIds();
  const safeCurrent = Array.isArray(current) ? current : [];
  if (!safeCurrent.includes(id)) {
    saveDeletedChannelIds([...safeCurrent, id]);
  }
}

export function loadDeletedFlowIds(): string[] {
  return readArray<string>(DELETED_FLOWS_KEY, []);
}

export function saveDeletedFlowIds(ids: string[]) {
  const safe = Array.isArray(ids) ? ids : [];
  write(DELETED_FLOWS_KEY, Array.from(new Set(safe)));
}

export function addDeletedFlowId(id: string) {
  const current = loadDeletedFlowIds();
  const safeCurrent = Array.isArray(current) ? current : [];
  if (!safeCurrent.includes(id)) {
    saveDeletedFlowIds([...safeCurrent, id]);
  }
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

