import type { SeqDocument, SeqStep } from "../../domain/seq-schema.ts";
import type { NodeKind } from "../../domain/types.ts";

export const PARTICIPANT_HEADER_HEIGHT = 56;
export const PARTICIPANT_MIN_WIDTH = 160;
export const PARTICIPANT_PADDING = 40;
export const MESSAGE_ROW_HEIGHT = 56;
export const GROUP_HEADER_HEIGHT = 24;
export const GROUP_PADDING = 12;
export const NOTE_HEIGHT = 48;
export const DIAGRAM_H_PADDING = 32;
export const DIAGRAM_V_PADDING = 24;

export const SEQ_MARKER_FILLED = "seq-arrow-filled";
export const SEQ_MARKER_OPEN = "seq-arrow-open";

export type LayoutedParticipant = {
  id: string;
  nodeId: string;
  label: string;
  cx: number;
  colWidth: number;
  kind?: NodeKind;
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

export type LayoutedSeqDocument = {
  participants: LayoutedParticipant[];
  steps: LayoutedStep[];
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
): { items: LayoutedStep[]; endY: number } {
  let y = startY;
  const items: LayoutedStep[] = [];

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
      const noteW = Math.max(
        step.text.length * 7.5 + 24,
        (rightCx - leftCx) + 16,
        80,
      );
      const noteX = (leftCx + rightCx) / 2 - noteW / 2;
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
      const groupX = leftX - GROUP_PADDING;
      const groupWidth = rightX - leftX + GROUP_PADDING * 2;
      const groupStartY = y;
      y += GROUP_HEADER_HEIGHT;

      const layoutedBranches: LayoutedGroup["branches"] = [];
      if (step.branches) {
        for (let i = 0; i < step.branches.length; i++) {
          const branch = step.branches[i]!;
          const branchStartY = y;
          const { items: branchItems, endY } = layoutSteps(
            branch.steps,
            participantMap,
            y,
            leftX,
            rightX,
          );
          y = endY;
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
    }
  }

  return { items, endY: y };
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
    return { id: p.id, nodeId: p.nodeId, label: p.label ?? p.nodeId, cx, colWidth, ...(kind !== undefined ? { kind } : {}), lifelineEndY: 0 };
  });
  const totalWidth = x + DIAGRAM_H_PADDING;

  const participantMap = new Map(participants.map((p) => [p.id, p]));
  const leftX = participants[0]?.cx ?? DIAGRAM_H_PADDING;
  const rightX = participants[participants.length - 1]?.cx ?? totalWidth - DIAGRAM_H_PADDING;

  // startY is in layout coords: steps are rendered inside translate(0, PARTICIPANT_HEADER_HEIGHT)
  // in SeqDiagramSvg, so layout coords only need to account for the vertical padding.
  const startY = DIAGRAM_V_PADDING;
  const { items: steps, endY } = layoutSteps(doc.steps, participantMap, startY, leftX, rightX);
  // totalHeight must include PARTICIPANT_HEADER_HEIGHT because the SVG element encompasses
  // both the header row and the message area.
  const totalHeight = PARTICIPANT_HEADER_HEIGHT + endY + DIAGRAM_V_PADDING;

  const destroyY = collectDestroyY(steps);
  const participantsWithEnd = participants.map((p) => ({
    ...p,
    lifelineEndY: destroyY.get(p.cx) ?? totalHeight,
  }));

  return { participants: participantsWithEnd, steps, totalWidth, totalHeight };
}
