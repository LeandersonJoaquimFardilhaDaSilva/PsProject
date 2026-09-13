import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export interface FileTransferResult {
  fileId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  speed: string;
  durationMs: number;
}

export function sanitizeFileName(name: string): string {
  if (!name) return `arquivo_${Date.now()}`;
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function getFileCategory(fileName: string): {
  category: 'pdf' | 'doc' | 'excel' | 'archive' | 'binary' | 'media' | 'code' | 'other';
  color: string;
  extension: string;
} {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'pdf':
      return { category: 'pdf', color: '#ff4757', extension: 'PDF' };
    case 'doc':
    case 'docx':
    case 'txt':
    case 'rtf':
    case 'odt':
      return { category: 'doc', color: '#2ed573', extension: ext.toUpperCase() };
    case 'xls':
    case 'xlsx':
    case 'csv':
      return { category: 'excel', color: '#10ac84', extension: ext.toUpperCase() };
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return { category: 'archive', color: '#ffa502', extension: ext.toUpperCase() };
    case 'exe':
    case 'msi':
    case 'bat':
    case 'cmd':
    case 'apk':
      return { category: 'binary', color: '#9b59b6', extension: ext.toUpperCase() };
    case 'mp4':
    case 'mkv':
    case 'avi':
    case 'mov':
    case 'mp3':
    case 'wav':
      return { category: 'media', color: '#ff6b81', extension: ext.toUpperCase() };
    case 'js':
    case 'ts':
    case 'tsx':
    case 'jsx':
    case 'json':
    case 'html':
    case 'css':
    case 'py':
    case 'java':
    case 'c':
    case 'cpp':
      return { category: 'code', color: '#00e5ff', extension: ext.toUpperCase() };
    default:
      return { category: 'other', color: '#747d8c', extension: ext.toUpperCase() || 'FILE' };
  }
}

/**
 * Salva um arquivo localmente na pasta Documents/PsProject/channels/[channelName]
 */
export async function saveLocalFile(
  channelName: string,
  fileName: string,
  fileBlob: Blob
): Promise<{ filePath: string; fileSize: number }> {
  const safeChannel = sanitizeFileName(channelName || 'Geral');
  const safeFile = sanitizeFileName(fileName);
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.saveFileToDocuments);
  const isMobile = Capacitor.isNativePlatform();

  const arrayBuffer = await fileBlob.arrayBuffer();

  if (isElectron && window.electronAPI?.saveFileToDocuments) {
    // Desktop: Salva via stream Node.js direto na pasta Documents
    const result = await window.electronAPI.saveFileToDocuments({
      channelName: safeChannel,
      fileName: safeFile,
      bufferData: Array.from(new Uint8Array(arrayBuffer)),
    });
    return { filePath: result.filePath, fileSize: result.fileSize };
  }

  if (isMobile) {
    // Mobile Android: Salva via Capacitor Filesystem no diretório Documents
    try {
      const folderPath = `PsProject/channels/${safeChannel}`;
      await Filesystem.mkdir({
        directory: Directory.Documents,
        path: folderPath,
        recursive: true,
      }).catch(() => {});

      const targetPath = `${folderPath}/${safeFile}`;

      // Converte para base64 apenas temporariamente para o bridge do Capacitor salvar no disco
      const base64 = await blobToBase64(fileBlob);
      const pureBase64 = base64.split(',')[1] || base64;

      const writeResult = await Filesystem.writeFile({
        directory: Directory.Documents,
        path: targetPath,
        data: pureBase64,
      });

      return {
        filePath: writeResult.uri,
        fileSize: fileBlob.size,
      };
    } catch (err: any) {
      console.error('[Filesystem] Erro ao gravar arquivo no mobile:', err);
    }
  }

  // Fallback web: URL de objeto em memória
  return {
    filePath: URL.createObjectURL(fileBlob),
    fileSize: fileBlob.size,
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Envia um arquivo como stream binário puro (application/octet-stream) para o PC
 */
export async function uploadFileToPcStream(
  pcBaseUrl: string,
  token: string,
  channelName: string,
  file: File | Blob,
  fileName: string,
  fileId?: string
): Promise<FileTransferResult> {
  const start = performance.now();
  const safeChannel = sanitizeFileName(channelName);
  const safeFile = sanitizeFileName(fileName);
  const id = fileId || crypto.randomUUID();

  const uploadUrl = `${pcBaseUrl.replace(/\/+$/, '')}/api/files/upload?token=${encodeURIComponent(
    token
  )}&channelName=${encodeURIComponent(safeChannel)}&fileName=${encodeURIComponent(
    safeFile
  )}&fileId=${encodeURIComponent(id)}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Sync-Token': token,
      'X-Channel-Name': encodeURIComponent(safeChannel),
      'X-File-Name': encodeURIComponent(safeFile),
      'X-File-Id': id,
    },
    body: file,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Falha no upload do arquivo (HTTP ${res.status}): ${errText || res.statusText}`);
  }

  const json = await res.json();
  const durationMs = Math.round(performance.now() - start);
  const durationSec = Math.max(0.001, durationMs / 1000);
  const speed = `${((file.size / (1024 * 1024)) / durationSec).toFixed(2)} MB/s`;

  return {
    fileId: id,
    fileName: safeFile,
    filePath: json.filePath || '',
    fileSize: file.size,
    speed: json.speed || speed,
    durationMs,
  };
}
