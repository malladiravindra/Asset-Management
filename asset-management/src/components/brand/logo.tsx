import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/30">
        <Zap className="h-5 w-5 fill-white text-white" strokeWidth={2.5} />
      </span>
      <span
        className={cn(
          "text-xl font-bold tracking-tight",
          dark ? "text-white" : "text-slate-900 dark:text-white"
        )}
      >
        Asset<span className="text-blue-500">Flow</span>
      </span>
    </div>
  );
}
