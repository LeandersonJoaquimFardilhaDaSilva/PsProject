import { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Link2,
  ArrowUp,
  ArrowDown,
  Check,
  Play,
  Pause,
  RotateCcw,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  Activity,
  Radio,
  Send,
  Terminal,
  Copy,
  Trash2,
  Sliders,
} from 'lucide-react';
import { PendulumLoader } from '@/components/PendulumLoader';
import {
  loadPreviewSettings,
  savePreviewSettings,
  getDefaultPreviewSettings,
  testSingleProvider,
  fetchLinkPreview,
  type PreviewSettings,
  type PreviewProviderConfig,
  type ProviderTestResult,
  type LinkPreview,
} from '@/lib/linkPreview';
import {
  loadDevToolsSettings,
  saveDevToolsSettings,
  type DevToolsSettings,
} from '@/lib/devTools';
import type { NetworkTestState } from '@/hooks/useNetworkTest';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  networkTest?: NetworkTestState;
  isWsConnected?: boolean;
  isElectron?: boolean;
  serverUrl?: string;
  activeClientsCount?: number;
}

export function SettingsModal({
  isOpen,
  onClose,
  networkTest,
  isWsConnected = false,
  isElectron = false,
  serverUrl,
  activeClientsCount = 0,
}: SettingsModalProps) {
  const [devTools, setDevTools] = useState<DevToolsSettings>(() => loadDevToolsSettings());
  const [activeTab, setActiveTab] = useState<'devtools' | 'preview' | 'network'>('devtools');
  const [settings, setSettings] = useState<PreviewSettings>(() => loadPreviewSettings());
  const [testUrl, setTestUrl] = useState('https://github.com');
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);

  // Resultados de teste individual por provedor
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});

  // Resultado do teste da cascata completa
  const [runningFullTest, setRunningFullTest] = useState(false);
  const [fullTestResult, setFullTestResult] = useState<{
    durationMs: number;
    preview: LinkPreview;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const dt = loadDevToolsSettings();
      setDevTools(dt);
      setSettings(loadPreviewSettings());
      setTestResults({});
      setFullTestResult(null);
    }
  }, [isOpen]);

  function handleToggleDevTool(key: keyof DevToolsSettings) {
    const updated: DevToolsSettings = {
      ...devTools,
      [key]: !devTools[key],
    };
    setDevTools(updated);
    saveDevToolsSettings(updated);
    triggerSaved();

    if (!updated.enableMetadataTest && activeTab === 'preview') {
      setActiveTab('devtools');
    }
    if (!updated.enableNetworkTest && activeTab === 'network') {
      setActiveTab('devtools');
    }
  }

  if (!isOpen) return null;

  function handleToggleProvider(id: string) {
    const updated: PreviewSettings = {
      providers: settings.providers.map((p) =>
        p.id === id ? { ...p, enabled: !p.enabled } : p
      ),
    };
    setSettings(updated);
    savePreviewSettings(updated);
    triggerSaved();
  }

  function handleMove(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= settings.providers.length) return;

    const list = [...settings.providers];
    const item = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = item;

    const updated: PreviewSettings = { providers: list };
    setSettings(updated);
    savePreviewSettings(updated);
    triggerSaved();
  }

  function handleResetDefaults() {
    const defaults = getDefaultPreviewSettings();
    setSettings(defaults);
    savePreviewSettings(defaults);
    setTestResults({});
    setFullTestResult(null);
    triggerSaved();
  }

  function triggerSaved() {
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 1500);
  }

  async function handleTestSingle(provider: PreviewProviderConfig) {
    setTestingId(provider.id);
    const result = await testSingleProvider(provider.id, testUrl.trim(), provider.timeoutMs);
    setTestResults((prev) => ({ ...prev, [provider.id]: result }));
    setTestingId(null);
  }

  async function handleRunFullCascade() {
    setRunningFullTest(true);
    setFullTestResult(null);
    const start = performance.now();
    try {
      const preview = await fetchLinkPreview(testUrl.trim());
      const durationMs = Math.round(performance.now() - start);
      setFullTestResult({ durationMs, preview });
    } catch {
      // Falha
    } finally {
      setRunningFullTest(false);
    }
  }

  function handleCopyLogs() {
    if (!networkTest?.logs || networkTest.logs.length === 0) return;
    const text = networkTest.logs
      .map((l) => {
        const time = new Date(l.timestamp).toISOString();
        return `[${time}] [${l.level.toUpperCase()}] ${l.message}${l.details ? ` - ${l.details}` : ''}`;
      })
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 1500);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="relative flex h-[90vh] max-h-[700px] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0e0e15] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#00e5ff] to-[#ff3e6c]">
              <Settings size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Configurações</h2>
              <p className="text-xs text-white/40">Personalize o funcionamento do Flow</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {savedFeedback && (
              <span className="flex items-center gap-1 rounded-full bg-[#26de81]/20 px-2.5 py-1 text-xs font-medium text-[#26de81] animate-pulse">
                <Check size={12} /> Salvo
              </span>
            )}
            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 bg-[#0a0a0f] p-1.5 shrink-0 gap-1">
          <button
            onClick={() => setActiveTab('devtools')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition ${
              activeTab === 'devtools'
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <Sliders size={14} />
            <span>Dev-Tools</span>
          </button>

          {devTools.enableMetadataTest && (
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition ${
                activeTab === 'preview'
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              <Link2 size={14} />
              <span>metadata</span>
            </button>
          )}

          {devTools.enableNetworkTest && (
            <button
              onClick={() => setActiveTab('network')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium transition ${
                activeTab === 'network'
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              <Activity size={14} className={networkTest?.isAutoPing ? 'text-[#00e5ff] animate-pulse' : ''} />
              <span>Teste de Rede</span>
              {networkTest && networkTest.signalsHeard > 0 && (
                <span className="rounded-full bg-[#00e5ff]/20 px-1.5 py-0.2 text-[10px] font-mono text-[#00e5ff]">
                  {networkTest.signalsHeard}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {activeTab === 'devtools' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-5 space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff3e6c] to-[#00e5ff] text-white">
                    <Sliders size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Sub-menu Dev-Tools</h3>
                    <p className="text-xs text-white/40">
                      Ative ou desative ferramentas de teste e logs. Funcionalidades desativadas ficam ocultas.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {/* 1. Log em cada mensagem */}
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.03]">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                      <Terminal size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">Log em cada mensagem</h4>
                      <p className="text-xs text-white/50 mt-0.5">
                        Exibe o botão de terminal e diagnóstico em cada card de mensagem para inspecionar eventos.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleDevTool('enableMessageLogs')}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      devTools.enableMessageLogs
                        ? 'bg-[#26de81]/20 text-[#26de81]'
                        : 'bg-white/10 text-white/40 hover:text-white'
                    }`}
                  >
                    {devTools.enableMessageLogs ? 'Ativado' : 'Desativado'}
                  </button>
                </div>

                {/* 2. Teste de Provedores de Metadata */}
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.03]">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                      <Link2 size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">Sub-menu de teste de provedores de metadata</h4>
                      <p className="text-xs text-white/50 mt-0.5">
                        Torna visível a aba de testes individuais e cascata de provedores de metadados de links.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleDevTool('enableMetadataTest')}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      devTools.enableMetadataTest
                        ? 'bg-[#26de81]/20 text-[#26de81]'
                        : 'bg-white/10 text-white/40 hover:text-white'
                    }`}
                  >
                    {devTools.enableMetadataTest ? 'Ativado' : 'Desativado'}
                  </button>
                </div>

                {/* 3. Teste de Rede */}
                <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.03]">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                      <Activity size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">Teste de rede</h4>
                      <p className="text-xs text-white/50 mt-0.5">
                        Torna visível a aba de medição de latência RTT, ping-pong de sinais e console de diagnóstico.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleDevTool('enableNetworkTest')}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      devTools.enableNetworkTest
                        ? 'bg-[#26de81]/20 text-[#26de81]'
                        : 'bg-white/10 text-white/40 hover:text-white'
                    }`}
                  >
                    {devTools.enableNetworkTest ? 'Ativado' : 'Desativado'}
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === 'preview' && devTools.enableMetadataTest ? (
            <>
              {/* Descrição e Playground de Teste */}
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">teste de coleta de metadata</h3>
                    <p className="text-xs text-white/40">
                      Teste cada provedor isoladamente ou a cascata completa com qualquer URL.
                    </p>
                  </div>
                  <button
                    onClick={handleResetDefaults}
                    className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg px-2.5 py-1 text-xs text-white/40 hover:bg-white/5 hover:text-white transition"
                    title="Restaurar métodos para os valores originais"
                  >
                    <RotateCcw size={12} />
                    Restaurar Padrão
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <input
                    value={testUrl}
                    onChange={(e) => setTestUrl(e.target.value)}
                    placeholder="https://exemplo.com"
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-mono text-white placeholder-white/20 outline-none focus:border-[#00e5ff]/40"
                  />
                  <button
                    onClick={handleRunFullCascade}
                    disabled={runningFullTest || !testUrl.trim()}
                    className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00e5ff] to-[#ff3e6c] px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50 shrink-0"
                  >
                    {runningFullTest ? <PendulumLoader size={14} color="#ffffff" /> : <Zap size={14} />}
                    {runningFullTest ? 'Testando...' : 'Testar Cascata Completa'}
                  </button>
                </div>

                {/* Resultado do Teste da Cascata Completa */}
                {fullTestResult && (
                  <div className="mt-3 rounded-xl border border-[#26de81]/30 bg-[#26de81]/10 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-[#26de81]">
                        <CheckCircle2 size={14} /> Cascata Concluída com Sucesso
                      </span>
                      <span className="text-xs text-white/50 flex items-center gap-1">
                        <Clock size={12} /> {fullTestResult.durationMs}ms
                      </span>
                    </div>
                    <div className="flex gap-3 rounded-lg bg-black/40 p-2.5">
                      {fullTestResult.preview.image && (
                        <img
                          src={fullTestResult.preview.image}
                          alt=""
                          className="h-14 w-20 rounded object-cover shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white truncate">
                          {fullTestResult.preview.title || 'Sem título'}
                        </p>
                        <p className="text-[11px] text-white/50 line-clamp-2 mt-0.5">
                          {fullTestResult.preview.description || 'Sem descrição'}
                        </p>
                        <span className="text-[10px] text-[#00e5ff] mt-1 block">
                          {fullTestResult.preview.siteName || 'Fonte detectada'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Lista de Provedores Reordenáveis */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">
                    Provedores de Metadados (Ordem de Execução)
                  </h4>
                  <span className="text-[11px] text-white/30">
                    Arraste ou use as setas para definir a prioridade
                  </span>
                </div>

                <div className="space-y-2.5">
                  {settings.providers.map((prov, index) => {
                    const testResult = testResults[prov.id];
                    const isTesting = testingId === prov.id;

                    return (
                      <div
                        key={prov.id}
                        className={`rounded-2xl border transition ${
                          prov.enabled
                            ? 'border-white/10 bg-white/[0.03]'
                            : 'border-white/5 bg-white/[0.01] opacity-60'
                        } p-4 space-y-3`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-white/70">
                              #{index + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white">
                                  {prov.name}
                                </span>
                                {prov.id === 'native' && (
                                  <span className="rounded-full bg-[#00e5ff]/20 px-2 py-0.5 text-[10px] font-semibold text-[#00e5ff]">
                                    Recomendado
                                  </span>
                                )}
                                {prov.id === 'oembed' && (
                                  <span className="rounded-full bg-[#ff3e6c]/20 px-2 py-0.5 text-[10px] font-semibold text-[#ff3e6c]">
                                    Oficial W3C
                                  </span>
                                )}
                                {prov.id === 'google_favicon' && (
                                  <span className="rounded-full bg-[#26de81]/20 px-2 py-0.5 text-[10px] font-semibold text-[#26de81]">
                                    CDN Google
                                  </span>
                                )}
                                {prov.id === 'heuristic' && (
                                  <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                                    100% Offline
                                  </span>
                                )}
                                {prov.id === 'microlink' && (
                                  <span className="rounded-full bg-purple-400/20 px-2 py-0.5 text-[10px] font-semibold text-purple-400">
                                    Nuvem
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-white/50 mt-0.5 max-w-md">
                                {prov.description}
                              </p>
                            </div>
                          </div>

                          {/* Controles: Reordenar e Ativar/Desativar */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              disabled={index === 0}
                              onClick={() => handleMove(index, 'up')}
                              className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20 transition"
                              title="Mover para cima"
                            >
                              <ArrowUp size={15} />
                            </button>
                            <button
                              disabled={index === settings.providers.length - 1}
                              onClick={() => handleMove(index, 'down')}
                              className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20 transition"
                              title="Mover para baixo"
                            >
                              <ArrowDown size={15} />
                            </button>

                            <button
                              onClick={() => handleToggleProvider(prov.id)}
                              className={`ml-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                                prov.enabled
                                  ? 'bg-[#26de81]/20 text-[#26de81]'
                                  : 'bg-white/10 text-white/40 hover:text-white'
                              }`}
                            >
                              {prov.enabled ? 'Ativo' : 'Inativo'}
                            </button>
                          </div>
                        </div>

                        {/* Botão de Teste Individual do Provedor */}
                        <div className="flex items-center justify-between border-t border-white/5 pt-2.5">
                          <button
                            onClick={() => handleTestSingle(prov)}
                            disabled={isTesting || !testUrl.trim()}
                            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                          >
                            {isTesting ? <PendulumLoader size={12} color="#ffffff" /> : <Play size={12} />}
                            {isTesting ? 'Testando...' : `Testar ${prov.name.split(' ')[0]}`}
                          </button>

                          {testResult && (
                            <div className="flex items-center gap-2 text-xs">
                              {testResult.success ? (
                                <span className="flex items-center gap-1 text-[#26de81] font-medium">
                                  <CheckCircle2 size={13} /> Sucesso ({testResult.durationMs}ms)
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-red-400 font-medium">
                                  <XCircle size={13} /> Falhou ({testResult.durationMs}ms)
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Painel com resultado do teste individual */}
                        {testResult && (
                          <div
                            className={`rounded-xl p-3 text-xs ${
                              testResult.success
                                ? 'border border-[#26de81]/20 bg-[#26de81]/5'
                                : 'border border-red-500/20 bg-red-500/5 text-red-300'
                            }`}
                          >
                            {testResult.success && testResult.data ? (
                              <div className="flex gap-3">
                                {testResult.data.image && (
                                  <img
                                    src={testResult.data.image}
                                    alt=""
                                    className="h-12 w-16 rounded object-cover shrink-0"
                                  />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-white truncate">
                                    {testResult.data.title || 'Sem título retornado'}
                                  </p>
                                  <p className="text-white/50 text-[11px] line-clamp-2">
                                    {testResult.data.description || 'Sem descrição'}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <p className="font-mono text-[11px]">
                                Erro: {testResult.error || 'Falha na resposta do provedor'}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : activeTab === 'network' && devTools.enableNetworkTest ? (
            <div className="space-y-5">
              {/* Status da Conexão */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      isElectron || isWsConnected
                        ? 'bg-[#26de81]/15 text-[#26de81]'
                        : 'bg-red-500/15 text-red-400'
                    }`}
                  >
                    <Radio
                      size={20}
                      className={isElectron || isWsConnected ? 'animate-pulse' : ''}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">
                        {isElectron ? 'Servidor Desktop (Host)' : 'Cliente Mobile (Conexão)'}
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isElectron || isWsConnected
                            ? 'bg-[#26de81]/20 text-[#26de81]'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isElectron || isWsConnected
                              ? 'bg-[#26de81] animate-ping'
                              : 'bg-red-500'
                          }`}
                        />
                        {isElectron
                          ? activeClientsCount > 0
                            ? `Servidor Ativo (${activeClientsCount} conectado${activeClientsCount > 1 ? 's' : ''})`
                            : 'Servidor Ativo'
                          : isWsConnected
                          ? 'Conectado ao PC'
                          : 'Desconectado'}
                      </span>
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">
                      {isElectron
                        ? activeClientsCount > 0
                          ? `${activeClientsCount} dispositivo(s) conectado(s) e trocando sinais em tempo real via WebSocket push`
                          : 'Servidor local pronto na rede Wi-Fi. Escaneie o QR Code no celular para conectar'
                        : serverUrl
                        ? `Endereço do Servidor PC: ${serverUrl}`
                        : 'Configure a conexão no menu de sincronização'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    onClick={networkTest?.resetCounters}
                    className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition"
                    title="Zerar contadores e métricas"
                  >
                    <RotateCcw size={13} />
                    Zerar
                  </button>
                </div>
              </div>

              {/* Placar de Sinais e Latência */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Sinais Ouvidos */}
                <div className="relative overflow-hidden rounded-2xl border border-[#00e5ff]/20 bg-gradient-to-br from-[#00e5ff]/10 to-transparent p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white/60">Sinais Ouvidos</span>
                    <Radio size={16} className="text-[#00e5ff]" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-bold font-mono text-white tracking-tight">
                      {networkTest?.signalsHeard ?? 0}
                    </span>
                    <span className="text-[11px] text-[#00e5ff]/80 font-medium">sinais</span>
                  </div>
                  <p className="mt-1 text-[10px] text-white/40">
                    +1 a cada ping ou pong ouvido
                  </p>
                </div>

                {/* Sinais Enviados */}
                <div className="relative overflow-hidden rounded-2xl border border-[#f59e0b]/20 bg-gradient-to-br from-[#f59e0b]/10 to-transparent p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white/60">Sinais Enviados</span>
                    <Send size={16} className="text-[#f59e0b]" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-bold font-mono text-white tracking-tight">
                      {networkTest?.signalsSent ?? 0}
                    </span>
                    <span className="text-[11px] text-[#f59e0b]/80 font-medium">transmitidos</span>
                  </div>
                  <p className="mt-1 text-[10px] text-white/40">
                    Pings e respostas pong
                  </p>
                </div>

                {/* Latência RTT */}
                <div className="relative overflow-hidden rounded-2xl border border-[#26de81]/20 bg-gradient-to-br from-[#26de81]/10 to-transparent p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white/60">Latência (RTT)</span>
                    <Activity size={16} className="text-[#26de81]" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-bold font-mono text-white tracking-tight">
                      {networkTest?.lastRtt !== null ? `${networkTest?.lastRtt}` : '--'}
                    </span>
                    <span className="text-[11px] text-[#26de81]/80 font-medium">ms</span>
                  </div>
                  <p className="mt-1 text-[10px] text-white/40">
                    {networkTest?.avgRtt !== null
                      ? `Média: ${networkTest?.avgRtt}ms (Min: ${networkTest?.minRtt}ms, Max: ${networkTest?.maxRtt}ms)`
                      : 'Aguardando sinais'}
                  </p>
                </div>
              </div>

              {/* Botões de Ação de Teste */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={networkTest?.toggleAutoPing}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-white transition shadow-lg ${
                    networkTest?.isAutoPing
                      ? 'bg-gradient-to-r from-[#ff3e6c] to-pink-600 shadow-pink-500/20 animate-pulse'
                      : 'bg-gradient-to-r from-[#00e5ff] to-[#ff3e6c] shadow-cyan-500/20 hover:opacity-90'
                  }`}
                >
                  {networkTest?.isAutoPing ? (
                    <>
                      <Pause size={14} /> Pausar Ping-Pong Contínuo
                    </>
                  ) : (
                    <>
                      <Play size={14} /> Iniciar Ping-Pong Contínuo
                    </>
                  )}
                </button>

                <button
                  onClick={networkTest?.sendSinglePing}
                  disabled={networkTest?.isAutoPing}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-medium text-white hover:bg-white/10 hover:border-white/20 transition disabled:opacity-40"
                >
                  <Send size={14} className="text-[#00e5ff]" />
                  Enviar Sinal Único (Ping)
                </button>
              </div>

              {/* Console de Diagnóstico e Erros */}
              <div className="rounded-2xl border border-white/10 bg-[#07070a] overflow-hidden shadow-inner">
                <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-white/40" />
                    <span className="text-xs font-medium text-white/80">Console de Diagnóstico & Erros</span>
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-white/50">
                      {networkTest?.logs.length ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyLogs}
                      className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white transition"
                    >
                      <Copy size={12} />
                      {copiedLogs ? 'Copiado!' : 'Copiar'}
                    </button>
                    <button
                      onClick={networkTest?.clearLogs}
                      className="flex items-center gap-1 text-[11px] text-white/40 hover:text-red-400 transition"
                    >
                      <Trash2 size={12} />
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto p-3 space-y-1.5 font-mono text-[11px]">
                  {!networkTest?.logs || networkTest.logs.length === 0 ? (
                    <div className="py-8 text-center text-white/30 text-xs">
                      Aguardando sinais... Clique em "Iniciar Ping-Pong Contínuo" ou "Enviar Sinal Único" para testar a comunicação entre os dispositivos.
                    </div>
                  ) : (
                    networkTest.logs.map((log) => {
                      const timeStr = new Date(log.timestamp).toLocaleTimeString('pt-BR', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        fractionalSecondDigits: 3,
                      } as any);

                      const badgeStyles =
                        {
                          heard: 'bg-[#26de81]/15 text-[#26de81] border border-[#26de81]/30',
                          sent: 'bg-[#00e5ff]/15 text-[#00e5ff] border border-[#00e5ff]/30',
                          ping: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30',
                          pong: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
                          error: 'bg-[#ff3e6c]/20 text-[#ff3e6c] border border-[#ff3e6c]/40',
                          info: 'bg-white/10 text-white/60 border border-white/10',
                        }[log.level] || 'bg-white/10 text-white/60';

                      const badgeLabel =
                        {
                          heard: 'OUVIDO',
                          sent: 'ENVIADO',
                          ping: 'PING',
                          pong: 'PONG',
                          error: 'ERRO',
                          info: 'INFO',
                        }[log.level] || 'LOG';

                      return (
                        <div
                          key={log.id}
                          className="flex items-start gap-2 py-0.5 hover:bg-white/[0.02] rounded px-1"
                        >
                          <span className="text-white/30 text-[10px] shrink-0 pt-0.5">
                            {timeStr}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase shrink-0 ${badgeStyles}`}
                          >
                            {badgeLabel}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span
                              className={
                                log.level === 'error' ? 'text-[#ff3e6c]' : 'text-white/80'
                              }
                            >
                              {log.message}
                            </span>
                            {log.details && (
                              <span className="ml-1.5 text-white/40 text-[10px]">
                                ({log.details})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
