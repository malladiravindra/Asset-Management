type Point = { label: string; year: number; value: number };

export function TrendChart({ data }: { data: Point[] }) {
  const w = 640;
  const h = 200;
  const padX = 16;
  const padY = 18;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? (w - padX * 2) / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: h - padY - (d.value / max) * (h - padY * 2),
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${h - padY} L ${points[0].x} ${h - padY} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-56 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={padX}
          x2={w - padX}
          y1={padY + f * (h - padY * 2)}
          y2={padY + f * (h - padY * 2)}
          className="stroke-slate-100 dark:stroke-slate-800"
          strokeWidth={1}
        />
      ))}

      <path d={areaPath} fill="url(#trendFill)" />
      <path
        d={linePath}
        fill="none"
        className="stroke-blue-500 dark:stroke-blue-400"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r={3.5}
            className="fill-white stroke-blue-500 dark:fill-slate-900 dark:stroke-blue-400"
            strokeWidth={2}
          >
            <title>{`${p.label} ${p.year}: ${p.value} acquired`}</title>
          </circle>
          {i % 2 === 0 && (
            <text
              x={p.x}
              y={h - 2}
              textAnchor="middle"
              className="fill-slate-400 text-[10px] dark:fill-slate-500"
            >
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
