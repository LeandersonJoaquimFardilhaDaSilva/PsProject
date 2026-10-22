import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  isPortrait?: boolean;
}

export type PreviewProviderId =
  | 'native'
  | 'oembed'
  | 'google_favicon'
  | 'heuristic'
  | 'microlink';

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
    name: 'Nativo com User-Agent Social (WhatsApp/Twitterbot)',
    description: 'Download direto do HTML pelo processo nativo com disfarce de crawler social, contornando bloqueios e extraindo OpenGraph direto da fonte.',
    enabled: true,
    timeoutMs: 8000,
  },
  {
    id: 'oembed',
    name: 'Protocolo Oficial oEmbed (YouTube, Reddit, etc.)',
    description: 'Padrão aberto oficial W3C suportado nativamente pelo YouTube, Reddit, Vimeo, Spotify e TikTok, com thumbnail e título originais.',
    enabled: true,
    timeoutMs: 6000,
  },
  {
    id: 'google_favicon',
    name: 'Google S2 Favicon API (Ícones Globais)',
    description: 'Serviço global do Google que obtém o logo/ícone oficial de qualquer site em alta resolução (128px), garantindo imagem sempre.',
    enabled: true,
    timeoutMs: 5000,
  },
  {
    id: 'heuristic',
    name: 'Parser Heurístico de URL (100% Offline)',
    description: 'Analisa o domínio e o caminho semântico da URL sem precisar de conexão à internet, formatando títulos limpos e legíveis.',
    enabled: true,
    timeoutMs: 1000,
  },
  {
    id: 'microlink',
    name: 'Microlink API (Nuvem)',
    description: 'Serviço público em nuvem da api.microlink.io que renderiza páginas e extrai dados estruturados.',
    enabled: true,
    timeoutMs: 8000,
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

    const validMap = new Map(DEFAULT_PREVIEW_PROVIDERS.map((p) => [p.id, p]));
    const cleaned = parsed.providers
      .filter((p) => validMap.has(p.id))
      .map((p) => {
        const def = validMap.get(p.id)!;
        return {
          ...def,
          enabled: typeof p.enabled === 'boolean' ? p.enabled : def.enabled,
          timeoutMs: p.timeoutMs || def.timeoutMs,
        };
      });

    const existingIds = new Set(cleaned.map((p) => p.id));
    for (const def of DEFAULT_PREVIEW_PROVIDERS) {
      if (!existingIds.has(def.id)) {
        cleaned.push(def);
      }
    }

    return { providers: cleaned.length > 0 ? cleaned : DEFAULT_PREVIEW_PROVIDERS };
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
  let trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
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

// ============================================================================
// 1. Método Nativo com User-Agent Social (WhatsApp/Twitterbot)
// ============================================================================
export async function tryNativeSocialCrawler(url: string, timeoutMs = 8000): Promise<LinkPreview> {
  const normalized = normalizeUrl(url);
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.fetchDirectHtml);
  const isNativeMobile = Capacitor.isNativePlatform();

  let html = '';

  if (isElectron && window.electronAPI?.fetchDirectHtml) {
    // Desktop Electron (via Node.js nativo sem bloqueio de CORS)
    html = await withTimeout(window.electronAPI.fetchDirectHtml(normalized), timeoutMs);
  } else if (isNativeMobile) {
    // Mobile Android (via CapacitorHttp nativo do Android com cabeçalho de crawler social)
    const res = await withTimeout(
      CapacitorHttp.get({
        url: normalized,
        headers: {
          'User-Agent':
            'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.html); Twitterbot/1.0; Mozilla/5.0 (Linux; Android 14) Flow/1.0',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        responseType: 'text',
      }),
      timeoutMs
    );
    html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  } else {
    // Web padrão
    const res = await withTimeout(fetch(normalized), timeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    html = await res.text();
  }

  if (!html || html.length < 50) {
    throw new Error('Conteúdo HTML retornado é vazio');
  }

  const preview = parseMetaTags(html, normalized);
  if (!preview.title && !preview.image) {
    throw new Error('Nenhuma meta tag OpenGraph encontrada no site');
  }

  // Se não encontrou imagem no HTML, completa com Google S2 Favicon
  if (!preview.image) {
    preview.image = `https://www.google.com/s2/favicons?domain=${getDomain(normalized)}&sz=128`;
  }

  return preview;
}

// ============================================================================
// 2. Método Oficial oEmbed (YouTube, Reddit, Vimeo, TikTok, Spotify, etc.)
// ============================================================================
export async function tryOEmbed(url: string, timeoutMs = 6000): Promise<LinkPreview> {
  const normalized = normalizeUrl(url);
  const u = new URL(normalized);
  const host = u.hostname.replace(/^www\./, '').toLowerCase();

  let endpoint = '';

  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(normalized)}&format=json`;
  } else if (host.includes('reddit.com')) {
    endpoint = `https://www.reddit.com/oembed?url=${encodeURIComponent(normalized)}`;
  } else if (host.includes('vimeo.com')) {
    endpoint = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(normalized)}`;
  } else if (host.includes('tiktok.com')) {
    endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(normalized)}`;
  } else if (host.includes('spotify.com')) {
    endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(normalized)}`;
  } else if (host.includes('codepen.io')) {
    endpoint = `https://codepen.io/api/oembed?url=${encodeURIComponent(normalized)}&format=json`;
  } else if (host.includes('flickr.com')) {
    endpoint = `https://www.flickr.com/services/oembed/?url=${encodeURIComponent(normalized)}&format=json`;
  } else {
    throw new Error(`oEmbed direto não configurado para o domínio ${host}`);
  }

  const res = await withTimeout(fetch(endpoint), timeoutMs);
  if (!res.ok) throw new Error(`Endpoint oEmbed retornou status HTTP ${res.status}`);
  const data = await res.json();

  const title = data.title || undefined;
  const image = data.thumbnail_url || data.thumbnail || undefined;
  const siteName = data.provider_name || getDomain(normalized);
  const description = data.author_name ? `Por ${data.author_name}` : undefined;

  if (!title && !image) {
    throw new Error('Resposta oEmbed não contém título nem imagem');
  }

  return { title, description, image, siteName };
}

// ============================================================================
// 3. Método Google S2 Favicon API
// ============================================================================
export async function tryGoogleFavicon(url: string, timeoutMs = 5000): Promise<LinkPreview> {
  const normalized = normalizeUrl(url);
  const domain = getDomain(normalized);
  const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  // Validação segura de carregamento de imagem sem bloqueio de CORS
  if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Favicon não pôde ser carregado'));
        img.src = iconUrl;
      }),
      timeoutMs
    ).catch(() => {
      // Ignora erro ou timeout para não impedir fallback visual
    });
  }

  const cleanName = domain.charAt(0).toUpperCase() + domain.slice(1);
  return {
    title: cleanName,
    description: `Acessar ${domain}`,
    image: iconUrl,
    siteName: domain,
  };
}

// ============================================================================
// 4. Método Heurístico Inteligente (100% Offline)
// ============================================================================
export async function tryHeuristic(url: string): Promise<LinkPreview> {
  const normalized = normalizeUrl(url);
  const u = new URL(normalized);
  const domain = u.hostname.replace(/^www\./, '');

  // Limpar pathname para gerar título legível
  const pathParts = u.pathname
    .split('/')
    .filter(Boolean)
    .map((seg) => decodeURIComponent(seg).replace(/[-_.]+/g, ' ').trim())
    .filter(Boolean);

  let title = domain;
  if (pathParts.length > 0) {
    // Pega os últimos segmentos relevantes
    const slug = pathParts[pathParts.length - 1];
    if (slug.length > 2) {
      title = `${slug.charAt(0).toUpperCase() + slug.slice(1)} · ${domain}`;
    }
  }

  const domainCapitalized = domain.split('.')[0];
  const siteName = domainCapitalized.charAt(0).toUpperCase() + domainCapitalized.slice(1);
  const iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  return {
    title,
    description: `Link de ${domain}`,
    image: iconUrl,
    siteName,
  };
}

// ============================================================================
// 5. Método Microlink API (Nuvem com normalização de URL)
// ============================================================================
export async function tryMicrolink(url: string, timeoutMs = 8000): Promise<LinkPreview> {
  const normalized = normalizeUrl(url);
  const res = await withTimeout(
    fetch(`https://api.microlink.io/?url=${encodeURIComponent(normalized)}`),
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
    siteName: data.publisher || data.author || getDomain(normalized),
  };
}

function decodeHtmlEntities(str?: string): string | undefined {
  if (!str) return undefined;
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .trim();
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
  const rawTitle =
    getMeta(['twitter:title', 'og:title']) ||
    titleMatch?.[1]?.trim() ||
    undefined;

  const rawDescription =
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

  const rawSiteName = getMeta(['og:site_name', 'application-name']) || getDomain(url);

  return {
    title: decodeHtmlEntities(rawTitle),
    description: decodeHtmlEntities(rawDescription),
    image,
    siteName: decodeHtmlEntities(rawSiteName),
  };
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
  native: tryNativeSocialCrawler,
  oembed: tryOEmbed,
  google_favicon: tryGoogleFavicon,
  heuristic: (u) => tryHeuristic(u),
  microlink: tryMicrolink,
};

/**
 * Testa um provedor isoladamente e mede tempo de resposta e erros
 */
export async function testSingleProvider(
  providerId: PreviewProviderId,
  url: string,
  timeoutMs = 8000
): Promise<ProviderTestResult> {
  const normalized = normalizeUrl(url);
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
    const data = await runner(normalized, timeoutMs);
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
  const normalized = normalizeUrl(url);
  const settings = loadPreviewSettings();
  const activeProviders = settings.providers.filter((p) => p.enabled);

  const providersToRun = activeProviders.length > 0 ? activeProviders : DEFAULT_PREVIEW_PROVIDERS;
  const results: LinkPreview[] = [];

  for (const prov of providersToRun) {
    const runner = PROVIDER_RUNNERS[prov.id];
    if (!runner) continue;
    try {
      const result = await runner(normalized, prov.timeoutMs);
      results.push(result);
      // Se já temos título e imagem, encerra
      if (result.image && result.title) break;
    } catch {
      // Tenta próximo provedor
    }
  }

  // Fallback final: heurístico
  if (results.length === 0) {
    return await tryHeuristic(normalized);
  }

  const merged = mergePreviews(...results);
  if (merged.image && typeof window !== 'undefined' && typeof Image !== 'undefined') {
    try {
      const isPortrait = await withTimeout(
        new Promise<boolean>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img.naturalHeight > img.naturalWidth);
          img.onerror = () => resolve(false);
          img.src = merged.image!;
        }),
        2500
      );
      merged.isPortrait = isPortrait;
    } catch {
      // Ignora timeout ou erro de carregamento no probing
    }
  }

  return merged;
}

export function isValidImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
