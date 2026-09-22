import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X, WifiOff, Search, QrCode, Menu, Settings } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import type { Channel } from '@/types';

interface TitleBarProps {
  channel: Channel | null;
  onClearChannel: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenSync: () => void;
  syncConnected?: boolean;
  isWebSocketActive?: boolean;
  activeClientsCount?: number;
  onToggleSidebar?: () => void;
  onOpenSettings?: () => void;
}

export function TitleBar({
  channel,
  onClearChannel,
  search,
  onSearchChange,
  onOpenSync,
  syncConnected,
  isWebSocketActive,
  activeClientsCount,
  onToggleSidebar,
  onOpenSettings,
}: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
  const isNativeMobile = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.isMaximized().then(setIsMaximized);
    const cleanup = window.electronAPI.onMaximizedChange(setIsMaximized);
    return cleanup;
  }, []);

  return (
    <div
      className={`flex select-none items-center justify-between border-b border-white/5 bg-[#0a0a0f] px-3 sm:px-4 py-2 sm:py-2.5 shrink-0 ${
        isNativeMobile ? 'pt-8 pb-3' : ''
      }`}
      style={{ WebkitAppRegion: isElectron ? 'drag' : undefined } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {isElectron ? (
          <div
            className="flex items-center gap-1.5 pointer-events-none select-none"
            style={{ WebkitAppRegion: isElectron ? 'no-drag' : undefined } as React.CSSProperties}
            aria-hidden="true"
          >
            <div
              className="h-3 w-3 rounded-full bg-[#ff5f57] opacity-80"
              title="Enfeite"
            />
            <div
              className="h-3 w-3 rounded-full bg-[#febc2e] opacity-80"
              title="Enfeite"
            />
            <div
              className="h-3 w-3 rounded-full bg-[#28c840] opacity-80"
              title="Enfeite"
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
          Tove {channel && `· ${channel.name}`}
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

        {/* Botão Unificado: Status de Conexão + QR Code (abre o modal de pareamento) */}
        <button
          onClick={onOpenSync}
          className={`flex items-center gap-1.5 rounded-full border px-2 sm:px-2.5 py-1 text-xs font-medium transition ${
            syncConnected
              ? 'border-[#26de81]/30 bg-[#26de81]/15 text-[#26de81] hover:bg-[#26de81]/25'
              : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
          }`}
          title={
            isWebSocketActive
              ? isElectron
                ? activeClientsCount && activeClientsCount > 0
                  ? `Conectado em tempo real (${activeClientsCount} aparelho${activeClientsCount > 1 ? 's' : ''}). Clique para ver QR Code`
                  : 'Servidor ativo na rede local. Clique para ver QR Code'
                : 'Conectado em tempo real com o PC. Clique para ver detalhes'
              : 'Modo offline. Clique para conectar via QR Code'
          }
        >
          {isWebSocketActive ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#26de81] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#26de81]"></span>
            </span>
          ) : (
            <WifiOff size={12} className="text-[#ff5f57] shrink-0" />
          )}
          <QrCode size={12} className="shrink-0" />
          <span className="hidden xs:inline">
            {isElectron
              ? activeClientsCount && activeClientsCount > 0
                ? `Celular (${activeClientsCount})`
                : 'Celular'
              : syncConnected
              ? 'Sync'
              : 'Conectar'}
          </span>
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 sm:px-2.5 py-1 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
          title="Configurações e opções do aplicativo"
        >
          <Settings size={12} />
          <span className="hidden sm:inline">Config</span>
        </button>

        {/* Botão Limpar visível para todos os usuários (incluindo mobile) */}
        {channel && (
          <button
            onClick={onClearChannel}
            className="rounded-lg px-2 py-1 text-xs text-white/40 transition hover:bg-red-500/10 hover:text-red-400"
            title="Limpar mensagens não fixadas deste canal"
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
