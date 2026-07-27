/**
 * SVG arrowhead/marker definitions shared by the canvas (`DiagramSvg`) and
 * the legend, so both render identical glyphs. The structural relationships
 * use UML notation: hollow triangle for generalization (`extends`) and
 * realization (`implements`), filled diamond at the owner end for
 * composition (`has_a`), open arrow for dependencies.
 *
 * Markers use SVG `context-stroke` so the arrow head inherits the line's
 * stroke color — that way per-edge color overrides and structural-vs-flow
 * styles automatically tint the arrow without needing a marker per color.
 *
 * `context-stroke` is supported in modern Chrome / Firefox / Safari.
 */

export const ARROW_MARKER_FILLED = "archik-arrow-filled";
export const ARROW_MARKER_OPEN = "archik-arrow-open";
export const ARROW_MARKER_SELECTED = "archik-arrow-selected";
export const ARROW_MARKER_TRIANGLE = "archik-arrow-triangle";
export const ARROW_MARKER_DIAMOND = "archik-arrow-diamond";

export function FilledTriangleMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="10"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
    </marker>
  );
}

export function OpenTriangleMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 12 12"
      refX="11"
      refY="6"
      markerWidth="7"
      markerHeight="7"
      orient="auto-start-reverse"
    >
      <path
        d="M 1 1 L 11 6 L 1 11"
        fill="none"
        stroke="context-stroke"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </marker>
  );
}

export function SelectedArrowMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="10"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--archik-selected)" />
    </marker>
  );
}

/**
 * UML generalization / realization head — a large unfilled triangle. The
 * fill matches the canvas panel so the edge line doesn't show through the
 * hollow body.
 */
export function HollowTriangleMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 14 14"
      refX="13"
      refY="7"
      markerWidth="9"
      markerHeight="9"
      orient="auto-start-reverse"
    >
      <path
        d="M 1 1 L 13 7 L 1 13 z"
        fill="var(--archik-panel)"
        stroke="context-stroke"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </marker>
  );
}

/**
 * UML composition diamond — sits at the *owner* end of a `has_a` edge
 * (markerStart). Symmetric, so orientation is irrelevant; `refX="1"` puts
 * the diamond's tip on the node boundary with the body extending along the
 * edge.
 */
export function FilledDiamondMarker({ id }: { id: string }): React.ReactElement {
  return (
    <marker
      id={id}
      viewBox="0 0 14 10"
      refX="1"
      refY="5"
      markerWidth="9"
      markerHeight="7"
      orient="auto"
    >
      <path d="M 1 5 L 7 1 L 13 5 L 7 9 z" fill="context-stroke" />
    </marker>
  );
}
