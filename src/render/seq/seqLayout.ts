import type { SeqDocument, SeqStep } from "../../domain/seq-schema.ts";
import type { NodeKind } from "../../domain/types.ts";

export const PARTICIPANT_HEADER_HEIGHT = 56;
export const PARTICIPANT_MIN_WIDTH = 160;
export const PARTICIPANT_PADDING = 40;
export const MESSAGE_ROW_HEIGHT = 56;
export const GROUP_HEADER_HEIGHT = 24;
export const GROUP_PADDING = 12;
// Vertical breathing room AFTER each group closes. Sized to clear the
// LABEL of a following message — SeqMessage draws the label 6px above
// the arrow and the text glyphs rise ~12px above that baseline, so
// anything less than ~18 makes the label text cross the group's bottom
// border (looked like the arrow overlapping the frame). 20 gives a
// small visual buffer above the label top.
export const POST_GROUP_GAP = 20;
// Per-nesting-level horizontal inset. Nested groups are drawn slightly
// narrower than their parent so the hierarchy reads as "X inside Y"
// rather than two stacked rectangles. Total inset is capped at
// GROUP_PADDING so the frame can never push past the leftmost /
// rightmost lifeline.
export const NEST_INSET = 6;
export const NOTE_HEIGHT = 64;
export const DIAGRAM_H_PADDING = 32;
export const DIAGRAM_V_PADDING = 24;
export const ACTIVATION_W = 8;

export const SEQ_MARKER_FILLED = "seq-arrow-filled";
export const SEQ_MARKER_OPEN = "seq-arrow-open";

export type LayoutedParticipant = {
  id: string;
  nodeId: string;
  label: string;
  cx: number;
  colWidth: number;
  kind?: NodeKind;
  status?: "proposed" | "active" | "deprecated";
  lifelineEndY: number;
};

export type LayoutedMessage = {
  type: "message";
  id: string;
  fromCx: number;
  toCx: number;
  y: number;
  label: string;
  arrow: string;
  activate: boolean;
  status?: string;
  isSelf: boolean;
};

export type LayoutedNote = {
  type: "note";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  status?: string;
};

export type LayoutedGroup = {
  type: "group";
  id: string;
  kind: string;
  condition?: string;
  label?: string;
  seqFile?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  branches: Array<{
    label?: string;
    startY: number;
    dividerY?: number;
    steps: LayoutedStep[];
  }>;
  status?: string;
};

export type LayoutedStep = LayoutedMessage | LayoutedNote | LayoutedGroup;

export type LayoutedActivation = {
  cx: number;
  startY: number;
  endY: number;
};

export type LayoutedSeqDocument = {
  participants: LayoutedParticipant[];
  steps: LayoutedStep[];
  activations: LayoutedActivation[];
  totalWidth: number;
  totalHeight: number;
};

function measureLabel(label: string): number {
  return Math.max(PARTICIPANT_MIN_WIDTH, label.length * 8 + PARTICIPANT_PADDING * 2);
}

function layoutSteps(
  steps: SeqStep[],
  participantMap: Map<string, LayoutedParticipant>,
  startY: number,
  leftX: number,
  rightX: number,
  depth: number = 0,
): {
  items: LayoutedStep[];
  endY: number;
  // Horizontal extents of every laid-out item (notes, group frames).
  // Returned so layoutSeqDocument can grow totalWidth to fit content
  // that extends past the participant range — without this, long
  // `right_of` notes (or wide `over` notes spanning the rightmost
  // lifeline) get clipped by the SVG viewBox.
  contentMinX: number;
  contentMaxX: number;
} {
  let y = startY;
  const items: LayoutedStep[] = [];
  let contentMinX = Number.POSITIVE_INFINITY;
  let contentMaxX = Number.NEGATIVE_INFINITY;

  for (const step of steps) {
    if (step.type === "message") {
      const fromP = participantMap.get(step.from);
      const toP = participantMap.get(step.to);
      const fromCx = fromP?.cx ?? leftX;
      const toCx = toP?.cx ?? leftX;
      items.push({
        type: "message",
        id: step.id,
        fromCx,
        toCx,
        y,
        label: step.label,
        arrow: step.arrow,
        activate: step.activate ?? false,
        isSelf: step.from === step.to,
        ...(step.status !== undefined ? { status: step.status } : {}),
      });
      y += step.from === step.to ? MESSAGE_ROW_HEIGHT * 1.5 : MESSAGE_ROW_HEIGHT;
    } else if (step.type === "note") {
      const pCxs = (step.participants
        .map((pid) => participantMap.get(pid)?.cx)
        .filter((cx): cx is number => cx !== undefined))
        .sort((a, b) => a - b);
      const leftCx = pCxs[0] ?? leftX;
      const rightCx = pCxs[pCxs.length - 1] ?? rightX;
      // Cap note width so long text doesn't blow out the diagram.
      // 400px absolute ceiling; text-based minimum so short notes don't shrink.
      const noteW = Math.min(
        Math.max(step.text.length * 7.5 + 24, (rightCx - leftCx) + 16, 80),
        400,
      );
      let noteX: number;
      if (step.position === "left_of") {
        noteX = leftCx - noteW - 8;
      } else if (step.position === "right_of") {
        noteX = rightCx + 8;
      } else {
        noteX = (leftCx + rightCx) / 2 - noteW / 2;
      }
      // Track extents — they may be negative for `left_of` notes near
      // the leftmost lifeline. Don't clamp here: the outer pass in
      // `layoutSeqDocument` shifts every laid-out item by `leftShift`
      // so all final coords land back in the positive viewBox range.
      // Clamping here would lose the negative magnitude and cause the
      // shift to under-translate.
      contentMinX = Math.min(contentMinX, noteX);
      contentMaxX = Math.max(contentMaxX, noteX + noteW);
      items.push({
        type: "note",
        id: step.id,
        x: noteX,
        y,
        width: noteW,
        height: NOTE_HEIGHT,
        text: step.text,
        ...(step.status !== undefined ? { status: step.status } : {}),
      });
      y += NOTE_HEIGHT + 8;
    } else if (step.type === "group") {
      // Inset nested frames inside their parent so the hierarchy is
      // visually obvious. Inset is capped at GROUP_PADDING so the inner
      // frame's edges never push past the leftmost / rightmost lifeline.
      const inset = Math.min(depth * NEST_INSET, GROUP_PADDING);
      const groupX = leftX - GROUP_PADDING + inset;
      const groupWidth = rightX - leftX + GROUP_PADDING * 2 - inset * 2;
      const groupStartY = y;
      y += GROUP_HEADER_HEIGHT;

      const layoutedBranches: LayoutedGroup["branches"] = [];
      if (step.branches) {
        for (let i = 0; i < step.branches.length; i++) {
          const branch = step.branches[i]!;
          const branchStartY = y;
          const {
            items: branchItems,
            endY,
            contentMinX: branchMinX,
            contentMaxX: branchMaxX,
          } = layoutSteps(branch.steps, participantMap, y, leftX, rightX, depth + 1);
          y = endY;
          contentMinX = Math.min(contentMinX, branchMinX);
          contentMaxX = Math.max(contentMaxX, branchMaxX);
          layoutedBranches.push({
            ...(branch.label !== undefined ? { label: branch.label } : {}),
            startY: branchStartY,
            ...(i < step.branches.length - 1 ? { dividerY: y } : {}),
            steps: branchItems,
          });
          if (i < step.branches.length - 1) y += 4;
        }
      }
      y += GROUP_PADDING;

      items.push({
        type: "group",
        id: step.id,
        kind: step.kind,
        ...(step.condition !== undefined ? { condition: step.condition } : {}),
        ...(step.label !== undefined ? { label: step.label } : {}),
        ...(step.seqFile !== undefined ? { seqFile: step.seqFile } : {}),
        x: groupX,
        y: groupStartY,
        width: groupWidth,
        height: y - groupStartY,
        branches: layoutedBranches,
        ...(step.status !== undefined ? { status: step.status } : {}),
      });
      contentMinX = Math.min(contentMinX, groupX);
      contentMaxX = Math.max(contentMaxX, groupX + groupWidth);
      // Breathing room AFTER the group so the next step (message or
      // another group) doesn't sit on the bottom border. Replaces the
      // old "y += 8 before each group" — applying the gap on the
      // trailing side covers both sequential groups AND groups
      // followed by messages with a single rule.
      y += POST_GROUP_GAP;
    }
  }

  return { items, endY: y, contentMinX, contentMaxX };
}

function collectDestroyY(steps: LayoutedStep[]): Map<number, number> {
  const map = new Map<number, number>(); // cx -> y
  for (const step of steps) {
    if (step.type === "message" && step.arrow === "destroy") {
      // step.y is in layout coords (relative to top of message area);
      // SeqDiagramSvg applies translate(0, PARTICIPANT_HEADER_HEIGHT) to steps,
      // so the SVG y of the × marker = step.y + PARTICIPANT_HEADER_HEIGHT.
      map.set(step.toCx, step.y + PARTICIPANT_HEADER_HEIGHT + 20);
    }
    if (step.type === "group") {
      for (const b of step.branches) {
        for (const [k, v] of collectDestroyY(b.steps)) map.set(k, v);
      }
    }
  }
  return map;
}

function collectActivations(steps: LayoutedStep[]): LayoutedActivation[] {
  const activations: LayoutedActivation[] = [];
  // Stack of open activations per participant cx: cx → stack of startY
  const openStacks = new Map<number, number[]>();

  function walk(steps: LayoutedStep[]): void {
    for (const step of steps) {
      if (step.type === "message") {
        if (step.activate && step.arrow === "sync" && !step.isSelf) {
          const stack = openStacks.get(step.toCx) ?? [];
          stack.push(step.y);
          openStacks.set(step.toCx, stack);
        }
        if (step.arrow === "return" && !step.isSelf) {
          const stack = openStacks.get(step.fromCx);
          if (stack && stack.length > 0) {
            const startY = stack.pop()!;
            activations.push({ cx: step.fromCx, startY, endY: step.y });
            if (stack.length === 0) openStacks.delete(step.fromCx);
          }
        }
      } else if (step.type === "group") {
        for (const branch of step.branches) walk(branch.steps);
      }
    }
  }

  walk(steps);

  // Unclosed activations (sync with no return): render as a short fixed box
  for (const [cx, stack] of openStacks) {
    for (const startY of stack) {
      activations.push({ cx, startY, endY: startY + MESSAGE_ROW_HEIGHT / 2 });
    }
  }

  return activations;
}

export function layoutSeqDocument(
  doc: SeqDocument,
  kinds?: Map<string, NodeKind>,
): LayoutedSeqDocument {
  const colWidths = doc.participants.map((p) =>
    measureLabel(p.label ?? p.nodeId),
  );

  let x = DIAGRAM_H_PADDING;
  const participants: LayoutedParticipant[] = doc.participants.map((p, i) => {
    const colWidth = colWidths[i]!;
    const cx = x + colWidth / 2;
    x += colWidth;
    const kind = kinds?.get(p.nodeId);
    return {
      id: p.id,
      nodeId: p.nodeId,
      label: p.label ?? p.nodeId,
      cx,
      colWidth,
      ...(kind !== undefined ? { kind } : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      lifelineEndY: 0,
    };
  });
  const baseTotalWidth = x + DIAGRAM_H_PADDING;

  const participantMap = new Map(participants.map((p) => [p.id, p]));
  const leftX = participants[0]?.cx ?? DIAGRAM_H_PADDING;
  const rightX = participants[participants.length - 1]?.cx ?? baseTotalWidth - DIAGRAM_H_PADDING;

  // startY is in layout coords: steps are rendered inside translate(0, PARTICIPANT_HEADER_HEIGHT)
  // in SeqDiagramSvg, so layout coords only need to account for the vertical padding.
  const startY = DIAGRAM_V_PADDING;
  const {
    items: rawSteps,
    endY,
    contentMinX,
    contentMaxX,
  } = layoutSteps(doc.steps, participantMap, startY, leftX, rightX);

  // Shift everything right when content (notes / groups) extends past
  // the left edge, and grow the canvas right when it extends past the
  // right edge. Without this, long `right_of` notes are clipped by the
  // SVG viewBox and `left_of` notes near the leftmost lifeline overlap
  // it. We do a single offset pass on the laid-out items rather than
  // re-running the layout — the geometry only needs translation in x.
  const leftShift =
    contentMinX < DIAGRAM_H_PADDING && Number.isFinite(contentMinX)
      ? DIAGRAM_H_PADDING - contentMinX
      : 0;
  const shiftedRightExtent = Number.isFinite(contentMaxX)
    ? contentMaxX + leftShift + DIAGRAM_H_PADDING
    : 0;
  const totalWidth = Math.max(baseTotalWidth + leftShift, shiftedRightExtent);
  const steps = leftShift > 0 ? rawSteps.map((s) => shiftStepX(s, leftShift)) : rawSteps;
  const shiftedParticipants =
    leftShift > 0
      ? participants.map((p) => ({ ...p, cx: p.cx + leftShift }))
      : participants;
  // Rebuild the destroy map against the shifted participants so the
  // lifelineEndY lookup keys still match the new cx values.
  const destroyY = collectDestroyY(steps);
  const participantsWithEnd = shiftedParticipants.map((p) => ({
    ...p,
    lifelineEndY: destroyY.get(p.cx) ?? PARTICIPANT_HEADER_HEIGHT + endY + DIAGRAM_V_PADDING,
  }));
  const totalHeight = PARTICIPANT_HEADER_HEIGHT + endY + DIAGRAM_V_PADDING;
  const activations = collectActivations(steps);

  return { participants: participantsWithEnd, steps, activations, totalWidth, totalHeight };
}

/** Shift every x coord on a laid-out step by `dx`. Used to slide all
 *  content right when notes or groups would otherwise extend past the
 *  left edge of the SVG viewBox. */
function shiftStepX(step: LayoutedStep, dx: number): LayoutedStep {
  if (step.type === "message") {
    return { ...step, fromCx: step.fromCx + dx, toCx: step.toCx + dx };
  }
  if (step.type === "note") {
    return { ...step, x: step.x + dx };
  }
  return {
    ...step,
    x: step.x + dx,
    branches: step.branches.map((b) => ({
      ...b,
      steps: b.steps.map((s) => shiftStepX(s, dx)),
    })),
  };
}
