type Props = {
  size?: number;
};

export function Logo({ size = 22 }: Props): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Archik"
      style={{ display: "block" }}
    >
      <path
        d="M 12 5 L 5 18"
        stroke="var(--archik-accent)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M 12 5 L 19 18"
        stroke="var(--archik-accent-bright)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M 5 18 L 19 18"
        stroke="var(--archik-magenta)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeDasharray="2.5 2.5"
      />
      <circle cx="12" cy="5" r="2.6" fill="var(--archik-accent)" />
      <circle
        cx="5"
        cy="18"
        r="2.6"
        fill="var(--archik-accent-bright)"
      />
      <circle cx="19" cy="18" r="2.6" fill="var(--archik-magenta)" />
    </svg>
  );
}
