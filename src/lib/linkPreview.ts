import { Capacitor } from '@capacitor/core';

export interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

export type PreviewProviderId = 'native' | 'microlink' | 'urlmeta' | 'cors_proxy';

export interface PreviewProviderConfig {
  id: PreviewProviderId;
  name: string;
  description: string;
  enabled: boolean;
  timeoutMs: number;
}

export interface PreviewSettings {
  providers: PreviewProviderConfig[];
}

export interface ProviderTestResult {
  providerId: PreviewProviderId;
  providerName: string;
  success: boolean;
  durationMs: number;
  data?: LinkPreview;
  error?: string;
}

export const DEFAULT_PREVIEW_PROVIDERS: PreviewProviderConfig[] = [
  {
    id: 'native',
    name: 'Nativo Direto (Electron Node.js / CapacitorHttp)',
    description: 'Download direto do HTML pelo processo nativo sem intermediários públicos, com parsing local de meta tags.',
    enabled: true,
    timeoutMs: 8000,
  },
  {
    id: 'microlink',
    name: 'Microlink API',
    description: 'Serviço em nuvem da api.microlink.io que processa a página e extrai metadados estruturados.',
    enabled: true,
    timeoutMs: 8000,
  },
  {
    id: 'urlmeta',
    name: 'Urlmeta API',
    description: 'Serviço gratuito api.urlmeta.org para extração rápida de OpenGraph e Twitter Cards.',
    enabled: true,
    timeoutMs: 8000,
  },
  {
    id: 'cors_proxy',
    name: 'Proxy AllOrigins + Parser Local',
    description: 'Usa o proxy público allorigins.win como contingência e analisa as tags HTML no cliente.',
    enabled: true,
    timeoutMs: 10000,
  },
];

const PREVIEW_SETTINGS_KEY = 'flow_settings_preview';

export function getDefaultPreviewSettings(): PreviewSettings {
  return {
    providers: JSON.parse(JSON.stringify(DEFAULT_PREVIEW_PROVIDERS)),
  };
}

export function loadPreviewSettings(): PreviewSettings {
  try {
    const raw = localStorage.getItem(PREVIEW_SETTINGS_KEY);
    if (!raw) return getDefaultPreviewSettings();
    const parsed: PreviewSettings = JSON.parse(raw);
    if (!Array.isArray(parsed.providers) || parsed.providers.length === 0) {
      return getDefaultPreviewSettings();
    }

    // Garantir que novos provedores que venham a existir sejam mesclados
    const existingIds = new Set(parsed.providers.map((p) => p.id));
    const mergedProviders = [...parsed.providers];
    for (const def of DEFAULT_PREVIEW_PROVIDERS) {
      if (!existingIds.has(def.id)) {
        mergedProviders.push(def);
      }
    }
    return { providers: mergedProviders };
  } catch {
    return getDefaultPreviewSettings();
  }
}

export function savePreviewSettings(settings: PreviewSettings): void {
  try {
    localStorage.setItem(PREVIEW_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage indisponível
  }
}

const URL_REGEX = /^https?:\/\/[^\s]+$/i;

export function isUrl(value: string): boolean {
  return URL_REGEX.test(value.trim());
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tempo limite de ${ms}ms esgotado`)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

// Método 1: Nativo Direto (Electron Node.js ou Android CapacitorHttp)
export async function tryNativeScraper(url: string, timeoutMs = 8000): Promise<LinkPreview> {
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.fetchDirectHtml);
  const isNativeMobile = Capacitor.isNativePlatform();

  let html = '';

  if (isElectron && window.electronAPI?.fetchDirectHtml) {
    // Desktop: Executa no processo Node.js principal sem CORS
    html = await withTimeout(window.electronAPI.fetchDirectHtml(url), timeoutMs);
  } else if (isNativeMobile) {
    // Mobile: Executa pelo CapacitorHttp nativo do Android
    const res = await withTimeout(
      fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 FlowApp/1.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      }),
      timeoutMs
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    html = await res.text();
  } else {
    // Web padrão: Tentativa direta com fetch
    const res = await withTimeout(fetch(url), timeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    html = await res.text();
  }

  if (!html || html.length < 50) {
    throw new Error('Conteúdo HTML vazio ou insuficiente');
  }

  const preview = parseMetaTags(html, url);
  if (!preview.title && !preview.image) {
    throw new Error('Nenhuma meta tag OpenGraph ou título encontrado na página');
  }
  return preview;
}

// Método 2: Microlink API
export async function tryMicrolink(url: string, timeoutMs = 8000): Promise<LinkPreview> {
  const res = await withTimeout(
    fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`),
    timeoutMs
  );
  if (!res.ok) throw new Error(`Microlink falhou com status HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== 'success') {
    throw new Error(json.message || 'Microlink não retornou status de sucesso');
  }
  const data = json.data ?? {};
  return {
    title: data.title || undefined,
    description: data.description || undefined,
    image: data.image?.url || data.logo?.url || undefined,
    siteName: data.publisher || data.author || getDomain(url),
  };
}

// Método 3: Urlmeta API
export async function tryUrlmeta(url: string, timeoutMs = 8000): Promise<LinkPreview> {
  const res = await withTimeout(
    fetch(`https://api.urlmeta.org/?url=${encodeURIComponent(url)}`),
    timeoutMs
  );
  if (!res.ok) throw new Error(`Urlmeta falhou com status HTTP ${res.status}`);
  const json = await res.json();
  if (json.meta?.status !== 'OK') {
    throw new Error(json.meta?.message || 'Urlmeta não retornou status OK');
  }
  const m = json.meta;
  return {
    title: m.title || undefined,
    description: m.description || undefined,
    image: m.image || m['twitter:image'] || undefined,
    siteName: m.site_name || m.publisher || getDomain(url),
  };
}

// Método 4: Proxy CORS AllOrigins + Parser Local
export async function tryCorsProxy(url: string, timeoutMs = 10000): Promise<LinkPreview> {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res = await withTimeout(fetch(proxyUrl), timeoutMs);
  if (!res.ok) throw new Error(`Proxy AllOrigins falhou com status HTTP ${res.status}`);
  const html = await res.text();
  if (!html || html.length < 50) throw new Error('Proxy retornou resposta vazia');

  const preview = parseMetaTags(html, url);
  if (!preview.title && !preview.image) {
    throw new Error('Nenhuma meta tag encontrada no HTML retornado pelo proxy');
  }
  return preview;
}

export function parseMetaTags(html: string, url: string): LinkPreview {
  const getMeta = (names: string[]): string | undefined => {
    for (const name of names) {
      const re = new RegExp(
        `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
        'i'
      );
      const match = html.match(re);
      if (match?.[1]) return match[1];
      const re2 = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
        'i'
      );
      const match2 = html.match(re2);
      if (match2?.[1]) return match2[1];
    }
    return undefined;
  };

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title =
    getMeta(['twitter:title', 'og:title']) ||
    titleMatch?.[1]?.trim() ||
    undefined;

  const description =
    getMeta(['twitter:description', 'og:description', 'description']) ||
    undefined;

  let image =
    getMeta(['twitter:image', 'twitter:image:src', 'og:image', 'og:image:secure_url']) ||
    undefined;

  if (image && !image.startsWith('http')) {
    try {
      image = new URL(image, url).href;
    } catch {
      image = undefined;
    }
  }

  const siteName = getMeta(['og:site_name', 'application-name']) || getDomain(url);

  return { title, description, image, siteName };
}

function mergePreviews(...previews: LinkPreview[]): LinkPreview {
  const merged: LinkPreview = {};
  for (const p of previews) {
    if (!merged.title && p.title) merged.title = p.title;
    if (!merged.description && p.description) merged.description = p.description;
    if (!merged.image && p.image) merged.image = p.image;
    if (!merged.siteName && p.siteName) merged.siteName = p.siteName;
  }
  return merged;
}

const PROVIDER_RUNNERS: Record<
  PreviewProviderId,
  (url: string, timeoutMs?: number) => Promise<LinkPreview>
> = {
  native: tryNativeScraper,
  microlink: tryMicrolink,
  urlmeta: tryUrlmeta,
  cors_proxy: tryCorsProxy,
};

/**
 * Testa um provedor isoladamente e mede tempo de resposta e erros
 */
export async function testSingleProvider(
  providerId: PreviewProviderId,
  url: string,
  timeoutMs = 8000
): Promise<ProviderTestResult> {
  const provider = DEFAULT_PREVIEW_PROVIDERS.find((p) => p.id === providerId);
  const providerName = provider ? provider.name : providerId;

  const start = performance.now();
  const runner = PROVIDER_RUNNERS[providerId];
  if (!runner) {
    return {
      providerId,
      providerName,
      success: false,
      durationMs: 0,
      error: 'Provedor não reconhecido',
    };
  }

  try {
    const data = await runner(url, timeoutMs);
    const durationMs = Math.round(performance.now() - start);
    return {
      providerId,
      providerName,
      success: true,
      durationMs,
      data,
    };
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - start);
    return {
      providerId,
      providerName,
      success: false,
      durationMs,
      error: err.message || 'Falha desconhecida na extração',
    };
  }
}

/**
 * Executa a extração completa de preview respeitando as configurações e a ordem salva
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const settings = loadPreviewSettings();
  const activeProviders = settings.providers.filter((p) => p.enabled);

  // Se nenhum estiver ativado, usa todos por segurança
  const providersToRun = activeProviders.length > 0 ? activeProviders : DEFAULT_PREVIEW_PROVIDERS;

  const results: LinkPreview[] = [];

  for (const prov of providersToRun) {
    const runner = PROVIDER_RUNNERS[prov.id];
    if (!runner) continue;
    try {
      const result = await runner(url, prov.timeoutMs);
      results.push(result);
      // Se já temos título e imagem, encerra a busca antecipadamente
      if (result.image && result.title) break;
    } catch (err) {
      console.warn(`[LinkPreview] Provedor ${prov.name} falhou:`, err);
      // Passa para o próximo método configurado
    }
  }

  if (results.length === 0) {
    return { siteName: getDomain(url), title: getDomain(url) };
  }

  return mergePreviews(...results);
}

export function isValidImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
