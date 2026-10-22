import * as pdfjsLib from 'pdfjs-dist';

// Configuração do Web Worker do PDF.js
// O processamento pesado de ler, decodificar e renderizar o PDF roda no worker fora da UI principal
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );
}

export function isPdfFile(fileName?: string, fileType?: string): boolean {
  if (fileType && (fileType.toLowerCase() === 'pdf' || fileType.toLowerCase() === 'application/pdf')) return true;
  if (!fileName) return false;
  return /\.pdf$/i.test(fileName);
}

const THUMBNAIL_CACHE_PREFIX = 'tove_pdf_thumb_';
const memoryThumbCache = new Map<string, string>();

/**
 * Recupera miniatura em cache (memória ou localStorage).
 */
export function getCachedThumbnail(key: string): string | null {
  if (!key) return null;
  if (memoryThumbCache.has(key)) return memoryThumbCache.get(key)!;
  try {
    const val = localStorage.getItem(THUMBNAIL_CACHE_PREFIX + key);
    if (val) {
      memoryThumbCache.set(key, val);
      return val;
    }
  } catch {
    // LocalStorage indisponível ou erro
  }
  return null;
}

/**
 * Salva miniatura em cache na memória e localStorage se couber.
 */
export function setCachedThumbnail(key: string, dataUrl: string): void {
  if (!key || !dataUrl) return;
  memoryThumbCache.set(key, dataUrl);
  try {
    if (dataUrl.length < 80000) {
      localStorage.setItem(THUMBNAIL_CACHE_PREFIX + key, dataUrl);
    }
  } catch {
    // Quota de storage excedida
  }
}

/**
 * Gera miniatura da 1ª página do PDF usando PDF.js e Canvas com Web Worker.
 * Reduz a escala no mobile para proteger a memória RAM do celular.
 * Retorna uma imagem em base64 (JPEG compactado).
 */
export async function generatePdfThumbnail(
  source: string | ArrayBuffer | Blob,
  cacheKey?: string
): Promise<string> {
  if (cacheKey) {
    const cached = getCachedThumbnail(cacheKey);
    if (cached) return cached;
  }

  let docSource: any;
  if (typeof source === 'string') {
    docSource = { url: source };
  } else if (source instanceof Blob) {
    const buffer = await source.arrayBuffer();
    docSource = { data: buffer };
  } else {
    docSource = { data: source };
  }

  const loadingTask = pdfjsLib.getDocument(docSource);
  const pdfDoc = await loadingTask.promise;

  try {
    const page = await pdfDoc.getPage(1);
    const mobile = isMobileDevice();

    // Escala controlada para não estourar RAM no celular (largura max 96px no mobile, 144px no desktop)
    const targetWidth = mobile ? 96 : 144;
    const unscaledViewport = page.getViewport({ scale: 1.0 });
    const scale = Math.max(0.1, targetWidth / unscaledViewport.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Falha ao obter contexto 2D do Canvas');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({
      canvasContext: context,
      viewport,
    });

    await renderTask.promise;

    // Converte para JPEG com qualidade 0.8 (gerando ~4-10 KB leve para transferir via rede)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    if (cacheKey) {
      setCachedThumbnail(cacheKey, dataUrl);
    }

    return dataUrl;
  } finally {
    try {
      pdfDoc.cleanup();
      pdfDoc.destroy();
    } catch {
      // Ignora erro no cleanup
    }
  }
}
