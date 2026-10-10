import { useState, useEffect } from 'react';
import {
  Link2,
  MessageSquare,
  Image as ImageIcon,
  ExternalLink,
  Copy,
  Trash2,
  Pin,
  Check,
  Plus,
  X,
  FileText,
  FolderOpen,
  Terminal,
  Zap,
  Download,
  Film,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PendulumLoader } from '@/components/PendulumLoader';
import type { FlowItem, FlowLogEntry } from '@/types';
import { getDomain, isValidImageUrl } from '@/lib/linkPreview';
import { getFileCategory, formatBytes, getRegisteredOriginalFile } from '@/lib/fileTransferEngine';
import { loadDevToolsSettings } from '@/lib/devTools';
import { loadSyncConfig } from '@/lib/syncEngine';

interface FlowCardProps {
  item: FlowItem;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onUpdateImage: (id: string, image: string) => void;
  onDownloadItem?: (item: FlowItem) => Promise<void> | void;
  downloadProgress?: {
    percent: number;
    speed?: string;
    loaded?: number;
    total?: number;
    isDownloading?: boolean;
    isSuccess?: boolean;
  };
}

function isVideoFile(fileName?: string, fileType?: string): boolean {
  if (fileType && ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'video'].includes(fileType.toLowerCase())) return true;
  if (!fileName) return false;
  return /\.(mp4|webm|ogg|mov|mkv)$/i.test(fileName);
}

function isPdfFile(fileName?: string, fileType?: string): boolean {
  if (fileType && (fileType.toLowerCase() === 'pdf' || fileType.toLowerCase() === 'application/pdf')) return true;
  if (!fileName) return false;
  return /\.pdf$/i.test(fileName);
}

export function FlowCard({
  item,
  onDelete,
  onTogglePin,
  onUpdateImage,
  onDownloadItem,
  downloadProgress,
}: FlowCardProps) {
  const [copied, setCopied] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [editingImage, setEditingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageError, setImageError] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [devTools, setDevTools] = useState(() => loadDevToolsSettings());
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(null);
  const [resolvedPdfUrl, setResolvedPdfUrl] = useState<string | null>(null);
  const [pdfPage, setPdfPage] = useState(1);

  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
  const hasErrors = item.logs?.some((l) => l.level === 'error');
  const isVideo = item.type === 'file' && isVideoFile(item.fileName, item.fileType);
  const isPdf = item.type === 'file' && isPdfFile(item.fileName, item.fileType);

  // Escuta alterações de configurações do Dev-Tools em tempo real
  useEffect(() => {
    const handleDevToolsChange = () => {
      setDevTools(loadDevToolsSettings());
    };
    window.addEventListener('flow-devtools-changed', handleDevToolsChange);
    return () => window.removeEventListener('flow-devtools-changed', handleDevToolsChange);
  }, []);

  // Resolução de URL para reprodução de vídeo no app (Player Nativo)
  useEffect(() => {
    if (!isVideo) return;

    // 1. Arquivo original registrado em memória (enviado neste dispositivo)
    const reg = getRegisteredOriginalFile(item.id);
    if (reg?.file) {
      const u = URL.createObjectURL(reg.file);
      setResolvedVideoUrl(u);
      return () => URL.revokeObjectURL(u);
    }

    // 2. Dado em base64/URL direta
    if (item.videoData) {
      setResolvedVideoUrl(item.videoData);
      return;
    }

    // 3. Mobile Capacitor (arquivo local baixado)
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.() && item.filePath) {
      try {
        const src = (window as any).Capacitor.convertFileSrc(item.filePath);
        setResolvedVideoUrl(src);
        return;
      } catch {
        // continua
      }
    }

    // 4. Stream do servidor via HTTP Range
    const syncConfig = loadSyncConfig();
    if (syncConfig?.serverUrl && syncConfig.token && item.fileName) {
      let base = syncConfig.serverUrl.replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
      setResolvedVideoUrl(
        `${base}/api/files/download?fileId=${encodeURIComponent(item.id)}&fileName=${encodeURIComponent(
          item.fileName
        )}&token=${encodeURIComponent(syncConfig.token)}&stream=1`
      );
      return;
    }

    // 5. Desktop Electron: busca stream local na porta do syncServer
    if (isElectron && item.filePath && window.electronAPI?.getSyncInfo) {
      window.electronAPI.getSyncInfo().then((info) => {
        if (info?.port && info?.token) {
          setResolvedVideoUrl(
            `http://127.0.0.1:${info.port}/api/files/download?fileId=${encodeURIComponent(
              item.id
            )}&filePath=${encodeURIComponent(item.filePath!)}&token=${encodeURIComponent(
              info.token
            )}&stream=1`
          );
        }
      });
    }
  }, [item.id, item.filePath, item.fileName, item.videoData, isVideo, isElectron]);

  // Resolução de URL para exibição de PDF no leitor nativo via iframe
  useEffect(() => {
    if (!isPdf) return;

    // 1. Arquivo original em memória registrado neste aparelho
    const reg = getRegisteredOriginalFile(item.id);
    if (reg?.file) {
      const u = URL.createObjectURL(reg.file);
      setResolvedPdfUrl(u);
      return () => URL.revokeObjectURL(u);
    }

    // 2. Dado em URL direta / base64
    if (item.fileUrl) {
      setResolvedPdfUrl(item.fileUrl);
      return;
    }

    // 3. Mobile Capacitor (arquivo local baixado no dispositivo)
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.() && item.filePath) {
      try {
        const src = (window as any).Capacitor.convertFileSrc(item.filePath);
        setResolvedPdfUrl(src);
        return;
      } catch {
        // continua
      }
    }

    // 4. Servidor de sincronização via HTTP
    const syncConfig = loadSyncConfig();
    if (syncConfig?.serverUrl && syncConfig.token && item.fileName) {
      let base = syncConfig.serverUrl.replace(/\/+$/, '');
      if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
      setResolvedPdfUrl(
        `${base}/api/files/download?fileId=${encodeURIComponent(item.id)}&fileName=${encodeURIComponent(
          item.fileName
        )}&token=${encodeURIComponent(syncConfig.token)}&inline=1`
      );
      return;
    }

    // 5. Desktop Electron: busca stream local na porta do syncServer
    if (isElectron && item.filePath && window.electronAPI?.getSyncInfo) {
      window.electronAPI.getSyncInfo().then((info) => {
        if (info?.port && info?.token) {
          setResolvedPdfUrl(
            `http://127.0.0.1:${info.port}/api/files/download?fileId=${encodeURIComponent(
              item.id
            )}&filePath=${encodeURIComponent(item.filePath!)}&token=${encodeURIComponent(
              info.token
            )}&inline=1`
          );
        }
      });
    }
  }, [item.id, item.filePath, item.fileName, item.fileUrl, isPdf, isElectron]);

  function copyContent() {
    const value =
      item.type === 'link'
        ? item.url
        : item.type === 'text'
        ? item.text
        : item.type === 'file'
        ? item.filePath || item.fileName
        : item.imageData;
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function confirmManualImage() {
    if (!isValidImageUrl(imageUrl.trim())) return;
    onUpdateImage(item.id, imageUrl.trim());
    setEditingImage(false);
    setImageUrl('');
    setImageError(false);
  }

  function handleOpenFileLocation() {
    if (item.filePath && window.electronAPI?.openFileLocation) {
      window.electronAPI.openFileLocation(item.filePath);
    }
  }

  function handleOpenExternalLink(e: React.MouseEvent, url: string) {
    if (isElectron && window.electronAPI?.openExternal) {
      e.preventDefault();
      window.electronAPI.openExternal(url);
    }
  }

  const fileCategory = item.fileName ? getFileCategory(item.fileName) : null;

  return (
    <>
      <div className="group relative w-full max-w-full overflow-hidden animate-[flowIn_0.4s_ease-out] rounded-2xl border border-white/10 bg-[#16161e] p-3.5 sm:p-4 transition hover:border-white/20 hover:bg-[#1a1a24]">
        {item.pinned && (
          <div className="absolute -left-1 top-4 h-8 w-1 rounded-full bg-gradient-to-b from-[#ff3e6c] to-[#00e5ff]" />
        )}

        {/* Top Header do Card */}
        <div className="mb-2.5 flex items-center gap-2">
          <TypeBadge type={isVideo ? 'video' : isPdf ? 'pdf' : item.type} />
          <span className="text-xs text-white/30">{timeAgo(item.createdAt)}</span>
          {item.siteName && (
            <span className="truncate text-xs text-white/40">· {item.siteName}</span>
          )}
          {item.isLoadingPreview && (
            <span className="flex items-center gap-1.5 rounded-full bg-[#00e5ff]/10 px-2 py-0.5 text-[10px] font-medium text-[#00e5ff]">
              <PendulumLoader size={11} color="#00e5ff" /> Buscando dados...
            </span>
          )}
          {item.transferSpeed && (
            <span className="flex items-center gap-1 rounded-full bg-[#26de81]/15 px-2 py-0.5 text-[10px] font-semibold text-[#26de81]">
              <Zap size={10} /> {item.transferSpeed}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1 opacity-90 sm:opacity-80 sm:group-hover:opacity-100 transition">
            {/* Botão de Logs / Diagnóstico — Visível somente se ativado no Dev-Tools */}
            {devTools.enableMessageLogs && item.logs && item.logs.length > 0 && (
              <button
                onClick={() => setShowLogs((prev) => !prev)}
                className={`relative rounded-lg p-1.5 transition ${
                  showLogs
                    ? 'bg-white/15 text-white'
                    : hasErrors
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-white/30 hover:bg-white/5 hover:text-white/80'
                }`}
                title="Ver logs de diagnóstico deste item"
              >
                <Terminal size={14} />
                {hasErrors && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                )}
              </button>
            )}

            <button
              onClick={() => onTogglePin(item.id)}
              className={`rounded-lg p-1.5 transition ${
                item.pinned ? 'text-[#ff3e6c]' : 'text-white/30 hover:text-white'
              }`}
              title={item.pinned ? 'Desafixar' : 'Fixar'}
            >
              <Pin size={14} />
            </button>

            {/* Substituição do botão de Copiar por Download em Fotos e Arquivos */}
            {item.type === 'file' || item.type === 'image' ? (
              <button
                onClick={() => onDownloadItem?.(item)}
                disabled={downloadProgress?.isDownloading}
                className={`rounded-lg p-1.5 transition ${
                  downloadProgress?.isSuccess
                    ? 'text-[#26de81] bg-[#26de81]/15'
                    : downloadProgress?.isDownloading
                    ? 'text-[#00e5ff] animate-pulse bg-[#00e5ff]/10'
                    : 'text-white/40 hover:bg-white/10 hover:text-white'
                }`}
                title={
                  downloadProgress?.isDownloading
                    ? 'Baixando...'
                    : downloadProgress?.isSuccess
                    ? 'Download concluído'
                    : item.type === 'image'
                    ? 'Baixar imagem para o dispositivo'
                    : 'Baixar arquivo para o dispositivo'
                }
              >
                {downloadProgress?.isDownloading ? (
                  <PendulumLoader size={14} color="#00e5ff" />
                ) : downloadProgress?.isSuccess ? (
                  <Check size={14} className="text-[#26de81]" />
                ) : (
                  <Download size={14} />
                )}
              </button>
            ) : (
              <button
                onClick={copyContent}
                className="rounded-lg p-1.5 text-white/30 transition hover:text-white"
                title="Copiar"
              >
                {copied ? <Check size={14} className="text-[#26de81]" /> : <Copy size={14} />}
              </button>
            )}

            {/* Mensagens fixadas NÃO podem ser apagadas (botão de lixeira oculto se pinned) */}
            {!item.pinned && (
              <button
                onClick={() => onDelete(item.id)}
                className="rounded-lg p-1.5 text-white/30 transition hover:text-red-400"
                title="Excluir"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* 1. Card de Link — Texto Selecionável */}
        {item.type === 'link' && item.isLoadingPreview && (
          <div className="mb-3 flex h-24 items-center justify-center gap-3 rounded-xl border border-[#00e5ff]/20 bg-[#00e5ff]/5 text-xs text-[#00e5ff] animate-pulse">
            <PendulumLoader size={20} color="#00e5ff" />
            <span className="font-medium">Buscando informações do link em segundo plano...</span>
          </div>
        )}

        {item.type === 'link' && !item.isLoadingPreview && item.image && !editingImage && (
          <div className="mb-3 overflow-hidden rounded-xl">
            <img
              src={item.image}
              alt={item.title}
              className="h-44 w-full object-cover transition group-hover:scale-[1.02]"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {item.type === 'link' && !item.isLoadingPreview && !item.image && !editingImage && (
          <div className="mb-3 flex h-28 items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02]">
            <button
              onClick={() => setEditingImage(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-white/40 transition hover:bg-white/5 hover:text-white/70"
            >
              <Plus size={14} /> Adicionar imagem
            </button>
          </div>
        )}

        {item.type === 'link' && editingImage && (
          <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-white/60">Adicionar imagem manualmente</span>
              <button
                onClick={() => {
                  setEditingImage(false);
                  setImageUrl('');
                  setImageError(false);
                }}
                className="rounded p-0.5 text-white/40 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
            <input
              autoFocus
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                setImageError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmManualImage();
                }
                if (e.key === 'Escape') {
                  setEditingImage(false);
                  setImageUrl('');
                }
              }}
              placeholder="Cole o endereço da imagem (https://...)"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-[#00e5ff]/40"
            />
            {imageError && (
              <p className="mt-1.5 text-xs text-red-400">
                Endereço de imagem inválido. Verifique se começa com http:// ou https://
              </p>
            )}
            <button
              onClick={() => {
                if (!isValidImageUrl(imageUrl.trim())) {
                  setImageError(true);
                  return;
                }
                confirmManualImage();
              }}
              className="mt-2 rounded-lg bg-[#00e5ff] px-3 py-1.5 text-xs font-medium text-black"
            >
              Salvar imagem
            </button>
          </div>
        )}

        {item.type === 'link' && (
          <div className="block">
            <h3 className="mb-1 font-semibold text-white select-text cursor-text leading-snug">
              {item.title}
            </h3>
            {item.description && (
              <p className="mb-2 text-xs leading-relaxed text-white/50 line-clamp-2 select-text cursor-text">
                {item.description}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => handleOpenExternalLink(e, item.url || '')}
                className="inline-flex items-center gap-1 text-xs text-[#00e5ff]/80 hover:text-[#00e5ff] hover:underline transition select-text"
              >
                <ExternalLink size={12} className="shrink-0" />
                <span className="truncate max-w-xs">{getDomain(item.url || '')}</span>
              </a>
            </div>
          </div>
        )}

        {/* 2. Card de Texto Simples — Texto Selecionável */}
        {item.type === 'text' && (
          <p className="whitespace-pre-wrap break-words text-sm text-white/90 select-text cursor-text leading-relaxed">
            {item.text}
          </p>
        )}

        {/* 3. Card de Imagem */}
        {item.type === 'image' && (
          <button onClick={() => setImageOpen(true)} className="block w-full">
            <img
              src={item.imageData}
              alt={item.imageName || 'image'}
              className="max-h-80 w-full rounded-xl object-contain"
              loading="lazy"
            />
          </button>
        )}

        {/* 4. Card de Arquivo Binário ou Vídeo com Player */}
        {item.type === 'file' && (
          <div className="space-y-2.5">
            {/* Preview de Vídeo com Player no App */}
            {isVideo && (
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-md">
                {resolvedVideoUrl ? (
                  <video
                    src={resolvedVideoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="max-h-80 w-full rounded-xl object-contain bg-black"
                  />
                ) : (
                  <div className="flex h-32 flex-col items-center justify-center gap-2 p-4 text-center text-xs text-white/40">
                    <Film size={24} className="text-[#ff6b81]" />
                    <span>Player de vídeo pronto</span>
                    <span className="text-[11px] text-white/30">
                      Clique em Baixar abaixo para reproduzir no seu aparelho
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Leitor de PDF Leve com iframe e navegação por setas (Requisito 4) */}
            {isPdf && (
              <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c0c14] shadow-md">
                {resolvedPdfUrl ? (
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-3.5 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={15} className="text-red-400 shrink-0" />
                        <span className="text-xs font-semibold text-white/90 truncate">
                          {item.fileName || 'Documento PDF'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                          disabled={pdfPage <= 1}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-white/5 cursor-pointer"
                          title="Página anterior"
                          aria-label="Página anterior"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span className="min-w-14 text-center font-mono text-xs text-white/80">
                          Pág. {pdfPage}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPdfPage((p) => p + 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white cursor-pointer"
                          title="Próxima página"
                          aria-label="Próxima página"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="relative w-full h-80 bg-neutral-900 overflow-hidden">
                      <iframe
                        key={`pdf-${item.id}-p${pdfPage}`}
                        src={`${resolvedPdfUrl}#page=${pdfPage}&view=FitH`}
                        className="w-full h-full border-0 bg-white"
                        title={item.fileName || 'Leitor de PDF'}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-32 flex-col items-center justify-center gap-2 p-4 text-center text-xs text-white/40">
                    <FileText size={24} className="text-red-400" />
                    <span>Leitor de PDF pronto</span>
                    <span className="text-[11px] text-white/30">
                      Clique em Baixar abaixo para ler o documento no app
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 transition hover:bg-white/[0.04]">
              <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                <div
                  className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-lg overflow-hidden border border-white/10"
                  style={{ backgroundColor: isPdf ? '#e74c3c' : fileCategory?.color || '#a29bfe' }}
                >
                  {isVideo ? (
                    <Film size={18} />
                  ) : isPdf ? (
                    resolvedPdfUrl ? (
                      <div className="relative h-full w-full bg-white overflow-hidden pointer-events-none select-none">
                        <iframe
                          src={`${resolvedPdfUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                          className="pointer-events-none select-none absolute top-0 left-0 w-[240px] h-[240px] origin-top-left scale-[0.183] border-0 bg-white"
                          tabIndex={-1}
                          scrolling="no"
                          title="Miniatura PDF"
                        />
                      </div>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-red-600 text-[10px] font-bold text-white">
                        PDF
                      </div>
                    )
                  ) : (
                    fileCategory?.extension || 'FILE'
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate max-w-full">
                    {item.fileName || 'Arquivo sem nome'}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5">
                    <span>{formatBytes(item.fileSize || 0)}</span>
                    {item.transferSpeed && (
                      <span className="text-[#26de81]">· {item.transferSpeed}</span>
                    )}
                    {item.filePath && (
                      <span className="hidden sm:inline truncate max-w-40 text-white/20">
                        · {item.filePath}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Botão de Download Sob Demanda */}
                {(!item.filePath || downloadProgress?.isDownloading) && (
                  <button
                    onClick={() => onDownloadItem?.(item)}
                    disabled={downloadProgress?.isDownloading}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                      downloadProgress?.isSuccess
                        ? 'bg-[#26de81]/15 text-[#26de81] border-[#26de81]/30'
                        : downloadProgress?.isDownloading
                        ? 'bg-[#00e5ff]/15 text-[#00e5ff] border-[#00e5ff]/40 animate-pulse'
                        : 'border-white/10 bg-white/5 text-white/90 hover:bg-white/15 hover:text-white'
                    }`}
                  >
                    {downloadProgress?.isDownloading ? (
                      <>
                        <PendulumLoader size={13} color="#00e5ff" />
                        <span>{downloadProgress.percent}%</span>
                      </>
                    ) : downloadProgress?.isSuccess ? (
                      <>
                        <Check size={13} className="text-[#26de81]" />
                        <span>Baixado</span>
                      </>
                    ) : (
                      <>
                        <Download size={13} className="text-[#00e5ff]" />
                        <span>Baixar</span>
                      </>
                    )}
                  </button>
                )}

                {/* Ação de Abrir na Pasta no PC */}
                {isElectron && item.filePath && !downloadProgress?.isDownloading && (
                  <button
                    onClick={handleOpenFileLocation}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/15 hover:text-white"
                    title="Abrir pasta onde o arquivo foi salvo"
                  >
                    <FolderOpen size={14} className="text-[#00e5ff]" />
                    <span className="hidden sm:inline">Abrir Pasta</span>
                  </button>
                )}
              </div>
            </div>

            {/* Barra de Progresso no Download de Arquivos */}
            {downloadProgress?.isDownloading && (
              <div className="rounded-xl border border-[#00e5ff]/20 bg-[#00e5ff]/5 p-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="flex items-center gap-1.5 font-medium text-[#00e5ff]">
                    <PendulumLoader size={12} color="#00e5ff" />
                    Baixando arquivo... {downloadProgress.percent}%
                  </span>
                  <span className="text-white/50 text-[11px]">
                    {formatBytes(downloadProgress.loaded || 0)} / {formatBytes(downloadProgress.total || item.fileSize || 0)}
                    {downloadProgress.speed && ` · ${downloadProgress.speed}`}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#00e5ff] to-[#ff3e6c] transition-all duration-150"
                    style={{ width: `${Math.max(3, downloadProgress.percent)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Painel de Logs de Diagnóstico — Visível somente se Dev-Tools ativar */}
        {devTools.enableMessageLogs && showLogs && item.logs && item.logs.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/10 bg-[#09090d] p-3 font-mono text-[11px] space-y-2">
            <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
              <span className="flex items-center gap-1.5 text-white/60 font-semibold">
                <Terminal size={12} className="text-[#00e5ff]" /> Logs do Item
              </span>
              <span className="text-white/30 text-[10px]">{item.logs.length} eventos registrados</span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {item.logs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-white/30 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                  </span>
                  <LogLevelBadge level={log.level} />
                  <div className="min-w-0 flex-1">
                    <span className="text-white/80">{log.message}</span>
                    {log.details && (
                      <p className="text-[10px] text-white/40 mt-0.5">{log.details}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {imageOpen && item.type === 'image' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8 backdrop-blur-sm"
          onClick={() => setImageOpen(false)}
        >
          <div className="relative max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={item.imageData}
              alt={item.imageName || 'image'}
              className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
            <div className="absolute top-3 right-3 flex items-center gap-2">
              <button
                onClick={() => onDownloadItem?.(item)}
                disabled={downloadProgress?.isDownloading}
                className="flex items-center gap-1.5 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur border border-white/20 hover:bg-black/90"
              >
                {downloadProgress?.isDownloading ? (
                  <PendulumLoader size={13} color="#00e5ff" />
                ) : (
                  <Download size={13} className="text-[#00e5ff]" />
                )}
                <span>Baixar</span>
              </button>
              <button
                onClick={() => setImageOpen(false)}
                className="rounded-lg bg-black/70 p-1.5 text-white/70 backdrop-blur border border-white/20 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LogLevelBadge({ level }: { level: FlowLogEntry['level'] }) {
  switch (level) {
    case 'success':
      return <span className="rounded bg-[#26de81]/20 px-1 text-[9px] font-bold text-[#26de81]">OK</span>;
    case 'error':
      return <span className="rounded bg-red-500/20 px-1 text-[9px] font-bold text-red-400">ERR</span>;
    case 'warn':
      return <span className="rounded bg-amber-400/20 px-1 text-[9px] font-bold text-amber-400">WARN</span>;
    default:
      return <span className="rounded bg-cyan-400/20 px-1 text-[9px] font-bold text-cyan-400">INFO</span>;
  }
}

function TypeBadge({ type }: { type: FlowItem['type'] | 'video' | 'pdf' }) {
  const config = {
    link: { icon: Link2, color: 'text-[#00e5ff] bg-[#00e5ff]/10' },
    text: { icon: MessageSquare, color: 'text-[#ff9f43] bg-[#ff9f43]/10' },
    image: { icon: ImageIcon, color: 'text-[#26de81] bg-[#26de81]/10' },
    file: { icon: FileText, color: 'text-[#a29bfe] bg-[#a29bfe]/10' },
    video: { icon: Film, color: 'text-[#ff6b81] bg-[#ff6b81]/10' },
    pdf: { icon: FileText, color: 'text-red-400 bg-red-500/10' },
  };
  const { icon: Icon, color } = (config as any)[type] || config.text;
  return (
    <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${color}`}>
      <Icon size={13} />
    </span>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
