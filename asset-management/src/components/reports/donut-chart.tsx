type Segment = { label: string; count: number; hex: string };

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, start: number, end: number) {
  const startOuter = polarToCartesian(cx, cy, rOuter, end);
  const endOuter = polarToCartesian(cx, cy, rOuter, start);
  const startInner = polarToCartesian(cx, cy, rInner, start);
  const endInner = polarToCartesian(cx, cy, rInner, end);
  const largeArc = end - start > 180 ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 1 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
}

export function DonutChart({
  segments,
  size = 176,
  thickness = 28,
  gap = 2.4,
  centerValue,
  centerLabel,
}: {
  segments: Segment[];
  size?: number;
  thickness?: number;
  gap?: number;
  centerValue: string;
  centerLabel: string;
}) {
  const total = segments.reduce((sum, seg) => sum + seg.count, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2;
  const rInner = rOuter - thickness;

  // Cumulative angle per segment, avoiding a mutated running total inside .map (react-hooks/immutability).
  const sweepEnds = segments.reduce<number[]>((acc, seg, i) => {
    const prevEnd = i === 0 ? 0 : acc[i - 1];
    acc.push(prevEnd + (seg.count / total) * 360);
    return acc;
  }, []);

  const arcs = segments.map((seg, i) => {
    const sweep = (seg.count / total) * 360;
    const end = sweepEnds[i];
    const start = end - sweep;
    return { label: seg.label, hex: seg.hex, count: seg.count, start: start + gap / 2, end: end - gap / 2 };
  });

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-0">
        {arcs.map((seg) => {
          if (seg.count <= 0 || seg.end <= seg.start) return null;
          return (
            <path
              key={seg.label}
              d={arcPath(cx, cy, rOuter, rInner, seg.start, seg.end)}
              fill={seg.hex}
              className="cursor-pointer transition-opacity duration-150 hover:opacity-80"
            >
              <title>{`${seg.label}: ${seg.count} (${Math.round((seg.count / total) * 100)}%)`}</title>
            </path>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-900 dark:text-white">{centerValue}</span>
        <span className="text-[11px] text-slate-400 dark:text-slate-500">{centerLabel}</span>
      </div>
    </div>
  );
}
