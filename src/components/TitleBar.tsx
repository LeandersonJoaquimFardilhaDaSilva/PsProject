import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X, WifiOff, Search, QrCode, Menu } from 'lucide-react';
import type { Channel } from '@/types';

interface TitleBarProps {
  channel: Channel | null;
  onClearChannel: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenSync: () => void;
  syncConnected?: boolean;
  onToggleSidebar?: () => void;
}

export function TitleBar({
  channel,
  onClearChannel,
  search,
  onSearchChange,
  onOpenSync,
  syncConnected,
  onToggleSidebar,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.isMaximized().then(setIsMaximized);
    const cleanup = window.electronAPI.onMaximizedChange(setIsMaximized);
    return cleanup;
  }, []);

  return (
    <div
      className="flex select-none items-center justify-between border-b border-white/5 bg-[#0a0a0f] px-3 sm:px-4 py-2 sm:py-2.5 shrink-0"
      style={{ WebkitAppRegion: isElectron ? 'drag' : undefined } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {isElectron ? (
          <div
            className="flex items-center gap-1.5"
            style={{ WebkitAppRegion: isElectron ? 'no-drag' : undefined } as React.CSSProperties}
          >
            <button
              onClick={() => window.electronAPI?.close()}
              className="h-3 w-3 rounded-full bg-[#ff5f57] transition hover:brightness-110"
              title="Fechar"
            />
            <button
              onClick={() => window.electronAPI?.minimize()}
              className="h-3 w-3 rounded-full bg-[#febc2e] transition hover:brightness-110"
              title="Minimizar"
            />
            <button
              onClick={() => window.electronAPI?.maximize()}
              className="h-3 w-3 rounded-full bg-[#28c840] transition hover:brightness-110"
              title={isMaximized ? 'Restaurar' : 'Maximizar'}
            />
          </div>
        ) : (
          <button
            onClick={onToggleSidebar}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white md:hidden shrink-0"
            title="Abrir canais"
          >
            <Menu size={16} />
          </button>
        )}
        <span className="truncate text-xs font-medium text-white/60">
          Flow {channel && `· ${channel.name}`}
        </span>
      </div>

      <div
        className="flex items-center gap-1.5 sm:gap-3 shrink-0"
        style={{ WebkitAppRegion: isElectron ? 'no-drag' : undefined } as React.CSSProperties}
      >
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar..."
            className="w-20 sm:w-40 rounded-lg border border-white/10 bg-white/5 pl-7 pr-2 py-1 text-xs text-white placeholder-white/30 outline-none focus:border-[#00e5ff]/40 focus:w-36 sm:focus:w-56 transition-all"
          />
        </div>

        <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-[#661e1e65]/20 bg-[#661e1e65]/10 px-2.5 py-1" title="Modo offline — dados salvos neste dispositivo">
          <WifiOff size={12} className="text-[#d40000]" />
          <span className="text-xs font-medium text-[#b40000]">Offline</span>
        </div>

        <button
          onClick={onOpenSync}
          className={`flex items-center gap-1 rounded-full border px-2 sm:px-2.5 py-1 text-xs font-medium transition ${
            syncConnected
              ? 'border-[#26de81]/30 bg-[#26de81]/15 text-[#26de81] hover:bg-[#26de81]/25'
              : 'border-[#00e5ff]/30 bg-[#00e5ff]/10 text-[#00e5ff] hover:bg-[#00e5ff]/20'
          }`}
          title="Sincronização bidirecional PC ↔ Celular via QR Code"
        >
          <QrCode size={12} />
          <span className="hidden xs:inline">{isElectron ? 'Celular' : 'Sync'}</span>
        </button>

        {channel && (
          <button
            onClick={onClearChannel}
            className="hidden sm:block rounded-lg px-2 py-1 text-xs text-white/40 transition hover:bg-red-500/10 hover:text-red-400"
          >
            Limpar
          </button>
        )}

        {isElectron && (
          <div className="ml-1 flex items-center gap-1 text-white/30">
            <button
              onClick={() => window.electronAPI?.minimize()}
              className="rounded p-1 hover:bg-white/10 hover:text-white/60"
              title="Minimizar"
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => window.electronAPI?.maximize()}
              className="rounded p-1 hover:bg-white/10 hover:text-white/60"
              title={isMaximized ? 'Restaurar' : 'Maximizar'}
            >
              {isMaximized ? <Copy size={12} className="rotate-180" /> : <Square size={12} />}
            </button>
            <button
              onClick={() => window.electronAPI?.close()}
              className="rounded p-1 hover:bg-red-500/20 hover:text-red-400"
              title="Fechar"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
