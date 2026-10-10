import { useState } from 'react';
import { Link2, MessageSquare, Image as ImageIcon, X, FileText, AlertTriangle } from 'lucide-react';
import { ChannelSquaresIcon } from '@/components/PendulumLoader';
import type { Channel, FlowFilter } from '@/types';

interface SidebarProps {
  channels: Channel[];
  activeChannelId: string | null;
  flowsCount: Record<string, number>;
  filter: FlowFilter;
  onSelectChannel: (id: string) => void;
  onCreateChannel: () => void;
  onRenameChannel: (id: string, name: string) => void;
  onDeleteChannel: (id: string) => void;
  onFilterChange: (filter: FlowFilter) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({
  channels,
  activeChannelId,
  flowsCount,
  filter,
  onSelectChannel,
  onCreateChannel,
  onDeleteChannel,
  onFilterChange,
  isOpenMobile,
  onCloseMobile,
}: SidebarProps) {
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);

  const sidebarContent = (
    <aside className="flex h-full w-72 md:w-64 flex-col border-r border-white/5 bg-[#0d0d12]">
      {onCloseMobile ? (
        <div className="flex items-center justify-end px-4 pt-3 pb-1 md:hidden">
          <button
            onClick={onCloseMobile}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/5 hover:text-white"
            title="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <div className="pt-2" />
      )}

      <div className="px-3 pb-2">
        <button
          onClick={onCreateChannel}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition hover:border-[#ff3e6c]/40 hover:bg-white/10 hover:text-white"
        >
          <span className="text-base leading-none">+</span> Novo Canal
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/30">Canais</p>
        {channels.length === 0 && (
          <p className="px-3 py-2 text-xs text-white/30">Nenhum canal ainda.</p>
        )}
        <ul className="space-y-1">
          {channels.map((channel) => {
            const isActive = channel.id === activeChannelId;
            const count = flowsCount[channel.id] || 0;
            return (
              <li key={channel.id}>
                <div
                  className={`group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                    isActive ? 'bg-white/10 text-white font-medium' : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                  }`}
                  onClick={() => {
                    onSelectChannel(channel.id);
                    onCloseMobile?.();
                  }}
                >
                  <ChannelSquaresIcon color={channel.color} size={14} className="shrink-0" />
                  <span className="flex-1 truncate">{channel.name}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">{count}</span>
                  )}
                  {/* Botão de excluir canal: acessível no mobile sem depender de hover, com confirmação */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setChannelToDelete(channel);
                    }}
                    className="flex sm:hidden sm:group-hover:flex rounded-lg p-1 text-white/30 hover:bg-red-500/20 hover:text-red-400 transition shrink-0"
                    title={`Excluir canal #${channel.name}`}
                    aria-label={`Excluir canal ${channel.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-white/5 px-3 py-3">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-white/30">Filtro</p>
        <div className="flex gap-1">
          {[
            { key: 'all' as const, label: 'Tudo', icon: null },
            { key: 'link' as const, label: '', icon: Link2 },
            { key: 'text' as const, label: '', icon: MessageSquare },
            { key: 'image' as const, label: '', icon: ImageIcon },
            { key: 'file' as const, label: '', icon: FileText },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                onFilterChange(key);
                onCloseMobile?.();
              }}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                filter === key ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              {Icon ? <Icon size={14} /> : label || 'Tudo'}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop permanent sidebar */}
      <div className="hidden md:flex h-full shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile drawer overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative z-50 h-full animate-[flowIn_0.2s_ease-out]">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Modal de Confirmação para Deletar Canal (Item 10) */}
      {channelToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
          onClick={() => setChannelToDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#16161e] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20 text-red-400">
              <AlertTriangle size={20} />
            </div>
            <h3 className="text-base font-semibold text-white">Excluir canal</h3>
            <p className="mt-1.5 text-xs text-white/60 leading-relaxed">
              Tem certeza que deseja excluir o canal{' '}
              <span className="font-semibold text-white">#{channelToDelete.name}</span>?
              Todas as mensagens, mídias e arquivos deste canal serão apagados.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setChannelToDelete(null)}
                className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteChannel(channelToDelete.id);
                  setChannelToDelete(null);
                }}
                className="rounded-xl bg-red-500 hover:bg-red-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg transition"
              >
                Excluir canal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
