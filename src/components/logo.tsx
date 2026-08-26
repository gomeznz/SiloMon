// Icon mark: a silo silhouette (same family of shape as silo-gauge.tsx's
// outline) with a small signal-arc motif to read as "monitored", inside a
// rounded gradient badge.
export function SiloMonMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className}>
      <defs>
        <linearGradient id="silomon-mark-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>

      <rect width="32" height="32" rx="8" fill="url(#silomon-mark-grad)" />

      <path
        d="M 8 12 Q 14 8 20 12 L 20 20 L 14 26 L 8 20 Z"
        fill="white"
        fillOpacity="0.95"
      />

      <circle cx="24.5" cy="8.5" r="1.2" fill="white" />
      <path
        d="M 21.8 8.8 A 2.7 2.7 0 0 1 24.5 6"
        stroke="white"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M 19.6 10.8 A 5.4 5.4 0 0 1 24.5 3.5"
        stroke="white"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

export function SiloMonWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      Silo<span className="text-indigo-500 dark:text-indigo-400">Mon</span>
    </span>
  );
}
