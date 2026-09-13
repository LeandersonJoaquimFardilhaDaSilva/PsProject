import { useEffect, useRef, useState } from 'react';
import { Send, Link2, MessageSquare, Image as ImageIcon, Loader2, X } from 'lucide-react';
import type { FlowType } from '@/types';
import { fetchLinkPreview, isUrl, normalizeUrl } from '@/lib/linkPreview';

interface ComposerProps {
  channelId: string;
  onSendLink: (url: string, title: string, description: string, image: string, siteName: string) => void;
  onSendText: (text: string) => void;
  onSendImage: (imageData: string, imageName: string) => void;
}

type Mode = 'auto' | 'text';

export function Composer({ channelId, onSendLink, onSendText, onSendImage }: ComposerProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('auto');
  const [loading, setLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ data: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText('');
    setImagePreview(null);
    setMode('auto');
  }, [channelId]);

  async function handleSend() {
    const value = text.trim();
    if (!value && !imagePreview) return;

    if (imagePreview) {
      onSendImage(imagePreview.data, imagePreview.name);
      setImagePreview(null);
      setText('');
      return;
    }

    if (mode === 'auto' && isUrl(value)) {
      setLoading(true);
      const url = normalizeUrl(value);
      const preview = await fetchLinkPreview(url);
      setLoading(false);
      onSendLink(url, preview.title || value, preview.description || '', preview.image || '', preview.siteName || '');
      setText('');
      return;
    }

    onSendText(value);
    setText('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview({ data: reader.result as string, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const showLinkHint = mode === 'auto' && isUrl(text.trim());

  return (
    <div className="border-t border-white/5 bg-[#0d0d12] px-4 py-3">
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

      <div className="flex items-end gap-2">
        <div className="flex gap-1">
          <button
            onClick={() => setMode('auto')}
            className={`rounded-lg p-2 transition ${mode === 'auto' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}
            title="Auto (link ou texto)"
          >
            <Link2 size={18} />
          </button>
          <button
            onClick={() => setMode('text')}
            className={`rounded-lg p-2 transition ${mode === 'text' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}
            title="Texto"
          >
            <MessageSquare size={18} />
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg p-2 text-white/40 transition hover:text-white/70"
            title="Imagem"
          >
            <ImageIcon size={18} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </div>

        <div className="relative flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'text' ? 'Digite uma mensagem...' : 'Cole um link ou digite...'}
            rows={1}
            className="max-h-32 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#00e5ff]/40 focus:bg-white/10"
          />
          {showLinkHint && (
            <span className="absolute -top-5 left-2 text-xs text-[#00e5ff]/70">Link detectado</span>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={loading || (!text.trim() && !imagePreview)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff3e6c] to-[#00e5ff] text-white transition hover:opacity-90 disabled:opacity-30"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
