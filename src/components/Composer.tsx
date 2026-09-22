import { useEffect, useRef, useState } from 'react';
import { Send, Loader2, X, Paperclip, Film, FileText } from 'lucide-react';
import type { FlowItem } from '@/types';
import { fetchLinkPreview, isUrl, normalizeUrl, getDomain } from '@/lib/linkPreview';
import { getFileCategory, formatBytes } from '@/lib/fileTransferEngine';

interface ComposerProps {
  channelId: string;
  onSendLink: (
    url: string,
    title: string,
    description: string,
    image: string,
    siteName: string,
    isLoadingPreview?: boolean
  ) => FlowItem | void;
  onUpdateFlowPreview?: (id: string, preview: Partial<FlowItem>) => void;
  onSendText: (text: string) => void;
  onSendImage: (imageData: string, imageName: string) => void;
  onSendFile: (file: File) => void;
}

interface Attachment {
  file: File;
  kind: 'image' | 'video' | 'file';
  previewUrl?: string;
  name: string;
  size: number;
}

export function Composer({
  channelId,
  onSendLink,
  onUpdateFlowPreview,
  onSendText,
  onSendImage,
  onSendFile,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText('');
    clearAttachment();
  }, [channelId]);

  function clearAttachment() {
    if (attachment?.previewUrl && attachment.kind === 'video') {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = '';
    }
  }

  function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const isImg = file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
    const isVid = file.type.startsWith('video/') || ['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext);

    if (isImg) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachment({
          file,
          kind: 'image',
          previewUrl: reader.result as string,
          name: file.name,
          size: file.size,
        });
      };
      reader.readAsDataURL(file);
    } else if (isVid) {
      const url = URL.createObjectURL(file);
      setAttachment({
        file,
        kind: 'video',
        previewUrl: url,
        name: file.name,
        size: file.size,
      });
    } else {
      setAttachment({
        file,
        kind: 'file',
        name: file.name,
        size: file.size,
      });
    }
  }

  async function handleSend() {
    const value = text.trim();
    if (!value && !attachment) return;

    // 1. Envio de Anexo (Imagem, Vídeo ou Arquivo Geral)
    if (attachment) {
      if (attachment.kind === 'image' && attachment.previewUrl) {
        onSendImage(attachment.previewUrl, attachment.name);
      } else {
        onSendFile(attachment.file);
      }
      clearAttachment();
      setText('');
      return;
    }

    // 2. Envio de Link com Prévia Automática Assíncrona
    if (isUrl(value)) {
      const url = normalizeUrl(value);
      const domain = getDomain(url);

      setText('');

      const newItem = onSendLink(
        url,
        domain,
        'Buscando dados do link...',
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        domain,
        true
      );

      if (newItem && onUpdateFlowPreview) {
        fetchLinkPreview(url)
          .then((preview) => {
            onUpdateFlowPreview(newItem.id, {
              title: preview.title || domain,
              description: preview.description || '',
              image: preview.image || `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
              siteName: preview.siteName || domain,
              isLoadingPreview: false,
            });
          })
          .catch(() => {
            onUpdateFlowPreview(newItem.id, {
              isLoadingPreview: false,
            });
          });
      }
      return;
    }

    // 3. Envio de Texto simples
    onSendText(value);
    setText('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const showLinkHint = !attachment && isUrl(text.trim());

  return (
    <div className="border-t border-white/5 bg-[#0d0d12] px-4 py-3">
      {/* Chip de Prévia de Anexo com verificação de tipo de arquivo */}
      {attachment && (
        <div className="mb-2.5 inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2 pr-3 shadow-lg">
          {attachment.kind === 'image' && attachment.previewUrl && (
            <img
              src={attachment.previewUrl}
              alt="preview"
              className="h-12 w-12 rounded-lg object-cover border border-white/10"
            />
          )}

          {attachment.kind === 'video' && (
            <div className="relative flex h-12 w-16 items-center justify-center rounded-lg bg-black/60 border border-white/10 overflow-hidden">
              {attachment.previewUrl ? (
                <video
                  src={attachment.previewUrl}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <Film size={18} className="text-[#ff3e6c]" />
              )}
              <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[9px] font-bold text-white">
                VÍDEO
              </span>
            </div>
          )}

          {attachment.kind === 'file' && (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
              style={{ backgroundColor: getFileCategory(attachment.name).color }}
            >
              {getFileCategory(attachment.name).extension.slice(0, 4)}
            </div>
          )}

          <div className="min-w-0 max-w-52">
            <p className="truncate text-xs font-semibold text-white">{attachment.name}</p>
            <p className="text-[11px] text-white/50">{formatBytes(attachment.size)}</p>
          </div>

          <button
            onClick={clearAttachment}
            className="ml-1 rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white transition"
            title="Remover anexo"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 py-0.5">
        {/* Botão Único de Anexos */}
        <button
          type="button"
          onClick={() => {
            if (attachmentInputRef.current) attachmentInputRef.current.value = '';
            attachmentInputRef.current?.click();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white shrink-0"
          title="Anexar arquivo, imagem ou vídeo"
        >
          <Paperclip size={18} />
        </button>

        <input
          ref={attachmentInputRef}
          type="file"
          onChange={handleAttachmentChange}
          className="hidden"
        />

        <div className="relative flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              attachment
                ? `Pronto para enviar ${attachment.name}...`
                : 'Digite uma mensagem ou cole um link...'
            }
            rows={1}
            className="max-h-32 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#00e5ff]/40 focus:bg-white/10"
          />
          {showLinkHint && (
            <span className="absolute -top-5 left-2 text-xs font-medium text-[#00e5ff]/80">
              Link detectado automaticamente
            </span>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={loading || (!text.trim() && !attachment)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff3e6c] to-[#00e5ff] text-white transition hover:opacity-90 disabled:opacity-30 shrink-0 shadow-lg"
          title="Enviar"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
