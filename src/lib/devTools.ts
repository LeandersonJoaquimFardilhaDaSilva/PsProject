export interface DevToolsSettings {
  enableMessageLogs: boolean;
  enableMetadataTest: boolean;
  enableNetworkTest: boolean;
}

export const DEFAULT_DEVTOOLS_SETTINGS: DevToolsSettings = {
  enableMessageLogs: false,
  enableMetadataTest: false,
  enableNetworkTest: false,
};

const DEVTOOLS_STORAGE_KEY = 'flow_devtools_settings';

export function loadDevToolsSettings(): DevToolsSettings {
  try {
    const raw = localStorage.getItem(DEVTOOLS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DEVTOOLS_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      enableMessageLogs: Boolean(parsed.enableMessageLogs),
      enableMetadataTest: Boolean(parsed.enableMetadataTest),
      enableNetworkTest: Boolean(parsed.enableNetworkTest),
    };
  } catch {
    return { ...DEFAULT_DEVTOOLS_SETTINGS };
  }
}

export function saveDevToolsSettings(settings: DevToolsSettings): void {
  try {
    localStorage.setItem(DEVTOOLS_STORAGE_KEY, JSON.stringify(settings));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('flow-devtools-changed', { detail: settings }));
    }
  } catch {
    // storage full or unavailable
  }
}
