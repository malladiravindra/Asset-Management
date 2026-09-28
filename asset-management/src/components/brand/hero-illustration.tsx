import { Cloud, HardDrive, Laptop, Server, ShieldCheck, Smartphone } from "lucide-react";

const NODES = [
  { icon: Cloud, top: "8%", left: "62%", delay: "0s" },
  { icon: Server, top: "38%", left: "20%", delay: "0.6s" },
  { icon: Laptop, top: "66%", left: "8%", delay: "1.2s" },
  { icon: Smartphone, top: "78%", left: "58%", delay: "0.3s" },
  { icon: ShieldCheck, top: "20%", left: "82%", delay: "0.9s" },
  { icon: HardDrive, top: "52%", left: "78%", delay: "1.5s" },
];

const LINES = [
  "M 66 12 L 26 42",
  "M 26 42 L 14 70",
  "M 26 42 L 62 82",
  "M 66 12 L 84 24",
  "M 84 24 L 80 55",
  "M 62 82 L 80 55",
];

export function HeroIllustration() {
  return (
    <div className="relative h-full w-full">
      <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/20 blur-3xl" />

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {LINES.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="rgba(96,165,250,0.35)"
            strokeWidth="0.3"
            strokeDasharray="2 2"
            style={{ animation: "dash-flow 3s linear infinite" }}
          />
        ))}
      </svg>

      {NODES.map(({ icon: Icon, top, left, delay }, i) => (
        <div
          key={i}
          className="absolute flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-black/20 backdrop-blur-sm"
          style={{ top, left, animation: `float-slow 6s ease-in-out infinite`, animationDelay: delay }}
        >
          <Icon className="h-6 w-6 text-blue-300" strokeWidth={1.75} />
        </div>
      ))}
    </div>
  );
}
