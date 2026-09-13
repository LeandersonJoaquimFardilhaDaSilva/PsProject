export interface SyncServerInfo {
  running: boolean;
  port: number;
  token: string;
  ips: string[];
  qrData: {
    protocol: string;
    version: number;
    url: string;
    token: string;
    deviceName: string;
  } | null;
}

export interface SyncIncomingData {
  syncId: string;
  channels: any[];
  flows: any[];
  deletedChannelIds: string[];
  deletedFlowIds: string[];
}

export interface SyncMergedResult {
  channels: any[];
  flows: any[];
  deletedChannelIds: string[];
  deletedFlowIds: string[];
}

export interface SyncClientInfo {
  ip: string;
  timestamp: number;
  device: string;
}

export interface ElectronAPI {
  isElectron: boolean;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  openExternal: (url: string) => Promise<boolean>;
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
  getSyncInfo: () => Promise<SyncServerInfo>;
  regenerateSyncToken: () => Promise<SyncServerInfo>;
  onSyncIncoming: (callback: (data: SyncIncomingData) => void) => () => void;
  sendSyncResponse: (syncId: string, data: SyncMergedResult) => Promise<any>;
  onSyncClientConnected: (callback: (data: SyncClientInfo) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
