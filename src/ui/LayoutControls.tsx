import { Popover } from "./Popover.tsx";

const STORAGE_KEY = "archik-density";
const DEFAULT_DENSITY = 1;

export function loadDensity(): number {
  if (typeof localStorage === "undefined") return DEFAULT_DENSITY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DENSITY;
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_DENSITY;
    return clampDensity(parsed);
  } catch {
    return DEFAULT_DENSITY;
  }
}

export function saveDensity(value: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(clampDensity(value)));
  } catch {
    // ignore
  }
}

export function clampDensity(value: number): number {
  return Math.max(0.5, Math.min(2.5, value));
}

export function densityToLayoutOptions(value: number): {
  nodeSpacing: number;
  layerSpacing: number;
  padding: number;
} {
  const d = clampDensity(value);
  return {
    nodeSpacing: Math.round(24 * d),
    layerSpacing: Math.round(40 * d),
    padding: Math.round(16 * d),
  };
}

type Props = {
  density: number;
  onChange: (value: number) => void;
};

export function LayoutControls({
  density,
  onChange,
}: Props): React.ReactElement {
  const percent = Math.round(density * 100);

  return (
    <Popover
      align="end"
      trigger={(open) => (
        <button
          type="button"
          className="archik-btn"
          aria-expanded={open}
          title="Layout density"
        >
          Spacing
          <span style={{ opacity: 0.6 }}>{percent}%</span>
        </button>
      )}
    >
      {() => (
        <div style={{ minWidth: 240, padding: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span className="archik-label" style={{ margin: 0 }}>
              Node spacing
            </span>
            <span
              className="archik-mono"
              style={{
                fontSize: 11,
                color: "var(--archik-fg-dim)",
              }}
            >
              {percent}%
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={2.5}
            step={0.1}
            value={density}
            onChange={(e) => onChange(Number.parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: "var(--archik-accent)" }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "var(--archik-fg-muted)",
              marginTop: 4,
            }}
          >
            <span>tight</span>
            <span>roomy</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 10,
            }}
          >
            <button
              type="button"
              className="archik-btn"
              onClick={() => onChange(DEFAULT_DENSITY)}
              disabled={density === DEFAULT_DENSITY}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
