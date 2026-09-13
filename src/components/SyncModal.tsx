import { useEffect, useState, useId } from 'react';
import {
  X,
  QrCode,
  Smartphone,
  Check,
  Copy,
  RefreshCw,
  Wifi,
  WifiOff,
  Camera,
  AlertCircle,
  Laptop,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import type { SyncServerInfo } from '@/electron';
import {
  loadSyncConfig,
  saveSyncConfig,
  sendSyncRequestToPc,
  testPcConnection,
  type SyncConfig,
  type SyncData,
} from '@/lib/syncEngine';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  localData: SyncData;
  onSyncComplete: (mergedData: SyncData) => void;
  syncActivity?: {
    lastSyncTime?: number;
    lastDevice?: string;
    itemsCount?: number;
  };
}

export function SyncModal({
  isOpen,
  onClose,
  localData,
  onSyncComplete,
  syncActivity,
}: SyncModalProps) {
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
  const isNativeMobile = Capacitor.isNativePlatform();

  // No Electron PC, o padrão é a aba "server" (exibir QR Code). No celular/web, padrão é "client".
  const [activeTab, setActiveTab] = useState<'server' | 'client'>(isElectron ? 'server' : 'client');

  // Estado do Servidor (PC)
  const [serverInfo, setServerInfo] = useState<SyncServerInfo | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [selectedIp, setSelectedIp] = useState<string>('');

  // Estado do Cliente (Mobile / Conectar)
  const [clientConfig, setClientConfig] = useState<SyncConfig | null>(() => loadSyncConfig());
  const [manualUrl, setManualUrl] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Carregar informações do servidor no PC
  useEffect(() => {
    if (!isOpen) return;
    if (isElectron && window.electronAPI) {
      window.electronAPI.getSyncInfo().then((info) => {
        setServerInfo(info);
        if (info.ips && info.ips.length > 0) {
          setSelectedIp(info.ips[0]);
        }
      });
    }

    const saved = loadSyncConfig();
    if (saved) {
      setClientConfig(saved);
      setManualUrl(saved.serverUrl);
      setManualToken(saved.token);
    }
  }, [isOpen, isElectron]);

  if (!isOpen) return null;

  const currentUrl = selectedIp && serverInfo
    ? `http://${selectedIp}:${serverInfo.port}`
    : (serverInfo?.qrData?.url || '');

  const qrPayload = serverInfo?.qrData
    ? JSON.stringify({
        ...serverInfo.qrData,
        url: currentUrl,
      })
    : '';

  function copyConnectionUrl() {
    if (!currentUrl) return;
    navigator.clipboard.writeText(currentUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  async function handleRegenerateToken() {
    if (window.electronAPI?.regenerateSyncToken) {
      const updated = await window.electronAPI.regenerateSyncToken();
      if (updated) setServerInfo(updated);
    }
  }

  // Ação de escanear QR Code no celular
  async function handleScanQrCode() {
    setSyncStatusMsg(null);

    if (!isNativeMobile) {
      setSyncStatusMsg({
        text: 'A leitura por câmera direta requer o app nativo Android. Utilize a entrada manual de IP abaixo.',
        type: 'info',
      });
      return;
    }

    try {
      // Solicitar permissão de câmera
      const perm = await BarcodeScanner.requestPermissions();
      if (perm.camera !== 'granted' && perm.camera !== 'limited') {
        setSyncStatusMsg({
          text: 'Permissão de câmera não concedida. Você pode inserir o IP manualmente.',
          type: 'error',
        });
        return;
      }

      // Iniciar leitura
      const result = await BarcodeScanner.scan();
      if (result.barcodes && result.barcodes.length > 0) {
        const rawValue = result.barcodes[0].rawValue;
        if (rawValue) {
          handleParsedQrData(rawValue);
        }
      }
    } catch (err: any) {
      console.error('Erro ao escanear:', err);
      setSyncStatusMsg({
        text: 'Não foi possível acionar a câmera. Use a conexão manual.',
        type: 'error',
      });
    }
  }

  function handleParsedQrData(raw: string) {
    try {
      const data = JSON.parse(raw);
      if (data.protocol === 'flow-sync' && data.url && data.token) {
        setManualUrl(data.url);
        setManualToken(data.token);
        executeClientSync(data.url, data.token);
      } else {
        setSyncStatusMsg({
          text: 'QR Code inválido para o Flow Sync.',
          type: 'error',
        });
      }
    } catch {
      // Se for uma URL direta
      if (/^https?:\/\//i.test(raw)) {
        setManualUrl(raw);
        setSyncStatusMsg({
          text: 'URL detectada. Insira o token se necessário e toque em Sincronizar.',
          type: 'info',
        });
      } else {
        setSyncStatusMsg({
          text: 'Formato de QR Code não reconhecido.',
          type: 'error',
        });
      }
    }
  }

  async function executeClientSync(urlToUse?: string, tokenToUse?: string) {
    const targetUrl = (urlToUse || manualUrl).trim();
    const targetToken = (tokenToUse || manualToken).trim();

    if (!targetUrl) {
      setSyncStatusMsg({ text: 'Informe a URL ou IP do PC.', type: 'error' });
      return;
    }

    setIsSyncing(true);
    setSyncStatusMsg({ text: 'Conectando ao PC...', type: 'info' });

    try {
      const merged = await sendSyncRequestToPc(targetUrl, targetToken, localData, isNativeMobile ? 'Celular Android' : 'Cliente Web');
      
      const newConfig: SyncConfig = {
        serverUrl: targetUrl,
        token: targetToken,
        lastSyncedAt: Date.now(),
        autoSync: true,
      };
      setClientConfig(newConfig);
      saveSyncConfig(newConfig);

      onSyncComplete(merged);
      setSyncStatusMsg({
        text: `Sincronização concluída! ${merged.flows.length} itens e ${merged.channels.length} canais ativos.`,
        type: 'success',
      });
    } catch (err: any) {
      setSyncStatusMsg({
        text: err.message || 'Falha ao conectar com o PC. Verifique se ambos estão na mesma rede Wi-Fi.',
        type: 'error',
      });
    } finally {
      setIsSyncing(false);
    }
  }

  function handleDisconnect() {
    setClientConfig(null);
    saveSyncConfig(null);
    setManualUrl('');
    setManualToken('');
    setSyncStatusMsg({ text: 'Desconectado do PC.', type: 'info' });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#0e0e15] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#00e5ff] to-[#ff3e6c]">
              <QrCode size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Sincronização PC ↔ Celular</h2>
              <p className="text-xs text-white/40">Sincronize seus canais e mensagens em duas vias</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 bg-[#0a0a0f] p-1.5">
          <button
            onClick={() => setActiveTab('server')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium transition ${
              activeTab === 'server'
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <Laptop size={14} />
            Gerar QR Code (PC)
          </button>
          <button
            onClick={() => setActiveTab('client')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium transition ${
              activeTab === 'client'
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <Smartphone size={14} />
            Conectar ao PC (Celular)
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[75vh] overflow-y-auto p-6">
          {activeTab === 'server' ? (
            <div className="space-y-5">
              {/* QR Code container */}
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center">
                {qrPayload ? (
                  <div className="rounded-2xl bg-white p-3.5 shadow-lg">
                    <QRCodeSVG
                      value={qrPayload}
                      size={210}
                      bgColor="#ffffff"
                      fgColor="#0a0a0f"
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                ) : (
                  <div className="flex h-52 w-52 items-center justify-center rounded-2xl border border-dashed border-white/20">
                    <RefreshCw size={24} className="animate-spin text-white/40" />
                  </div>
                )}

                <div className="mt-4 flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#26de81]" />
                  <span className="text-xs font-medium text-[#26de81]">
                    Servidor de Sincronização Ativo
                  </span>
                </div>
                <p className="mt-1 max-w-xs text-xs text-white/50">
                  Abra o app no celular, vá em Sincronizar e aponte a câmera para este QR Code.
                </p>
              </div>

              {/* Network / IP info */}
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white/50">Endereço da Rede Local (Wi-Fi)</span>
                  {serverInfo && serverInfo.ips.length > 1 && (
                    <select
                      value={selectedIp}
                      onChange={(e) => setSelectedIp(e.target.value)}
                      className="rounded-lg border border-white/10 bg-[#16161e] px-2 py-1 text-xs text-white outline-none"
                    >
                      {serverInfo.ips.map((ip) => (
                        <option key={ip} value={ip}>{ip}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={currentUrl}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-mono text-white/80 outline-none"
                  />
                  <button
                    onClick={copyConnectionUrl}
                    className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/15"
                  >
                    {copiedUrl ? <Check size={14} className="text-[#26de81]" /> : <Copy size={14} />}
                    {copiedUrl ? 'Copiado' : 'Copiar'}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="text-xs text-white/40">
                    Token: <span className="font-mono text-white/70">{serverInfo?.token || '---'}</span>
                  </div>
                  <button
                    onClick={handleRegenerateToken}
                    className="flex items-center gap-1 text-xs text-[#00e5ff]/80 hover:text-[#00e5ff]"
                    title="Gerar novo código de pareamento"
                  >
                    <RefreshCw size={12} />
                    Novo token
                  </button>
                </div>
              </div>

              {/* Real-time sync status */}
              {syncActivity?.lastSyncTime && (
                <div className="rounded-2xl border border-[#26de81]/20 bg-[#26de81]/10 p-3.5 text-xs text-[#26de81]">
                  ✓ Última sincronização: há {Math.max(1, Math.floor((Date.now() - syncActivity.lastSyncTime) / 1000))} segundos ({syncActivity.lastDevice || 'Celular'})
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Scan Button */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#00e5ff]/10 text-[#00e5ff]">
                  <Camera size={26} />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-white">Escanear QR Code do PC</h3>
                <p className="mb-4 text-xs text-white/50">
                  Aponte a câmera para o QR Code exibido na tela do seu computador para conectar imediatamente.
                </p>

                <button
                  onClick={handleScanQrCode}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#ff3e6c] px-6 py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  <Camera size={16} />
                  Abrir Scanner
                </button>
              </div>

              {/* Manual Connection Option */}
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                <span className="block text-xs font-medium text-white/50">Ou conecte manualmente via IP</span>

                <div>
                  <label className="mb-1 block text-xs text-white/40">Endereço do PC (ex: 192.168.1.15:54321):</label>
                  <input
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    placeholder="http://192.168.1.15:54321"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-mono text-white placeholder-white/20 outline-none focus:border-[#00e5ff]/40"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-white/40">Token de Pareamento:</label>
                  <input
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="Cole o token gerado no PC"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-mono text-white placeholder-white/20 outline-none focus:border-[#00e5ff]/40"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => executeClientSync()}
                    disabled={isSyncing}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#00e5ff] px-4 py-2.5 text-xs font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                    {isSyncing ? 'Sincronizando...' : 'Conectar e Sincronizar'}
                  </button>

                  {clientConfig && (
                    <button
                      onClick={handleDisconnect}
                      className="rounded-xl border border-red-500/20 px-3 py-2.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                    >
                      Desconectar
                    </button>
                  )}
                </div>
              </div>

              {/* Status feedback */}
              {syncStatusMsg && (
                <div
                  className={`rounded-2xl p-3.5 text-xs flex items-start gap-2.5 ${
                    syncStatusMsg.type === 'success'
                      ? 'border border-[#26de81]/20 bg-[#26de81]/10 text-[#26de81]'
                      : syncStatusMsg.type === 'error'
                      ? 'border border-red-500/20 bg-red-500/10 text-red-400'
                      : 'border border-white/10 bg-white/5 text-white/70'
                  }`}
                >
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{syncStatusMsg.text}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
