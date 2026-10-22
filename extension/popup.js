const DEFAULT_API = "http://127.0.0.1:54321/api";
const LEGACY_DEFAULT_API = "http://127.0.0.1:38527/api";
let activeApiUrl = DEFAULT_API;
let activeAuthToken = "";

let data = null;
let hasConnected = false;
const selectedChannelIds = new Set();
let sendChannelId = "";

const portraitImageMap = new Map();

function isImagePortrait(url, item) {
  if (item && typeof item.isPortrait === "boolean") return item.isPortrait;
  if (!url) return false;
  return portraitImageMap.get(url) === true;
}

window.onCardImageLoad = function (img, cardId) {
  if (!img) return;
  const isPortrait = img.naturalHeight > img.naturalWidth;
  if (img.src) {
    portraitImageMap.set(img.src, isPortrait);
  }
  const card =
    img.closest(".card") ||
    (cardId ? document.getElementById(`card-${cardId}`) : null);
  if (card) {
    if (isPortrait) {
      card.classList.add("card-portrait");
    } else {
      card.classList.remove("card-portrait");
    }
  }
};

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

const byId = (id) => document.getElementById(id);
const escapeHtml = (value = "") =>
  String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );

function normalizeApiUrl(rawUrl = "") {
  let url = String(rawUrl).trim().replace(/\/+$/, "");
  if (!url) return "";
  if (!url.endsWith("/api")) {
    url = `${url}/api`;
  }
  return url;
}

function setFeedbackMessage(text = "", isError = false) {
  const resultEl = byId("send-result");
  if (resultEl) {
    resultEl.textContent = text;
    resultEl.style.color = isError ? "var(--color-text-error)" : "var(--color-text-success)";
  }
}

function SelectChannelSwitch(forceOpen) {
  const selectChannel = byId("select-channel");
  if (!selectChannel) return;

  const isClosed = selectChannel.classList.contains("DropBoxClosed");
  const nextOpen = typeof forceOpen === "boolean" ? forceOpen : isClosed;

  selectChannel.classList.toggle("DropBoxOpen", nextOpen);
  selectChannel.classList.toggle("DropBoxClosed", !nextOpen);
}
window.SelectChannelSwitch = SelectChannelSwitch;

async function load() {
  const connection = byId("connection");
  if (!hasConnected && connection) connection.hidden = false;

  const savedUrl =
    localStorage.getItem("tove_ext_server_url") ||
    localStorage.getItem("flow_ext_server_url") ||
    "";
  const savedToken =
    localStorage.getItem("tove_ext_token") ||
    localStorage.getItem("flow_ext_token") ||
    "";

  // 1. Tentar servidor customizado salvo (Rede Local / Mobile / Remoto)
  if (savedUrl) {
    try {
      const targetUrl = normalizeApiUrl(savedUrl);
      const headers = {
        "Content-Type": "application/json",
        "X-Tove-Client": "extension",
      };
      if (savedToken) {
        headers["Authorization"] = `Bearer ${savedToken}`;
        headers["X-Sync-Token"] = savedToken;
      }
      const response = await fetch(`${targetUrl}/data`, { headers });
      if (response.ok) {
        data = await response.json();
        activeApiUrl = targetUrl;
        activeAuthToken = savedToken;
        render();
        hasConnected = true;
        if (connection) connection.hidden = true;
        byId("content").hidden = false;
        return;
      }
    } catch {
      // Ignora e tenta o servidor local padrão
    }
  }

  // 2. Tentar Servidor Local Padrão do Tove (127.0.0.1:54321)
  try {
    const response = await fetch(`${DEFAULT_API}/data`, {
      headers: {
        "X-Tove-Client": "extension",
      },
    });
    if (response.ok) {
      data = await response.json();
      activeApiUrl = DEFAULT_API;
      activeAuthToken = "";
      render();
      hasConnected = true;
      if (connection) connection.hidden = true;
      byId("content").hidden = false;
      return;
    }
  } catch {
    // Ignora e tenta a porta legada
  }

  // 3. Fallback: Tentar porta legada (127.0.0.1:38527)
  try {
    const response = await fetch(`${LEGACY_DEFAULT_API}/data`, {
      headers: {
        "X-Tove-Client": "extension",
      },
    });
    if (response.ok) {
      data = await response.json();
      activeApiUrl = LEGACY_DEFAULT_API;
      activeAuthToken = "";
      render();
      hasConnected = true;
      if (connection) connection.hidden = true;
      byId("content").hidden = false;
      return;
    }
  } catch {
    // Falha em ambas
  }

  hasConnected = false;
  if (connection) {
    connection.hidden = false;
    connection.textContent =
      "Servidor offline. Abra o aplicativo Tove no seu computador.";
  }
}

function render() {
  const channels = data?.channels || [];
  for (const id of selectedChannelIds) {
    if (!channels.some((channel) => channel.id === id)) {
      selectedChannelIds.delete(id);
    }
  }

  const cards = (data?.cards || data?.flows || [])
    .filter(
      (item) => !selectedChannelIds.size || selectedChannelIds.has(item.channelId),
    )
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  if (!channels.some((channel) => channel.id === sendChannelId)) {
    sendChannelId = channels[0]?.id || "";
  }

  const selectedChannel = channels.find((channel) => channel.id === sendChannelId);
  const placeholder = byId("select-placeholder");
  if (placeholder) {
    placeholder.textContent = selectedChannel
      ? `# ${selectedChannel.name}`
      : (channels.length ? "Selecione um canal" : "Nenhum canal");
  }

  const optionsBox = byId("channel-options-box");
  if (optionsBox) {
    optionsBox.innerHTML = channels.length
      ? channels
          .map(
            (channel) =>
              `<span class="channel-option ${channel.id === sendChannelId ? "selected" : ""}" data-channel-id="${escapeHtml(channel.id)}"># ${escapeHtml(channel.name)}</span>`,
          )
          .join("")
      : '<span class="channel-option" style="color:var(--color-text-muted)">Sem canais</span>';
  }

  byId("send").disabled = channels.length === 0;
  byId("count").textContent = selectedChannelIds.size
    ? `${selectedChannelIds.size}/${channels.length}`
    : channels.length;
  byId("links-count").textContent = cards.length;

  byId("channels").innerHTML = channels.length
    ? channels
        .map(
          (channel) =>
            `<button class="channel ${selectedChannelIds.has(channel.id) ? "selected" : ""}" data-channel-id="${escapeHtml(channel.id)}" style="--channel-color:${escapeHtml(channel.color || 'var(--color-accent-cyan)')}"># ${escapeHtml(channel.name)}</button>`,
        )
        .join("")
    : '<span class="empty">Nenhum canal encontrado no Tove.</span>';

  const cardsContainer = byId("cards") || byId("flows");
  if (cardsContainer) {
    // Pré-detecta a orientação de imagens para evitar oscilações visuais
    for (const item of cards) {
      const imgUrl = item.image || (item.url ? getYoutubeThumbnail(item.url) : "");
      if (imgUrl && !portraitImageMap.has(imgUrl)) {
        if (typeof item.isPortrait === "boolean") {
          portraitImageMap.set(imgUrl, item.isPortrait);
        } else {
          const probe = new Image();
          probe.onload = () => {
            const isPort = probe.naturalHeight > probe.naturalWidth;
            portraitImageMap.set(imgUrl, isPort);
            if (isPort) {
              const el = document.getElementById(`card-${item.id}`);
              if (el) el.classList.add("card-portrait");
            }
          };
          probe.src = imgUrl;
        }
      }
    }

    cardsContainer.innerHTML = cards.length
      ? cards.map((item) => cardMarkup(item)).join("")
      : '<div class="empty">Nenhuma mensagem ou link neste filtro.</div>';
  }
}

function cardMarkup(item) {
  const text = item.text || "";
  const targetUrl = item.url || (text ? (text.match(/https?:\/\/[^\s]+/gi) || [])[0] : "");
  
  const isVideo = item.type === "video" || item.fileType === "video" || (item.fileName && /\.(mp4|webm|mov|mkv|ogg)$/i.test(item.fileName));
  const videoSrc = item.videoData || item.fileData || item.fileUrl || "";
  
  // Imagem autônoma (não deve coincidir com links que possuem miniatura no preview)
  const isImage = (item.type === "image" || item.fileType === "image" || Boolean(item.imageData)) && item.type !== "link";
  const imageSrc = item.imageData || (item.type === "image" ? (item.image || item.fileUrl) : "") || (item.fileType === "image" ? (item.fileData || item.fileUrl) : "");
  
  const isFile = (item.type === "file" || item.fileType === "file" || Boolean(item.fileName)) && !isImage && !isVideo;

  // Renderiza o card de link (Grid 2x2 quando a imagem for vertical, ou padrão em coluna)
  if (targetUrl && !isImage && !isVideo) {
    const title = item.title || targetUrl;
    const desc = item.description || "";
    const img = item.image || (targetUrl ? getYoutubeThumbnail(targetUrl) : "");
    const siteName = item.siteName || domain(targetUrl);
    const timeStr = timeAgo(item.createdAt);
    const isPortrait = isImagePortrait(img, item);

    const headerHtml = `
      <div class="CardHeader">
        <span class="card-badge">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 17H7A5 5 0 0 1 7 7h2"></path>
            <path d="M15 7h2a5 5 0 1 1 0 10h-2"></path>
            <line x1="8" x2="16" y1="12" y2="12"></line>
          </svg>
        </span>
        ${timeStr ? `<span class="card-time">${escapeHtml(timeStr)}</span>` : ""}
        ${siteName ? `<span class="card-site">· ${escapeHtml(siteName.toUpperCase())}</span>` : ""}
        <div class="card-actions">
          <button type="button" class="action-btn copy-btn" data-copy="${escapeHtml(targetUrl)}" title="Copiar link">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
            </svg>
          </button>
        </div>
      </div>`;

    const imgHtml = img
      ? `<div class="card-image">
           <img src="${escapeHtml(img)}"
                onload="window.onCardImageLoad(this, '${escapeHtml(item.id || '')}')"
                onerror="if(this.src.indexOf('maxresdefault')!==-1){this.src=this.src.replace('maxresdefault','hqdefault');}else{this.style.display='none';}"
                alt="${escapeHtml(title)}"
                loading="lazy">
         </div>`
      : "";

    const footerHtml = `
      <div class="CardFooter">
        <h3 class="card-title">${escapeHtml(title)}</h3>
        ${desc ? `<p class="card-desc">${escapeHtml(desc)}</p>` : ""}
        <div class="card-link-wrapper">
          <a class="card-link" href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
              <path d="M15 3h6v6"></path>
              <path d="M10 14 21 3"></path>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            </svg>
            <span>${escapeHtml(domain(targetUrl))}</span>
          </a>
        </div>
      </div>`;

    return `
      <div id="card-${escapeHtml(item.id || '')}" class="card flow-card ${isPortrait ? 'card-portrait' : ''}">
        ${headerHtml}
        ${imgHtml}
        ${footerHtml}
      </div>`;
  }

  let bodyHtml = "";

  if (text && (!targetUrl || text.trim() !== targetUrl.trim())) {
    bodyHtml += `<div style="font-size: 12px; color: var(--color-text-primary); margin-bottom: 4px; word-break: break-word; line-height: 1.5;">${escapeHtml(text)}</div>`;
  }

  if (isVideo && videoSrc) {
    bodyHtml += `
      <div style="background: var(--color-overlay-white-soft); border-radius: 8px; margin-bottom: 2px;">
        <video controls src="${escapeHtml(videoSrc)}" style="width: 100%; max-height: 160px; border-radius: 6px; background: var(--color-black); display: block;"></video>
      </div>`;
  }

  if (isImage && imageSrc) {
    bodyHtml += `
      <div style="position: relative; margin-bottom: 2px; border-radius: 8px; overflow: hidden;">
        <img src="${escapeHtml(imageSrc)}" onerror="this.style.display='none'" style="width: 100%; max-height: 160px; object-fit: contain; border-radius: 6px; background: var(--color-overlay-black); display: block;" alt="">
        <a href="${escapeHtml(imageSrc)}" download="${escapeHtml(item.fileName || item.imageName || 'imagem.png')}" style="position: absolute; bottom: 6px; right: 6px; background: var(--color-overlay-black-strong); color: var(--color-accent-cyan); padding: 4px 8px; font-size: 10px; border-radius: 4px; text-decoration: none; font-weight: bold;">Download</a>
      </div>`;
  }

  if (isFile) {
    const fileDl = item.fileUrl || item.fileData || "";
    bodyHtml += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: var(--color-overlay-white-soft); border-radius: 8px; border: 1px solid var(--color-overlay-white-border); margin-bottom: 2px;">
        <span style="font-size: 11px; color: var(--color-text-primary); font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">📄 ${escapeHtml(item.fileName || 'Arquivo')}</span>
        ${fileDl ? `<a href="${escapeHtml(fileDl)}" download="${escapeHtml(item.fileName || 'arquivo')}" style="background: var(--color-overlay-cyan); color: var(--color-accent-cyan); padding: 4px 8px; font-size: 10px; border-radius: 4px; text-decoration: none; font-weight: bold;">Download</a>` : ''}
      </div>`;
  }

  return `
    <div id="card-${escapeHtml(item.id || '')}" class="card flow-card">
      ${bodyHtml}
    </div>`;
}

function domain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url || "";
  }
}

function getYoutubeThumbnail(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    let videoId = "";
    if (host === "youtu.be") videoId = parsed.pathname.split("/")[1] || "";
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
      videoId = parsed.searchParams.get("v") || "";
      if (!videoId) {
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (["shorts", "embed", "live"].includes(parts[0]))
          videoId = parts[1] || "";
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(videoId)
      ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
      : "";
  } catch {
    return "";
  }
}

function upgradeImageUrl(rawUrl, baseUrl) {
  if (!rawUrl) return "";
  try {
    let url = new URL(rawUrl, baseUrl).href;

    // 1. YouTube: Forçar sempre maxresdefault (1280x720)
    if (url.includes("ytimg.com") || url.includes("youtube.com")) {
      url = url.replace(/(hqdefault|mqdefault|sddefault|default)\.jpg/i, "maxresdefault.jpg");
    }

    // 2. WordPress / Jetpack: Remover dimensões reduzidas ex: -300x200.jpg -> .jpg
    if (/wp-content|uploads/i.test(url)) {
      url = url.replace(/-\d+x\d+(\.[a-zA-Z]+(?:\?.*)?)$/i, "$1");
      url = url.replace(/([?&])(w|h|resize|fit)=\d+[^&]*/gi, "");
    }

    // 3. Google User Content / Blogspot: Upgrade de /s\d+(-c)?/ para /s1600/
    if (url.includes("googleusercontent.com") || url.includes("ggpht.com") || url.includes("bp.blogspot.com")) {
      url = url.replace(/\/s\d+(-c)?\//i, "/s1600/");
      url = url.replace(/=w\d+-h\d+[^&]*/i, "=s1600");
    }

    // 4. Shopify: Remover sufixos de miniatura (_small, _medium, _compact, _large)
    if (url.includes("cdn.shopify.com")) {
      url = url.replace(/_(small|compact|medium|large|grande)(\.[a-zA-Z]+(?:\?.*)?)$/i, "_1024x1024$2");
    }

    // 5. Imgur: Remover sufixo de thumbnail (l, m, t, s) antes da extensão
    if (/i\.imgur\.com\/[a-zA-Z0-9]+[s|m|t|l]\.(jpg|jpeg|png|webp)/i.test(url)) {
      url = url.replace(/([a-zA-Z0-9]+)[s|m|t|l](\.(?:jpg|jpeg|png|webp))/i, "$1$2");
    }

    return url;
  } catch {
    return rawUrl;
  }
}

async function getPageMeta(tab) {
  const youtubeThumbnail = getYoutubeThumbnail(tab.url);
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // 1. Prioriza tags Open Graph / Twitter de alta resolução
        const imageSelectors = [
          'meta[name="twitter:image:src"]',
          'meta[name="twitter:image"]',
          'meta[property="og:image:secure_url"]',
          'meta[property="og:image"]',
          'meta[itemprop="image"]',
          'link[rel="image_src"]',
        ];

        let image = "";
        for (const selector of imageSelectors) {
          const els = document.querySelectorAll(selector);
          for (const el of els) {
            const val = (el.getAttribute("content") || el.getAttribute("href") || "").trim();
            if (
              val &&
              !val.endsWith(".svg") &&
              !val.includes("favicon") &&
              !val.includes("data:image/svg")
            ) {
              image = val;
              break;
            }
          }
          if (image) break;
        }

        // 2. Fallback para imagem de destaque ou artigo no DOM
        if (!image) {
          const heroSelectors = [
            'article img',
            '[class*="featured"] img',
            '[class*="hero"] img',
            '[class*="cover"] img',
            '[class*="thumbnail"] img',
            'main img',
          ];
          for (const selector of heroSelectors) {
            const imgEl = document.querySelector(selector);
            if (imgEl) {
              const src = imgEl.currentSrc || imgEl.src;
              if (
                src &&
                !src.endsWith(".svg") &&
                !src.includes("avatar") &&
                !src.includes("logo") &&
                (imgEl.naturalWidth >= 200 || !imgEl.complete)
              ) {
                image = src;
                break;
              }
            }
          }
        }

        // 3. Extração de descrição
        const descSelectors = [
          'meta[property="og:description"]',
          'meta[name="description"]',
          'meta[name="twitter:description"]',
          'meta[property="twitter:description"]',
          'meta[itemprop="description"]',
        ];

        let description = "";
        for (const selector of descSelectors) {
          const el = document.querySelector(selector);
          const val = (el?.getAttribute("content") || "").trim();
          if (val) {
            description = val;
            break;
          }
        }

        return { image, description };
      },
    });

    const meta = result?.result || { image: "", description: "" };

    // Se for YouTube, SEMPRE prioriza a thumbnail Full HD
    if (youtubeThumbnail) {
      meta.image = youtubeThumbnail;
    } else if (meta.image) {
      meta.image = upgradeImageUrl(meta.image, tab.url);
    }

    return meta;
  } catch {
    return {
      image: youtubeThumbnail || "",
      description: "",
    };
  }
}

async function sendCurrentTab() {
  const channelId = sendChannelId;
  if (!channelId) return;

  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (!tab || !tab.url) return;

  const button = byId("send");
  button.disabled = true;
  button.classList.add("is-sending");
  try {
    const { image, description } = await getPageMeta(tab);
    const headers = {
      "Content-Type": "application/json",
      "X-Tove-Client": "extension",
    };
    if (activeAuthToken) {
      headers["Authorization"] = `Bearer ${activeAuthToken}`;
      headers["X-Sync-Token"] = activeAuthToken;
    }

    await fetch(`${activeApiUrl}/links`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        channelId,
        url: tab.url,
        title: tab.title || tab.url,
        siteName: domain(tab.url),
        image,
        description,
      }),
    });
    await load();
  } finally {
    button.classList.remove("is-sending");
    button.disabled = !data?.channels?.length;
  }
}

// QR Code & Pareamento Manual via JSON
byId("mobile-qr")?.addEventListener("click", async () => {
  const qrPanel = byId("qr-panel");
  const qrImage = byId("qr-image");
  const qrImgContainer = byId("qr-img-container");

  if (!qrPanel.hidden) {
    qrPanel.hidden = true;
    return;
  }

  qrPanel.hidden = false;

  // Tenta carregar QR do servidor ativo
  try {
    const response = await fetch(`${activeApiUrl}/pairing-qr`, {
      headers: {
        "X-Tove-Client": "extension",
      },
    });
    const result = await response.json();
    if (response.ok && result.image) {
      qrImage.src = result.image;
      qrImgContainer.hidden = false;
      return;
    }
  } catch {
    // Ignora
  }
  qrImgContainer.hidden = true;
});

byId("close-qr-btn")?.addEventListener("click", () => {
  byId("qr-panel").hidden = true;
});

byId("pair-json-btn")?.addEventListener("click", async () => {
  const input = byId("qr-json-input").value.trim();
  if (!input) return;

  try {
    let payload;
    try {
      payload = JSON.parse(input);
    } catch {
      throw new Error("Formato inválido. Cole o JSON de sincronização copiado do Tove.");
    }

    let server = payload.url || payload.server || (Array.isArray(payload.candidateServers) ? payload.candidateServers[0] : "");
    if (!server && payload.ip) {
      server = `http://${payload.ip}:${payload.port || 54321}`;
    }
    if (server) {
      server = normalizeApiUrl(server);
    }

    const token = payload.token || "";
    const invitation = payload.invitation || "";

    if (!server) {
      throw new Error("JSON inválido: campo 'url' ou 'server' ausente.");
    }

    // 1. Pareamento moderno do Tove (o token já está presente no próprio JSON)
    if (token) {
      localStorage.setItem("tove_ext_server_url", server);
      localStorage.setItem("tove_ext_token", token);
      localStorage.removeItem("flow_ext_server_url");
      localStorage.removeItem("flow_ext_token");
      setFeedbackMessage("Dispositivo pareado com sucesso!");
      await load();
      return;
    }

    // 2. Pareamento com convite (legado)
    if (invitation) {
      const pairResponse = await fetch(`${server}/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitation }),
      });

      if (!pairResponse.ok) {
        const errText = await pairResponse.text().catch(() => "");
        throw new Error(`Falha no pareamento: ${errText || pairResponse.statusText}`);
      }

      const paired = await pairResponse.json();
      localStorage.setItem("tove_ext_server_url", server);
      localStorage.setItem("tove_ext_token", paired.token || invitation);
      localStorage.removeItem("flow_ext_server_url");
      localStorage.removeItem("flow_ext_token");

      setFeedbackMessage("Dispositivo pareado com sucesso!");
      await load();
      return;
    }

    // Se forneceu apenas URL sem token
    localStorage.setItem("tove_ext_server_url", server);
    localStorage.removeItem("tove_ext_token");
    localStorage.removeItem("flow_ext_server_url");
    localStorage.removeItem("flow_ext_token");
    setFeedbackMessage("Servidor configurado!");
    await load();
  } catch (err) {
    setFeedbackMessage(err instanceof Error ? err.message : String(err), true);
  }
});

byId("reset-conn-btn")?.addEventListener("click", async () => {
  localStorage.removeItem("tove_ext_server_url");
  localStorage.removeItem("tove_ext_token");
  localStorage.removeItem("flow_ext_server_url");
  localStorage.removeItem("flow_ext_token");
  setFeedbackMessage("Restaurado para conexão local (127.0.0.1).");
  await load();
});

// Event listeners para dropdown de canais
byId("select-placeholder")?.addEventListener("click", (e) => {
  e.stopPropagation();
  SelectChannelSwitch();
});

byId("channel-options-box")?.addEventListener("click", (event) => {
  const option = event.target.closest(".channel-option");
  if (!option) return;
  const id = option.dataset.channelId;
  if (!id) return;
  sendChannelId = id;
  const ch = (data?.channels || []).find((c) => c.id === id);
  if (ch) {
    byId("select-placeholder").textContent = `# ${ch.name}`;
  }
  byId("channel-options-box")
    .querySelectorAll(".channel-option")
    .forEach((el) => {
      el.classList.toggle("selected", el.dataset.channelId === sendChannelId);
    });
  SelectChannelSwitch(false);
});

// Fechar dropdown ao clicar fora
document.addEventListener("click", (event) => {
  const sendBox = document.querySelector(".send-box");
  if (sendBox && !sendBox.contains(event.target)) {
    SelectChannelSwitch(false);
  }
});

byId("send").addEventListener("click", sendCurrentTab);
byId("refresh").addEventListener("click", load);

byId("channels").addEventListener("click", (event) => {
  const button = event.target.closest("[data-channel-id]");
  if (!button) return;
  const id = button.dataset.channelId;
  if (selectedChannelIds.has(id)) selectedChannelIds.delete(id);
  else selectedChannelIds.add(id);
  render();
});

// Ação de copiar conteúdo do card
document.addEventListener("click", (e) => {
  const copyBtn = e.target.closest(".copy-btn");
  if (copyBtn) {
    e.preventDefault();
    e.stopPropagation();
    const val = copyBtn.dataset.copy;
    if (val) {
      navigator.clipboard.writeText(val);
      const originalSvg = copyBtn.innerHTML;
      copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#26de81" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      setTimeout(() => {
        copyBtn.innerHTML = originalSvg;
      }, 1500);
    }
  }
});

load();
setInterval(load, 3000);
