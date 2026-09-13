import { useState, useRef, useCallback, useEffect } from 'react';

export interface NetTestLog {
  id: string;
  timestamp: number;
  level: 'ping' | 'pong' | 'heard' | 'sent' | 'info' | 'error';
  message: string;
  details?: string;
}

export interface NetworkTestState {
  signalsHeard: number;
  signalsSent: number;
  lastRtt: number | null;
  avgRtt: number | null;
  minRtt: number | null;
  maxRtt: number | null;
  isAutoPing: boolean;
  logs: NetTestLog[];
  sendSinglePing: () => void;
  toggleAutoPing: () => void;
  stopAutoPing: () => void;
  resetCounters: () => void;
  clearLogs: () => void;
  addLog: (level: NetTestLog['level'], message: string, details?: string) => void;
  handleIncomingPing: (data: { seq: number; timestamp: number; origin: string }) => void;
  handleIncomingPong: (data: { seq: number; originTimestamp: number; replyTimestamp: number; origin: string }) => void;
}

interface UseNetworkTestOptions {
  isElectron: boolean;
  onSendPing: (data: { seq: number; timestamp: number; origin: string }) => boolean | Promise<boolean>;
  onSendPong: (data: { seq: number; originTimestamp: number; replyTimestamp: number; origin: string }) => boolean | Promise<boolean>;
}

export function useNetworkTest({ isElectron, onSendPing, onSendPong }: UseNetworkTestOptions): NetworkTestState {
  const [signalsHeard, setSignalsHeard] = useState(0);
  const [signalsSent, setSignalsSent] = useState(0);
  const [lastRtt, setLastRtt] = useState<number | null>(null);
  const [avgRtt, setAvgRtt] = useState<number | null>(null);
  const [minRtt, setMinRtt] = useState<number | null>(null);
  const [maxRtt, setMaxRtt] = useState<number | null>(null);
  const [isAutoPing, setIsAutoPing] = useState(false);
  const [logs, setLogs] = useState<NetTestLog[]>([]);

  const seqRef = useRef(0);
  const rttHistoryRef = useRef<number[]>([]);
  const autoPingTimerRef = useRef<any>(null);

  const localOrigin = isElectron ? 'desktop' : 'mobile';

  const addLog = useCallback((level: NetTestLog['level'], message: string, details?: string) => {
    const entry: NetTestLog = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level,
      message,
      details,
    };
    setLogs((prev) => [entry, ...prev].slice(0, 200)); // Mantém os 200 mais recentes
  }, []);

  const sendSinglePing = useCallback(() => {
    seqRef.current += 1;
    const currentSeq = seqRef.current;
    const now = Date.now();

    try {
      const sent = onSendPing({
        seq: currentSeq,
        timestamp: now,
        origin: localOrigin,
      });

      setSignalsSent((prev) => prev + 1);
      addLog('sent', `Ping #${currentSeq} enviado`, `Origem: ${localOrigin} • Aguardando resposta...`);

      if (!sent) {
        addLog('error', `Falha ao enviar Ping #${currentSeq}`, 'Dispositivo não está conectado a nenhuma rota ativa');
      }
    } catch (err: any) {
      addLog('error', `Exceção ao enviar Ping #${currentSeq}`, err.message || String(err));
    }
  }, [localOrigin, onSendPing, addLog]);

  const handleIncomingPing = useCallback(
    (data: { seq: number; timestamp: number; origin: string }) => {
      // 1. Incrementa contador de sinais ouvidos (+1)
      setSignalsHeard((prev) => prev + 1);

      const transitMs = Math.max(0, Date.now() - (data.timestamp || Date.now()));
      addLog('heard', `Sinal de Ping #${data.seq} ouvido de ${data.origin}`, `Tempo de trânsito unidirecional: ${transitMs}ms`);

      // 2. Responde com Pong imediatamente (Ping-Pong bidirecional)
      const now = Date.now();
      try {
        onSendPong({
          seq: data.seq,
          originTimestamp: data.timestamp,
          replyTimestamp: now,
          origin: localOrigin,
        });

        setSignalsSent((prev) => prev + 1);
        addLog('sent', `Pong #${data.seq} respondido para ${data.origin}`, `Respondido em 0ms`);
      } catch (err: any) {
        addLog('error', `Erro ao responder Pong #${data.seq}`, err.message || String(err));
      }
    },
    [localOrigin, onSendPong, addLog]
  );

  const handleIncomingPong = useCallback(
    (data: { seq: number; originTimestamp: number; replyTimestamp: number; origin: string }) => {
      // 1. Incrementa contador de sinais ouvidos (+1)
      setSignalsHeard((prev) => prev + 1);

      const now = Date.now();
      const rtt = Math.max(1, now - (data.originTimestamp || now));

      // Atualiza métricas de latência
      setLastRtt(rtt);
      rttHistoryRef.current.push(rtt);
      if (rttHistoryRef.current.length > 50) rttHistoryRef.current.shift();

      const sum = rttHistoryRef.current.reduce((a, b) => a + b, 0);
      const avg = Math.round(sum / rttHistoryRef.current.length);
      setAvgRtt(avg);

      setMinRtt((prev) => (prev === null ? rtt : Math.min(prev, rtt)));
      setMaxRtt((prev) => (prev === null ? rtt : Math.max(prev, rtt)));

      addLog('heard', `Sinal de Pong #${data.seq} ouvido de ${data.origin}`, `Latência de Ida e Volta (RTT): ${rtt}ms • Média: ${avg}ms`);
    },
    [addLog]
  );

  const stopAutoPing = useCallback(() => {
    if (autoPingTimerRef.current) {
      clearInterval(autoPingTimerRef.current);
      autoPingTimerRef.current = null;
    }
    setIsAutoPing(false);
  }, []);

  const toggleAutoPing = useCallback(() => {
    if (isAutoPing) {
      stopAutoPing();
      addLog('info', 'Ping-Pong contínuo pausado');
    } else {
      setIsAutoPing(true);
      addLog('info', 'Ping-Pong contínuo iniciado (sinais a cada 800ms)');
      sendSinglePing();
      autoPingTimerRef.current = setInterval(() => {
        sendSinglePing();
      }, 800);
    }
  }, [isAutoPing, stopAutoPing, sendSinglePing, addLog]);

  const resetCounters = useCallback(() => {
    setSignalsHeard(0);
    setSignalsSent(0);
    setLastRtt(null);
    setAvgRtt(null);
    setMinRtt(null);
    setMaxRtt(null);
    rttHistoryRef.current = [];
    addLog('info', 'Contadores e estatísticas de rede zerados');
  }, [addLog]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Limpeza de timers ao desmontar
  useEffect(() => {
    return () => {
      if (autoPingTimerRef.current) {
        clearInterval(autoPingTimerRef.current);
      }
    };
  }, []);

  return {
    signalsHeard,
    signalsSent,
    lastRtt,
    avgRtt,
    minRtt,
    maxRtt,
    isAutoPing,
    logs,
    sendSinglePing,
    toggleAutoPing,
    stopAutoPing,
    resetCounters,
    clearLogs,
    addLog,
    handleIncomingPing,
    handleIncomingPong,
  };
}
