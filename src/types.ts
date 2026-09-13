export type FlowType = 'link' | 'text' | 'image' | 'file';

export interface FlowLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: string;
}

export interface FlowItem {
  id: string;
  type: FlowType;
  channelId: string;
  createdAt: number;
  pinned: boolean;
  url?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  text?: string;
  imageData?: string;
  imageName?: string;
  // Campos para arquivos binários e FTP (v0.3.0)
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  fileType?: string;
  fileUrl?: string;
  transferSpeed?: string;
  isLoadingPreview?: boolean;
  logs?: FlowLogEntry[];
}

export interface Channel {
  id: string;
  name: string;
  createdAt: number;
  color: string;
}

export type FlowFilter = 'all' | 'link' | 'text' | 'image' | 'file';
