import { pct } from "@/lib/client";

// Complaint rate bar with the two settlement thresholds marked.
export function ComplaintMeter({ rate }: { rate: number }) {
  const scale = Math.max(0.005, rate * 1.25);
  const pos = (r: number) => `${Math.min(100, (r / scale) * 100)}%`;
  const color = rate < 0.001 ? "bg-emerald-500" : rate < 0.003 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="relative h-4 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full ${color} transition-all`} style={{ width: pos(rate) }} />
        <div className="absolute inset-y-0 w-px bg-zinc-500" style={{ left: pos(0.001) }} />
        <div className="absolute inset-y-0 w-px bg-zinc-900" style={{ left: pos(0.003) }} />
      </div>
      <div className="relative mt-1 h-8 text-[11px] text-zinc-500">
        <span className="absolute -translate-x-1/2 text-center" style={{ left: pos(0.001) }}>
          0.1%
          <br />
          full refund below
        </span>
        <span className="absolute -translate-x-1/2 text-center" style={{ left: pos(0.003) }}>
          0.3%
          <br />
          full forfeit above
        </span>
      </div>
      <div className="mt-1 text-sm">
        Current complaint rate: <span className="font-semibold tabular-nums">{pct(rate, 3)}</span>
      </div>
    </div>
  );
}
