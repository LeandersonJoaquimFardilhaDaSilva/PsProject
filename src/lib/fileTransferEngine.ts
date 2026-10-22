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

export interface TransferProgress {
  percent: number;
  speed: string;
  loaded: number;
  total: number;
}

// Registro em memória de arquivos originais (para envio sob demanda sem criar cópias)
const originalFilesMap = new Map<string, { file: File | Blob; fileName: string; originalPath?: string }>();

export function registerOriginalFile(
  fileId: string,
  file: File | Blob,
  fileName: string,
  originalPath?: string
) {
  originalFilesMap.set(fileId, { file, fileName, originalPath });
}

export function getRegisteredOriginalFile(fileId: string) {
  return originalFilesMap.get(fileId);
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
 * Salva um arquivo localmente na pasta Documents/Tove/channels/[channelName]
 * (Acionado apenas quando o usuário clica no botão de Download)
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

  if (isElectron && window.electronAPI?.saveFileToDocuments) {
    // Desktop: Salva via stream Node.js direto na pasta Documents
    const arrayBuffer = await fileBlob.arrayBuffer();
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
      const folderPath = `Tove/channels/${safeChannel}`;
      await Filesystem.mkdir({
        directory: Directory.Documents,
        path: folderPath,
        recursive: true,
      }).catch(() => {});

      const targetPath = `${folderPath}/${safeFile}`;

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

  // Fallback web: URL de objeto em memória ou download via tag <a>
  const url = URL.createObjectURL(fileBlob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    // ignore
  }

  return {
    filePath: url,
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
 * Baixa um arquivo sob demanda com leitura em stream e relatório de progresso em tempo real
 */
export async function downloadFileWithProgress(
  pcBaseUrl: string,
  token: string,
  channelName: string,
  fileName: string,
  fileId?: string,
  filePath?: string,
  onProgress?: (progress: TransferProgress) => void
): Promise<{ filePath: string; fileSize: number; speed: string }> {
  let baseUrl = pcBaseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `http://${baseUrl}`;
  }

  const params = new URLSearchParams({
    token,
    channelName,
    fileName,
  });
  if (fileId) params.append('fileId', fileId);
  if (filePath) params.append('filePath', filePath);

  const downloadUrl = `${baseUrl}/api/files/download?${params.toString()}`;

  const start = performance.now();

  if (Capacitor.isNativePlatform()) {
    const safeChannel = sanitizeFileName(channelName || 'Geral');
    const safeFile = sanitizeFileName(fileName);
    const folderPath = `Tove/channels/${safeChannel}`;

    await Filesystem.mkdir({
      directory: Directory.Documents,
      path: folderPath,
      recursive: true,
    }).catch(() => {});

    const targetPath = `${folderPath}/${safeFile}`;
    let lastBytes = 0;
    let lastProgressTime = 0;

    let progressHandle: any = null;
    if (onProgress) {
      progressHandle = await Filesystem.addListener('progress', (status: any) => {
        lastBytes = status.bytes || 0;
        const total = status.contentLength || 0;
        const now = performance.now();
        const isComplete = total > 0 && lastBytes >= total;

        if (isComplete || now - lastProgressTime >= 100) {
          lastProgressTime = now;
          const elapsedSec = Math.max(0.001, (now - start) / 1000);
          const speedMBs = (lastBytes / (1024 * 1024) / elapsedSec).toFixed(2);
          const percent = total > 0 ? Math.min(100, Math.round((lastBytes / total) * 100)) : 0;
          onProgress({
            percent,
            speed: `${speedMBs} MB/s`,
            loaded: lastBytes,
            total: total || lastBytes,
          });
        }
      });
    }

    try {
      const downloadRes = await Filesystem.downloadFile({
        url: downloadUrl,
        path: targetPath,
        directory: Directory.Documents,
        headers: {
          'X-Sync-Token': token,
        },
        progress: true,
        recursive: true,
      });

      if (progressHandle) {
        progressHandle.remove();
      }

      const durationSec = Math.max(0.001, (performance.now() - start) / 1000);
      const finalSpeed = `${(lastBytes / (1024 * 1024) / durationSec).toFixed(2)} MB/s`;

      return {
        filePath: downloadRes.path || targetPath,
        fileSize: lastBytes,
        speed: finalSpeed,
      };
    } catch (err: any) {
      if (progressHandle) progressHandle.remove();
      console.warn('[Filesystem] Falha no downloadFile nativo, caindo para fallback stream:', err);
    }
  }

  const res = await fetch(downloadUrl, {
    headers: {
      'X-Sync-Token': token,
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Falha no download (HTTP ${res.status}): ${errText || res.statusText}`);
  }

  const contentLengthHeader = res.headers.get('Content-Length') || res.headers.get('X-File-Size');
  const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;

  if (!res.body) {
    throw new Error('Corpo de resposta vazio');
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  let lastProgressTime = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      const now = performance.now();
      const isComplete = total > 0 && loaded >= total;
      if (isComplete || now - lastProgressTime >= 100) {
        lastProgressTime = now;
        const elapsedSec = Math.max(0.001, (now - start) / 1000);
        const speedMBs = (loaded / (1024 * 1024) / elapsedSec).toFixed(2);
        const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
        onProgress?.({
          percent,
          speed: `${speedMBs} MB/s`,
          loaded,
          total: total || loaded,
        });
      }
    }
  }

  const durationSec = Math.max(0.001, (performance.now() - start) / 1000);
  const finalSpeed = `${(loaded / (1024 * 1024) / durationSec).toFixed(2)} MB/s`;

  // Cria Blob e salva na pasta Documents local
  const blob = new Blob(chunks as BlobPart[]);
  const saved = await saveLocalFile(channelName, fileName, blob);

  return {
    filePath: saved.filePath,
    fileSize: loaded,
    speed: finalSpeed,
  };
}

/**
 * Salva imagem diretamente sob demanda (substituindo copiar)
 */
export async function downloadImageDirect(
  channelName: string,
  imageName: string,
  imageData: string,
  onProgress?: (progress: TransferProgress) => void
): Promise<{ filePath: string; fileSize: number }> {
  const safeName = imageName ? sanitizeFileName(imageName) : `imagem_${Date.now()}.png`;
  let blob: Blob;

  onProgress?.({ percent: 25, speed: '--', loaded: 0, total: 100 });

  if (imageData.startsWith('data:')) {
    const res = await fetch(imageData);
    blob = await res.blob();
  } else if (/^https?:\/\//i.test(imageData)) {
    const res = await fetch(imageData);
    blob = await res.blob();
  } else {
    throw new Error('Formato de imagem inválido para download');
  }

  onProgress?.({ percent: 75, speed: '--', loaded: blob.size, total: blob.size });
  const saved = await saveLocalFile(channelName, safeName, blob);
  onProgress?.({ percent: 100, speed: '--', loaded: blob.size, total: blob.size });

  return saved;
}

/**
 * Envia um arquivo como stream binário puro para o PC com suporte a progresso em tempo real
 */
export async function uploadFileToPcStream(
  pcBaseUrl: string,
  token: string,
  channelName: string,
  file: File | Blob,
  fileName: string,
  fileId?: string,
  onProgress?: (progress: TransferProgress) => void
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

  return new Promise((resolve, reject) => {
    // Garante o uso do XMLHttpRequest nativo não-interceptado do WebView/Chromium
    const NativeXhr =
      (window as any).CapacitorWebXMLHttpRequest?.fullObject ||
      (window as any).CapacitorWebXMLHttpRequest?.constructor ||
      window.XMLHttpRequest;
    const xhr = new NativeXhr();
    const nativeSend =
      (window as any).CapacitorWebXMLHttpRequest?.send ||
      xhr.send;

    xhr.open('POST', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Sync-Token', token);
    xhr.setRequestHeader('X-Channel-Name', encodeURIComponent(safeChannel));
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(safeFile));
    xhr.setRequestHeader('X-File-Id', id);

    let lastProgressTime = 0;
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (evt: ProgressEvent) => {
        if (evt.lengthComputable) {
          const now = performance.now();
          const isComplete = evt.loaded >= evt.total;
          if (isComplete || now - lastProgressTime >= 100) {
            lastProgressTime = now;
            const elapsedSec = Math.max(0.001, (now - start) / 1000);
            const speedMBs = (evt.loaded / (1024 * 1024) / elapsedSec).toFixed(2);
            const percent = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
            onProgress({
              percent,
              speed: `${speedMBs} MB/s`,
              loaded: evt.loaded,
              total: evt.total,
            });
          }
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          const durationMs = Math.round(performance.now() - start);
          const durationSec = Math.max(0.001, durationMs / 1000);
          const speed = `${((file.size / (1024 * 1024)) / durationSec).toFixed(2)} MB/s`;
          resolve({
            fileId: id,
            fileName: safeFile,
            filePath: json.filePath || '',
            fileSize: file.size,
            speed: json.speed || speed,
            durationMs,
          });
        } catch (e: any) {
          reject(new Error(`Erro ao ler resposta do upload: ${e.message}`));
        }
      } else {
        reject(new Error(`Falha no upload (HTTP ${xhr.status}): ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Falha de rede durante o upload'));
    xhr.ontimeout = () => reject(new Error('Tempo limite de upload esgotado'));

    nativeSend.call(xhr, file);
  });
}
