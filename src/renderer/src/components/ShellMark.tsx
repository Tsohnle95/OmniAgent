import type { ReactNode } from "react";

export function ShellMark({ size = 46 }: { size?: number }): ReactNode {
  return (
    <svg
      className="shell-mark"
      viewBox="2 16 60 40"
      width={size}
      height={Math.round(size * (40 / 60))}
      focusable="false"
      aria-hidden="true"
    >
      <path
        className="shell-stroke"
        d="M32 51 L7.75 37 A 28 28 0 0 1 20.17 25.62"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="shell-stroke"
        d="M32 51 L56.25 37 A 28 28 0 0 0 43.83 25.62"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="shell-ray"
        d="M32 51 L10.55 33 M32 51 L14.92 28.77"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.5}
      />
      <path
        className="shell-ray"
        d="M32 51 L49.08 28.77 M32 51 L53.45 33"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.5}
      />
      <path
        className="shell-prompt"
        d="M26 25 L32 30.5 L26 36"
        fill="none"
        stroke="var(--shell-prompt, currentColor)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
