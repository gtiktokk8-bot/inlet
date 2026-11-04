// NotABAble — the "ABA" sits inside the word. Mark: a note page with a stroke of checkmark through it.
export function Logo({ size = 22, withWord = true, light = false }: { size?: number; withWord?: boolean; light?: boolean }) {
  const ink = light ? "#ffffff" : "#141a1f";
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="NotABAble" fill="none">
        <rect x="3.5" y="2.5" width="17" height="19" rx="3.5" stroke={ink} strokeWidth="2.2" />
        <path d="M7.5 8h9M7.5 12h5" stroke={ink} strokeWidth="2" strokeLinecap="round" />
        <path d="M8 16.5l2.6 2.5L17 13" stroke="#0b7a62" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withWord && (
        <span className="text-[18px] font-bold tracking-[-0.02em]" style={{ color: ink }}>
          Not<span style={{ color: "#0b7a62" }}>ABA</span>ble
        </span>
      )}
    </span>
  );
}
