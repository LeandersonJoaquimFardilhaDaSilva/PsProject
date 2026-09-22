import { useEffect, useRef, useState } from 'react';
import { Send, Link2, MessageSquare, Image as ImageIcon, Loader2, X, Paperclip, FileText } from 'lucide-react';
import type { FlowItem, FlowType } from '@/types';
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

type Mode = 'auto' | 'text';

export function Composer({
  channelId,
  onSendLink,
  onUpdateFlowPreview,
  onSendText,
  onSendImage,
  onSendFile,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('auto');
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ data: string; name: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const genericFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText('');
    setImagePreview(null);
    setSelectedFile(null);
    setMode('auto');
  }, [channelId]);

  async function handleSend() {
    const value = text.trim();
    if (!value && !imagePreview && !selectedFile) return;

    // 1. Envio de Arquivo Binário (PDF, EXE, DOC, ZIP, etc.)
    if (selectedFile) {
      onSendFile(selectedFile);
      setSelectedFile(null);
      setText('');
      return;
    }

    // 2. Envio de Imagem
    if (imagePreview) {
      onSendImage(imagePreview.data, imagePreview.name);
      setImagePreview(null);
      setText('');
      return;
    }

    // 3. Envio de Link com Prévia Assíncrona
    if (mode === 'auto' && isUrl(value)) {
      const url = normalizeUrl(value);
      const domain = getDomain(url);

      // Limpa a barra de digitação na hora
      setText('');

      // Cria o card imediatamente com indicador animado de carregamento
      const newItem = onSendLink(
        url,
        domain,
        'Buscando dados do link...',
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        domain,
        true
      );

      // Busca assíncrona em background
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

    // 4. Envio de Texto simples
    onSendText(value);
    setText('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview({ data: reader.result as string, name: file.name });
      setSelectedFile(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handleGenericFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setImagePreview(null);
  }

  const showLinkHint = mode === 'auto' && isUrl(text.trim());

  return (
    <div className="border-t border-white/5 bg-[#0d0d12] px-4 py-3">
      {/* Chip de Prévia de Imagem */}
      {imagePreview && (
        <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
          <img src={imagePreview.data} alt="preview" className="h-10 w-10 rounded object-cover" />
          <span className="max-w-40 truncate text-xs text-white/60">{imagePreview.name}</span>
          <button
            onClick={() => setImagePreview(null)}
            className="rounded p-0.5 text-white/40 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Chip de Prévia de Arquivo Genérico (PDF, EXE, DOC, ZIP, etc.) */}
      {selectedFile && (
        <div className="mb-2 inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm"
            style={{ backgroundColor: getFileCategory(selectedFile.name).color }}
          >
            {getFileCategory(selectedFile.name).extension.slice(0, 4)}
          </div>
          <div className="min-w-0">
            <p className="max-w-48 truncate text-xs font-medium text-white">{selectedFile.name}</p>
            <p className="text-[11px] text-white/40">{formatBytes(selectedFile.size)}</p>
          </div>
          <button
            onClick={() => setSelectedFile(null)}
            className="ml-1 rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 py-0.5">
        <div className="flex gap-1">
          <button
            onClick={() => setMode('auto')}
            className={`rounded-lg p-2 transition ${
              mode === 'auto' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
            }`}
            title="Auto (link ou texto)"
          >
            <Link2 size={18} />
          </button>
          <button
            onClick={() => setMode('text')}
            className={`rounded-lg p-2 transition ${
              mode === 'text' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
            }`}
            title="Texto"
          >
            <MessageSquare size={18} />
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg p-2 text-white/40 transition hover:text-white/70"
            title="Enviar Imagem"
          >
            <ImageIcon size={18} />
          </button>
          <button
            onClick={() => {
              if (genericFileRef.current) genericFileRef.current.value = '';
              genericFileRef.current?.click();
            }}
            className="rounded-lg p-2 text-white/40 transition hover:text-white/70"
            title="Enviar Arquivo (PDF, EXE, DOC, ZIP...)"
          >
            <Paperclip size={18} />
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleImage}
            className="hidden"
          />
          <input
            ref={genericFileRef}
            type="file"
            onChange={handleGenericFile}
            className="hidden"
          />
        </div>

        <div className="relative flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              selectedFile
                ? `Pronto para enviar ${selectedFile.name}...`
                : mode === 'text'
                ? 'Digite uma mensagem...'
                : ''
            }
            rows={1}
            className="max-h-32 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#00e5ff]/40 focus:bg-white/10"
          />
          {showLinkHint && (
            <span className="absolute -top-5 left-2 text-xs text-[#00e5ff]/70">Link detectado</span>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={loading || (!text.trim() && !imagePreview && !selectedFile)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff3e6c] to-[#00e5ff] text-white transition hover:opacity-90 disabled:opacity-30 shrink-0"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
