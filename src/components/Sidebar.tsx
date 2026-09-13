import { Link2, MessageSquare, Image as ImageIcon, X, Hash } from 'lucide-react';
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
  const sidebarContent = (
    <aside className="flex h-full w-72 md:w-64 flex-col border-r border-white/5 bg-[#0d0d12]">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff3e6c] to-[#00e5ff]">
            <span className="text-sm font-black text-white">F</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-white">Flow</span>
        </div>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="rounded-lg p-1 text-white/40 hover:bg-white/5 hover:text-white md:hidden"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={onCreateChannel}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition hover:border-[#ff3e6c]/40 hover:bg-white/10 hover:text-white"
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
                  className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                  }`}
                  onClick={() => {
                    onSelectChannel(channel.id);
                    onCloseMobile?.();
                  }}
                >
                  <Hash size={16} style={{ color: channel.color }} />
                  <span className="flex-1 truncate">{channel.name}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">{count}</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChannel(channel.id);
                    }}
                    className="hidden rounded p-0.5 text-white/30 hover:bg-red-500/20 hover:text-red-400 group-hover:block"
                    aria-label="Excluir canal"
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
    </>
  );
}
