import { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Link2,
  ArrowUp,
  ArrowDown,
  Check,
  Play,
  RotateCcw,
  ExternalLink,
  Info,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  Zap,
} from 'lucide-react';
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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'about'>('preview');
  const [settings, setSettings] = useState<PreviewSettings>(() => loadPreviewSettings());
  const [testUrl, setTestUrl] = useState('https://github.com');
  const [savedFeedback, setSavedFeedback] = useState(false);

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
      setSettings(loadPreviewSettings());
      setTestResults({});
      setFullTestResult(null);
    }
  }, [isOpen]);

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
        <div className="flex border-b border-white/5 bg-[#0a0a0f] p-1.5 shrink-0">
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium transition ${
              activeTab === 'preview'
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <Link2 size={14} />
            Geração de Preview
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium transition ${
              activeTab === 'about'
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <Info size={14} />
            Sobre o App
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {activeTab === 'preview' ? (
            <>
              {/* Descrição e Playground de Teste */}
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Playground de Garimpo de Dados</h3>
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
                    <Zap size={14} className={runningFullTest ? 'animate-spin' : ''} />
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
                            <Play size={12} className={isTesting ? 'animate-spin' : ''} />
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
          ) : (
            <div className="space-y-4 text-xs text-white/70">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center space-y-2">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#00e5ff] to-[#ff3e6c]">
                  <Sparkles size={22} className="text-white" />
                </div>
                <h3 className="text-base font-bold text-white">Flow Organizer</h3>
                <p className="text-white/40">Versão 0.2.0 — Conexão entre aparelhos</p>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                <h4 className="font-semibold text-white">Recursos desta versão:</h4>
                <ul className="space-y-1.5 list-disc pl-4 text-white/60">
                  <li>Sincronização bidirecional em duas vias via QR Code (PC ↔ Celular).</li>
                  <li>Reconciliação inteligente com suporte a exclusões offline (tombstones).</li>
                  <li>Aplicativo Desktop nativo com Electron e servidor local na porta 54321.</li>
                  <li>Aplicativo Mobile nativo para Android via Capacitor.</li>
                  <li>Mecanismo de garimpo de metadados configurável com 4 provedores.</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
