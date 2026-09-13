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

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
