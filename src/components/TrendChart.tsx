// Server-renderable SVG line graph with mastery line and phase-change markers.
export function TrendChart({
  points, masteryPct, phaseChanges = [], yMax = 100, unit = "%",
}: {
  points: { date: string; value: number; label?: string }[];
  masteryPct?: number;
  phaseChanges?: { at: string; to: string }[];
  yMax?: number;
  unit?: string;
}) {
  const W = 640, H = 240, padL = 36, padR = 12, padT = 16, padB = 28;
  const iw = W - padL - padR, ih = H - padT - padB;
  if (!points.length) return <div className="text-sm text-muted p-6 text-center">No data yet for this target.</div>;
  const xs = points.map((p) => Date.parse(p.date));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (t: number) => (x1 === x0 ? padL + iw / 2 : padL + ((t - x0) / (x1 - x0)) * iw);
  const Y = (v: number) => padT + ih - (Math.min(v, yMax) / yMax) * ih;
  const path = points.map((p, i) => `${i ? "L" : "M"}${X(Date.parse(p.date)).toFixed(1)},${Y(p.value).toFixed(1)}`).join(" ");
  const fmt = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend over sessions" className="w-full h-auto">
      <line x1={padL} y1={padT} x2={padL} y2={padT + ih} stroke="#cdd2da" />
      <line x1={padL} y1={padT + ih} x2={W - padR} y2={padT + ih} stroke="#cdd2da" />
      {[0, 0.5, 1].map((f) => (
        <text key={f} x={padL - 6} y={Y(f * yMax) + 4} fontSize="11" fill="#5b6472" textAnchor="end">{Math.round(f * yMax)}{unit}</text>
      ))}
      {masteryPct !== undefined && (
        <g>
          <line x1={padL} x2={W - padR} y1={Y(masteryPct)} y2={Y(masteryPct)} stroke="#0f766e" strokeDasharray="4 4" />
          <text x={W - padR} y={Y(masteryPct) - 4} fontSize="11" fill="#0f766e" textAnchor="end" fontWeight="600">Mastery {masteryPct}%</text>
        </g>
      )}
      {phaseChanges.map((pc, i) => {
        const t = Date.parse(pc.at);
        if (t < x0 || t > x1) return null;
        return (
          <g key={i}>
            <line x1={X(t)} x2={X(t)} y1={padT} y2={padT + ih} stroke="#5b6472" strokeDasharray="3 3" />
            <text x={X(t) + 4} y={padT + 10} fontSize="11" fill="#5b6472">{pc.to}</text>
          </g>
        );
      })}
      <path d={path} fill="none" stroke="#15181e" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={X(Date.parse(p.date))} cy={Y(p.value)} r="4" fill="#15181e" stroke="#fff" strokeWidth="2">
          <title>{fmt(Date.parse(p.date))}: {p.value}{unit}{p.label ? ` · ${p.label}` : ""}</title>
        </circle>
      ))}
      <text x={padL} y={H - 8} fontSize="11" fill="#5b6472">{fmt(x0)}</text>
      <text x={W - padR} y={H - 8} fontSize="11" fill="#5b6472" textAnchor="end">{fmt(x1)}</text>
    </svg>
  );
}
