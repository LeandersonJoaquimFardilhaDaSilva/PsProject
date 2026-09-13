import { useState } from 'react';
import { Link2, MessageSquare, Image as ImageIcon, ExternalLink, Copy, Trash2, Pin, Check, Plus, X } from 'lucide-react';
import type { FlowItem } from '@/types';
import { getDomain, isValidImageUrl } from '@/lib/linkPreview';

interface FlowCardProps {
  item: FlowItem;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onUpdateImage: (id: string, image: string) => void;
}

export function FlowCard({ item, onDelete, onTogglePin, onUpdateImage }: FlowCardProps) {
  const [copied, setCopied] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [editingImage, setEditingImage] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageError, setImageError] = useState(false);

  function copyContent() {
    const value = item.type === 'link' ? item.url : item.type === 'text' ? item.text : item.imageData;
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

  return (
    <>
      <div className="group relative animate-[flowIn_0.4s_ease-out] rounded-2xl border border-white/10 bg-[#16161e] p-4 transition hover:border-white/20 hover:bg-[#1a1a24]">
        {item.pinned && (
          <div className="absolute -left-1 top-4 h-8 w-1 rounded-full bg-gradient-to-b from-[#ff3e6c] to-[#00e5ff]" />
        )}

        <div className="mb-2 flex items-center gap-2">
          <TypeBadge type={item.type} />
          <span className="text-xs text-white/30">{timeAgo(item.createdAt)}</span>
          {item.siteName && (
            <span className="truncate text-xs text-white/40">· {item.siteName}</span>
          )}
          <div className="ml-auto flex gap-1 opacity-0 transition group-hover:opacity-100">
            <button
              onClick={() => onTogglePin(item.id)}
              className={`rounded-lg p-1.5 transition ${item.pinned ? 'text-[#ff3e6c]' : 'text-white/30 hover:text-white'}`}
              title={item.pinned ? 'Desafixar' : 'Fixar'}
            >
              <Pin size={14} />
            </button>
            <button
              onClick={copyContent}
              className="rounded-lg p-1.5 text-white/30 transition hover:text-white"
              title="Copiar"
            >
              {copied ? <Check size={14} className="text-[#26de81]" /> : <Copy size={14} />}
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="rounded-lg p-1.5 text-white/30 transition hover:text-red-400"
              title="Excluir"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {item.type === 'link' && item.image && !editingImage && (
          <div className="mb-3 overflow-hidden rounded-xl">
            <img
              src={item.image}
              alt={item.title}
              className="h-44 w-full object-cover transition group-hover:scale-[1.02]"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}

        {item.type === 'link' && !item.image && !editingImage && (
          <div className="mb-3 flex h-32 items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02]">
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
              <button onClick={() => { setEditingImage(false); setImageUrl(''); setImageError(false); }} className="rounded p-0.5 text-white/40 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <input
              autoFocus
              value={imageUrl}
              onChange={(e) => { setImageUrl(e.target.value); setImageError(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirmManualImage(); }
                if (e.key === 'Escape') { setEditingImage(false); setImageUrl(''); }
              }}
              placeholder="Cole o endereço da imagem (https://...)"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-[#00e5ff]/40"
            />
            {imageError && (
              <p className="mt-1.5 text-xs text-red-400">Endereço de imagem inválido. Verifique se começa com http:// ou https://</p>
            )}
            <button
              onClick={() => {
                if (!isValidImageUrl(imageUrl.trim())) { setImageError(true); return; }
                confirmManualImage();
              }}
              className="mt-2 rounded-lg bg-[#00e5ff] px-3 py-1.5 text-xs font-medium text-black"
            >
              Salvar imagem
            </button>
          </div>
        )}

        {item.type === 'link' && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (window.electronAPI && item.url) {
                e.preventDefault();
                window.electronAPI.openExternal(item.url);
              }
            }}
            className="mt-1 block"
          >
            <h3 className="mb-1 text-sm font-semibold text-white transition hover:text-[#00e5ff]">{item.title}</h3>
            {item.description && (
              <p className="mb-2 line-clamp-2 text-xs text-white/50">{item.description}</p>
            )}
            <div className="flex items-center gap-1 text-xs text-[#00e5ff]/70">
              <ExternalLink size={12} />
              {getDomain(item.url || '')}
            </div>
          </a>
        )}

        {item.type === 'text' && (
          <p className="whitespace-pre-wrap break-words text-sm text-white/80">{item.text}</p>
        )}

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
      </div>

      {imageOpen && item.type === 'image' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setImageOpen(false)}
        >
          <img src={item.imageData} alt={item.imageName || 'image'} className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </>
  );
}

function TypeBadge({ type }: { type: FlowItem['type'] }) {
  const config = {
    link: { icon: Link2, color: 'text-[#00e5ff] bg-[#00e5ff]/10' },
    text: { icon: MessageSquare, color: 'text-[#ff9f43] bg-[#ff9f43]/10' },
    image: { icon: ImageIcon, color: 'text-[#26de81] bg-[#26de81]/10' },
  };
  const { icon: Icon, color } = config[type];
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
