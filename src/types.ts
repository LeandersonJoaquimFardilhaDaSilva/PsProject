export type FlowType = 'link' | 'text' | 'image';

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
}

export interface Channel {
  id: string;
  name: string;
  createdAt: number;
  color: string;
}

export type FlowFilter = 'all' | 'link' | 'text' | 'image';
