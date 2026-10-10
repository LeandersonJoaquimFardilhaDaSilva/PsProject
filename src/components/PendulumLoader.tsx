interface PendulumLoaderProps {
  size?: number | string;
  color?: string;
  className?: string;
}

/**
 * Animação de loading do Grid 3x3 (9 quadrados) no estilo Pêndulo
 * Copiado e adaptado de assets/loading.html para escala dinâmica.
 */
export function PendulumLoader({
  size = 18,
  color = '#ffffff',
  className = '',
}: PendulumLoaderProps) {
  const pixelSize = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={`inline-grid grid-cols-3 grid-rows-3 shrink-0 select-none ${className}`}
      style={{
        width: pixelSize,
        height: pixelSize,
        gap: '12%',
        padding: '2%',
        boxSizing: 'border-box',
      }}
      aria-label="Carregando"
      role="status"
    >
      {/* Linha 1 */}
      <div
        className="pendulum-col-left w-full h-full rounded-[22%]"
        style={{
          backgroundColor: color,
          transformOrigin: '50% -110%',
          willChange: 'transform',
        }}
      />
      <div
        className="pendulum-col-mid w-full h-full rounded-[22%]"
        style={{
          backgroundColor: color,
        }}
      />
      <div
        className="pendulum-col-right w-full h-full rounded-[22%]"
        style={{
          backgroundColor: color,
          transformOrigin: '50% -110%',
          willChange: 'transform',
        }}
      />

      {/* Linha 2 */}
      <div
        className="pendulum-col-left w-full h-full rounded-[22%]"
        style={{
          backgroundColor: color,
          transformOrigin: '50% -110%',
          willChange: 'transform',
        }}
      />
      <div
        className="pendulum-col-mid w-full h-full rounded-[22%]"
        style={{
          backgroundColor: color,
        }}
      />
      <div
        className="pendulum-col-right w-full h-full rounded-[22%]"
        style={{
          backgroundColor: color,
          transformOrigin: '50% -110%',
          willChange: 'transform',
        }}
      />

      {/* Linha 3 */}
      <div
        className="pendulum-col-left w-full h-full rounded-[22%]"
        style={{
          backgroundColor: color,
          transformOrigin: '50% -110%',
          willChange: 'transform',
        }}
      />
      <div
        className="pendulum-col-mid w-full h-full rounded-[22%]"
        style={{
          backgroundColor: color,
        }}
      />
      <div
        className="pendulum-col-right w-full h-full rounded-[22%]"
        style={{
          backgroundColor: color,
          transformOrigin: '50% -110%',
          willChange: 'transform',
        }}
      />
    </div>
  );
}

/**
 * Ícone estático dos 9 quadrados do loading para exibição ao lado dos canais
 * Colorido individualmente conforme a cor do canal.
 */
export function ChannelSquaresIcon({
  color,
  size = 14,
  className = '',
}: {
  color: string;
  size?: number | string;
  className?: string;
}) {
  const pixelSize = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={`inline-grid grid-cols-3 grid-rows-3 shrink-0 select-none ${className}`}
      style={{
        width: pixelSize,
        height: pixelSize,
        gap: '12%',
        boxSizing: 'border-box',
      }}
      aria-hidden="true"
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="w-full h-full rounded-[22%]"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
