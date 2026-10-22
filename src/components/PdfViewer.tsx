import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  X,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { PendulumLoader } from '@/components/PendulumLoader';
import { isMobileDevice } from '@/lib/pdfHelper';

interface PdfViewerProps {
  url: string;
  fileName?: string;
  onClose: () => void;
}

export function PdfViewer({ url, fileName, onClose }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  // Carrega o documento PDF via Web Worker
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);

    const loadingTask = pdfjsLib.getDocument({
      url,
      cMapPacked: true,
    });

    loadingTask.promise
      .then((doc) => {
        if (isCancelled) {
          doc.destroy();
          return;
        }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('[PdfViewer] Erro ao carregar PDF:', err);
        setError('Não foi possível carregar o arquivo PDF.');
        setLoading(false);
      });

    return () => {
      isCancelled = true;
      if (pdfDocRef.current) {
        try {
          pdfDocRef.current.cleanup();
          pdfDocRef.current.destroy();
        } catch {
          // cleanup
        }
        pdfDocRef.current = null;
      }
    };
  }, [url]);

  // Renderiza a página atual no Canvas
  const renderPage = useCallback(async (pageNumber: number, zoom: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // Ignora cancelamento prévio
      }
    }

    setRendering(true);

    try {
      const page = await pdfDocRef.current.getPage(pageNumber);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const mobile = isMobileDevice();
      const containerWidth = containerRef.current?.clientWidth || (mobile ? 340 : 640);

      // Determina escala base para caber no container com padding
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const availableWidth = Math.max(260, containerWidth - 32);
      const baseFitScale = availableWidth / unscaledViewport.width;

      // No mobile, limita a escala para não estourar a memória RAM do dispositivo
      const maxMobileScale = 1.3;
      const effectiveScale = mobile
        ? Math.min(maxMobileScale, baseFitScale * zoom)
        : Math.min(2.5, baseFitScale * zoom);

      const viewport = page.getViewport({ scale: effectiveScale });
      const context = canvas.getContext('2d', { alpha: false });

      if (!context) {
        setRendering(false);
        return;
      }

      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: context,
        viewport,
      };

      const task = page.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('[PdfViewer] Erro de renderização:', err);
      }
    } finally {
      setRendering(false);
    }
  }, []);

  // Renderiza sempre que a página, o zoom ou o documento mudarem
  useEffect(() => {
    if (pdfDocRef.current && numPages > 0) {
      renderPage(currentPage, zoomLevel);
    }
  }, [currentPage, zoomLevel, numPages, renderPage]);

  function handlePrev() {
    setCurrentPage((p) => Math.max(1, p - 1));
  }

  function handleNext() {
    setCurrentPage((p) => Math.min(numPages, p + 1));
  }

  function handleZoomIn() {
    setZoomLevel((z) => Math.min(2.2, Number((z + 0.2).toFixed(1))));
  }

  function handleZoomOut() {
    setZoomLevel((z) => Math.max(0.6, Number((z - 0.2).toFixed(1))));
  }

  function handleResetZoom() {
    setZoomLevel(1);
  }

  return (
    <div
      ref={containerRef}
      className="mt-3 rounded-2xl border border-white/10 bg-[#09090e] p-3 shadow-2xl flex flex-col space-y-2 animate-in fade-in duration-200"
    >
      {/* Barra de Ferramentas Superior */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-500/10 text-red-400 shrink-0">
            <FileText size={13} />
          </span>
          <span className="text-xs font-semibold text-white/90 truncate max-w-44 sm:max-w-xs">
            {fileName || 'Documento PDF'}
          </span>
        </div>

        {/* Controles de Navegação e Zoom */}
        <div className="flex items-center gap-1.5 shrink-0">
          {numPages > 0 && (
            <>
              <button
                onClick={handlePrev}
                disabled={currentPage <= 1 || loading || rendering}
                className="rounded-lg border border-white/10 bg-white/5 p-1 text-white/70 hover:bg-white/10 hover:text-white transition disabled:opacity-30"
                title="Página anterior"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[11px] font-mono text-white/70 px-1">
                {currentPage} / {numPages}
              </span>
              <button
                onClick={handleNext}
                disabled={currentPage >= numPages || loading || rendering}
                className="rounded-lg border border-white/10 bg-white/5 p-1 text-white/70 hover:bg-white/10 hover:text-white transition disabled:opacity-30"
                title="Próxima página"
              >
                <ChevronRight size={14} />
              </button>

              <div className="h-3 w-[1px] bg-white/10 mx-0.5" />

              <button
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.6 || loading}
                className="rounded-lg border border-white/10 bg-white/5 p-1 text-white/70 hover:bg-white/10 hover:text-white transition disabled:opacity-30"
                title="Reduzir zoom"
              >
                <ZoomOut size={13} />
              </button>
              <button
                onClick={handleResetZoom}
                className="text-[10px] font-mono text-white/60 hover:text-white px-1"
                title="Redefinir zoom para 100%"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                onClick={handleZoomIn}
                disabled={zoomLevel >= 2.2 || loading}
                className="rounded-lg border border-white/10 bg-white/5 p-1 text-white/70 hover:bg-white/10 hover:text-white transition disabled:opacity-30"
                title="Aumentar zoom"
              >
                <ZoomIn size={13} />
              </button>
            </>
          )}

          <button
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 p-1 text-white/50 hover:bg-white/15 hover:text-white transition ml-1"
            title="Fechar visualizador"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Área de Visualização do Canvas */}
      <div className="relative min-h-[160px] max-h-[500px] overflow-auto rounded-xl bg-black/40 p-2 flex items-center justify-center border border-white/5">
        {(loading || rendering) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[2px] gap-2 rounded-xl">
            <PendulumLoader size={18} color="#00e5ff" />
            <span className="text-[11px] font-medium text-white/70">
              {loading ? 'Carregando documento...' : 'Renderizando página...'}
            </span>
          </div>
        )}

        {error ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-red-400 gap-2">
            <p>{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
              }}
              className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1 text-[11px] text-white/70 hover:bg-white/10"
            >
              <RotateCcw size={12} /> Tentar novamente
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="rounded-lg shadow-2xl max-w-full transition-all duration-150"
          />
        )}
      </div>
    </div>
  );
}
