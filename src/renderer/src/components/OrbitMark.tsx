import type { ReactNode } from "react";

export function OrbitMark({ size = 46 }: { size?: number }): ReactNode {
  return (
    <svg
      className="orbit-mark"
      viewBox="0 0 96 96"
      width={size}
      height={size}
      focusable="false"
      aria-hidden="true"
    >
      <g fill="none" strokeLinecap="round">
        <ellipse cx="48" cy="48" rx="36" ry="15" transform="rotate(24 48 48)" stroke="color-mix(in srgb, var(--accent) 55%, var(--bg-panel))" strokeWidth={4.5} />
        <ellipse cx="48" cy="48" rx="36" ry="15" transform="rotate(-24 48 48)" stroke="var(--accent)" strokeWidth={5} />
        <circle cx="48" cy="48" r={9} fill="color-mix(in srgb, var(--accent) 72%, var(--text))" />
        <circle cx="62.1" cy="28.3" r={6} fill="var(--accent)" opacity="0.75" />
      </g>
    </svg>
  );
}
