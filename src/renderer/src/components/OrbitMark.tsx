import type { ReactNode } from "react";

const SAGE = "#617a68";
const SAGE_LIGHT = "#9eb4a1";
const SAGE_DEEP = "#46584b";

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
        <ellipse cx="48" cy="48" rx="36" ry="15" transform="rotate(24 48 48)" stroke={SAGE_LIGHT} strokeWidth={4.5} />
        <ellipse cx="48" cy="48" rx="36" ry="15" transform="rotate(-24 48 48)" stroke={SAGE} strokeWidth={5} />
        <circle cx="48" cy="48" r={9} fill={SAGE_DEEP} />
        <circle cx="62.1" cy="28.3" r={6} fill={SAGE_LIGHT} />
      </g>
    </svg>
  );
}
