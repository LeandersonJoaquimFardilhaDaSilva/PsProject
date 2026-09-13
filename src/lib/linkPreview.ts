export interface LinkPreview {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
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

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(url);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), ms)
  );
  return Promise.race([promise, controller]) as Promise<T>;
}

// Method 1: Microlink
async function tryMicrolink(url: string): Promise<LinkPreview> {
  const res = await withTimeout(
    fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`),
    8000
  );
  if (!res.ok) throw new Error('microlink failed');
  const json = await res.json();
  if (json.status !== 'success') throw new Error('microlink no success');
  const data = json.data ?? {};
  return {
    title: data.title || undefined,
    description: data.description || undefined,
    image: data.image?.url || data.logo?.url || undefined,
    siteName: data.publisher || data.author || getDomain(url),
  };
}

// Method 2: urlmeta.org
async function tryUrlmeta(url: string): Promise<LinkPreview> {
  const res = await withTimeout(
    fetch(`https://api.urlmeta.org/?url=${encodeURIComponent(url)}`),
    8000
  );
  if (!res.ok) throw new Error('urlmeta failed');
  const json = await res.json();
  if (json.meta?.status !== 'OK') throw new Error('urlmeta no ok');
  const m = json.meta;
  return {
    title: m.title || undefined,
    description: m.description || undefined,
    image: m.image || m['twitter:image'] || undefined,
    siteName: m.site_name || m.publisher || getDomain(url),
  };
}

// Method 3: CORS proxy + local meta tag parsing
async function tryCorsProxy(url: string): Promise<LinkPreview> {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res = await withTimeout(fetch(proxyUrl), 10000);
  if (!res.ok) throw new Error('proxy failed');
  const html = await res.text();
  if (!html || html.length < 50) throw new Error('proxy empty');

  const preview = parseMetaTags(html, url);
  if (!preview.title && !preview.image) throw new Error('proxy no meta');
  return preview;
}

function parseMetaTags(html: string, url: string): LinkPreview {
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

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const results: LinkPreview[] = [];

  for (const method of [tryMicrolink, tryUrlmeta, tryCorsProxy]) {
    try {
      const result = await method(url);
      results.push(result);
      if (result.image && result.title) break;
    } catch {
      // try next method
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
