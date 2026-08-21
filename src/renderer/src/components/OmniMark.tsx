import type { ReactNode } from "react";

export function OmniMark({ size = 46 }: { size?: number }): ReactNode {
  return (
    <svg
      className="omni-mark"
      viewBox="8 12 48 42"
      width={size}
      height={Math.round(size * (42 / 48))}
      focusable="false"
      aria-hidden="true"
    >
      <rect
        x="14"
        y="18"
        width="36"
        height="24"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 48h20"
        fill="none"
        stroke="var(--omni-ground, currentColor)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.65}
      />
      <path
        d="m22 26 5 4-5 4m9 0h8"
        fill="none"
        stroke="var(--omni-prompt, currentColor)"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
