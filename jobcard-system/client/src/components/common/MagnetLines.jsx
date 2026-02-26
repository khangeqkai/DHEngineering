import { useEffect, useRef, useCallback } from 'react';

export default function MagnetLines({
  rows = 9,
  columns = 9,
  containerSize = '100%',
  lineColor = 'rgba(128,105,62,0.3)',
  lineWidth = '2px',
  lineHeight = '24px',
  baseAngle = -10,
  className = '',
  style = {},
}) {
  const containerRef = useRef(null);
  const linesRef = useRef([]);
  const rafRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  const updateLines = useCallback(() => {
    const lines = linesRef.current;
    const { x: mx, y: my } = mouseRef.current;

    for (let i = 0; i < lines.length; i++) {
      const el = lines[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(my - cy, mx - cx) * (180 / Math.PI);
      el.style.transform = `rotate(${angle}deg)`;
    }
  }, []);

  useEffect(() => {
    const handlePointerMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateLines);
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [updateLines]);

  // Set initial rotation
  useEffect(() => {
    linesRef.current.forEach((el) => {
      if (el) el.style.transform = `rotate(${baseAngle}deg)`;
    });
  }, [baseAngle, rows, columns]);

  const total = rows * columns;
  linesRef.current = [];

  return (
    <div
      ref={containerRef}
      className={`magnet-lines ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        width: containerSize,
        height: containerSize,
        placeItems: 'center',
        ...style,
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          ref={(el) => { linesRef.current[i] = el; }}
          style={{
            display: 'block',
            width: lineHeight,
            height: lineWidth,
            backgroundColor: lineColor,
            borderRadius: lineWidth,
            transform: `rotate(${baseAngle}deg)`,
            willChange: 'transform',
            transition: 'transform 0.2s ease-out',
          }}
        />
      ))}
    </div>
  );
}
