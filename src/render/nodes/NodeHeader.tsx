/**
 * Shared header strip text. Every shape renders the same compositional
 * header — kind tag (drawn by NodeRenderer), KIND label (this component),
 * info / status icons (drawn by NodeRenderer). Positioning the label is
 * the shape's responsibility because cylinders, capsules and chrome-bars
 * all want it at slightly different y values.
 */

type Props = {
  cx: number;
  cy: number;
  label: string;
};

export function HeaderLabel({ cx, cy, label }: Props): React.ReactElement {
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      fontSize={9.5}
      fontWeight={600}
      letterSpacing="0.12em"
      fill="var(--archik-node-caption)"
    >
      {label.toUpperCase()}
    </text>
  );
}

export const HEADER_HEIGHT = 24;
