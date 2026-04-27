import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "../render/Canvas.tsx";
import {
  loadDocumentFromUrlWithText,
  saveDocumentToUrl,
} from "../io/fileAdapter.ts";
import { parseYaml, stringifyYaml } from "../io/yaml.ts";
import {
  subscribeToDocumentChanges,
  subscribeToSuggestionChanges,
} from "../io/liveReload.ts";
import { diffDocuments, mergeForDiff, statusMap } from "../domain/diff.ts";
import type { StatusMap } from "../domain/diff.ts";
import { applyCommand } from "../domain/commands.ts";
import type { Command } from "../domain/commands.ts";
import type { Document, NodeKind } from "../domain/types.ts";
import { slugify, uniqueId } from "../domain/idGen.ts";
import type { Edge } from "../domain/types.ts";
import { useUIStore, type SelectionItem } from "./store.ts";
import { NodeInspector } from "./NodeInspector.tsx";
import { EdgeInspector } from "./EdgeInspector.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { Breadcrumbs } from "./Breadcrumbs.tsx";
import { FileSwitcher, type FileEntry } from "./FileSwitcher.tsx";
import {
  densityToLayoutOptions,
  loadDensity,
  loadViewMode,
  saveDensity,
  saveViewMode,
} from "./LayoutControls.tsx";
import type { ViewMode } from "../layout/types.ts";

const ROOT_DOCUMENT_URL = "/architecture.archik.yaml";
const ROOT_SUGGESTION_URL = "/architecture.archik.suggested.yaml";
const ROOT_ACCEPT_URL = "/__archik/accept-suggestion";
const SAVED_INDICATOR_MS = 1500;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

type State =
  | { status: "loading" }
  | { status: "ready"; document: Document }
  | { status: "error"; error: string };

/**
 * One frame in the navigation stack. The root frame uses the
 * stable canonical URLs above; every drill-down frame is built
 * from a node's `archikFile` and points at the generic per-file
 * endpoint. The breadcrumb bar walks this stack left-to-right.
 */
export type FileFrame = {
  /** Short label shown in the breadcrumb bar. */
  label: string;
  /** GET / PUT this URL to read/write the doc. */
  docUrl: string;
  /** GET / PUT / DELETE this URL for the suggestion sidecar. */
  sidecarUrl: string;
  /** POST this URL to accept the suggestion sidecar. */
  acceptUrl: string;
  /** Original `archikFile` value used to navigate here, or null at root. */
  archikFile: string | null;
};

const ROOT_FRAME: FileFrame = {
  label: "main",
  docUrl: ROOT_DOCUMENT_URL,
  sidecarUrl: ROOT_SUGGESTION_URL,
  acceptUrl: ROOT_ACCEPT_URL,
  archikFile: null,
};

function frameForArchikFile(archikFile: string, label: string): FileFrame {
  const sidecar = archikFile.replace(/\.archik\.yaml$/, ".archik.suggested.yaml");
  const enc = encodeURIComponent(archikFile);
  const encSidecar = encodeURIComponent(sidecar);
  return {
    label,
    docUrl: `/__archik/file?path=${enc}`,
    sidecarUrl: `/__archik/file?path=${encSidecar}`,
    acceptUrl: `/__archik/file-accept?path=${enc}`,
    archikFile,
  };
}

/**
 * URL persistence — `?file=.archik/foo.archik.yaml` so refreshing
 * stays on the same file, and the back/forward buttons walk through
 * file switches. Drill-down breadcrumbs aren't preserved (the URL
 * carries the *deepest* file only); refreshing inside a drill-down
 * lands you at that file as a fresh root frame.
 */
function readFileFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("file");
  return value !== null && value.length > 0 ? value : null;
}

function writeFileToUrl(archikFile: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (archikFile === null || archikFile.length === 0) {
    url.searchParams.delete("file");
  } else {
    url.searchParams.set("file", archikFile);
  }
  // replaceState — keeps the back/forward stack uncluttered; we only
  // push entries for explicit user navigations (switcher, drill-down,
  // breadcrumb pop) below in the syncing effect.
  window.history.replaceState(null, "", url.toString());
}

function initialFileStack(): FileFrame[] {
  const file = readFileFromUrl();
  if (file === null) return [ROOT_FRAME];
  const base = file.split("/").pop() ?? file;
  const label = base.replace(/\.archik\.yaml$/i, "") || "main";
  return [frameForArchikFile(file, label)];
}

export function App(): React.ReactElement {
  const [state, setState] = useState<State>({ status: "loading" });
  // Navigation stack — the last element is the file currently loaded
  // in the canvas. Pushed by drill-down (a node's `archikFile`),
  // popped by breadcrumb / back. Root is always present at index 0.
  const [fileStack, setFileStack] = useState<FileFrame[]>(initialFileStack);
  const currentFile = fileStack[fileStack.length - 1]!;
  // All archik files in the project. Refetched on doc / suggestion
  // change so the file-switcher dropdown reflects new files appearing
  // and the suggestion-pending dots stay current.
  const [availableFiles, setAvailableFiles] = useState<ReadonlyArray<FileEntry>>(
    [],
  );
  const suggestionsByPath = useMemo(
    () => new Set(availableFiles.filter((f) => f.hasSuggestion).map((f) => f.path)),
    [availableFiles],
  );
  const rootFile = useMemo(
    () => availableFiles.find((f) => f.isRoot) ?? null,
    [availableFiles],
  );
  // What FileEntry.path corresponds to the file currently loaded.
  // ROOT_FRAME (archikFile=null) maps to the canonical root path
  // looked up from the file list; every other frame's archikFile
  // already IS the FileEntry.path. Distinguishing on the discriminator
  // matters: a single-frame stack of a peer file is NOT the root,
  // so we mustn't fall back to rootFile here (would highlight the
  // wrong row in the file switcher).
  const currentFilePath: string | null =
    currentFile.archikFile === null
      ? rootFile?.path ?? null
      : currentFile.archikFile;
  const [commandError, setCommandError] = useState<string | undefined>(
    undefined,
  );
  const [reloadError, setReloadError] = useState<string | undefined>(
    undefined,
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isDirty, setIsDirty] = useState(false);
  // Pending Claude-authored suggestion sidecar. Banner shows when
  // present; user picks Review (opens server-rendered diff in a new
  // tab), Accept (POST → main becomes sidecar), or Reject (DELETE).
  const [suggestion, setSuggestion] = useState<
    | { status: "none" }
    | {
        status: "pending";
        added: number;
        removed: number;
        changed: number;
        note?: string | undefined;
        // Cache the parsed sidecar so Review can render instantly
        // without re-parsing or hitting the network.
        doc: Document;
      }
    | { status: "error"; message: string }
  >({ status: "none" });
  const [reviewMode, setReviewMode] = useState<boolean>(false);
  // Undo / redo stacks. Each successful command snapshots the previous
  // document to `past` and clears `future`. Externally-driven loads
  // (file watcher, fresh fetch) reset both — undo can't span across.
  const [past, setPast] = useState<Document[]>([]);
  const [future, setFuture] = useState<Document[]>([]);
  const HISTORY_LIMIT = 100;
  const [density, setDensityState] = useState<number>(() => loadDensity());
  const setDensity = (v: number): void => {
    setDensityState(v);
    saveDensity(v);
  };
  const [viewMode, setViewModeState] = useState<ViewMode>(() => loadViewMode());
  const setViewMode = (v: ViewMode): void => {
    setViewModeState(v);
    saveViewMode(v);
  };
  const layoutOptions = useMemo(
    () => ({ ...densityToLayoutOptions(density), viewMode }),
    [density, viewMode],
  );
  const loadedOnceRef = useRef(false);
  const lastTextRef = useRef<string | null>(null);
  // Live <svg> handle for SVG / PNG export. Canvas writes into this
  // ref when the diagram mounts; ExportMenu reads it via getSvg.
  const canvasSvgRef = useRef<SVGSVGElement | null>(null);
  const getSvg = useCallback(() => canvasSvgRef.current, []);
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const selection = useUIStore((s) => s.selection);
  const connectFrom = useUIStore((s) => s.connectFrom);
  const selectNode = useUIStore((s) => s.selectNode);
  const selectEdge = useUIStore((s) => s.selectEdge);
  const toggleNode = useUIStore((s) => s.toggleNode);
  const toggleEdge = useUIStore((s) => s.toggleEdge);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const startConnect = useUIStore((s) => s.startConnect);
  const cancelConnect = useUIStore((s) => s.cancelConnect);

  const focused: SelectionItem | null =
    selection.length > 0 ? (selection.at(-1) ?? null) : null;
  const selectedNodeIds = useMemo(
    () =>
      new Set(
        selection.filter((s) => s.type === "node").map((s) => s.id),
      ),
    [selection],
  );
  const selectedEdgeIds = useMemo(
    () =>
      new Set(
        selection.filter((s) => s.type === "edge").map((s) => s.id),
      ),
    [selection],
  );

  // Mirror the deepest file in the URL so refresh / back / forward
  // restore the user's place. Drops the param when we're at the
  // canonical root frame (clean URL).
  useEffect(() => {
    const top = fileStack[fileStack.length - 1]!;
    writeFileToUrl(top.archikFile);
  }, [fileStack]);

  // Browser back / forward navigation rebuilds the stack from the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = (): void => setFileStack(initialFileStack());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Each frame gets a fresh self-write-echo guard — the previous
    // file's last text isn't relevant for this one. Also reset the
    // "have we ever loaded *this* frame" flag so a 404 on a sub-file
    // shows up in the canvas (error screen) instead of stranding
    // the user on a "Loading…" splash.
    lastTextRef.current = "";
    loadedOnceRef.current = false;
    const load = (): void => {
      loadDocumentFromUrlWithText(currentFile.docUrl).then(
        ({ document, text }) => {
          if (cancelled) return;
          if (text === lastTextRef.current) return; // self-write echo
          lastTextRef.current = text;
          loadedOnceRef.current = true;
          setState({ status: "ready", document });
          setIsDirty(false);
          if (typeof window !== "undefined" && document.name) {
            window.document.title = `${document.name} — Archik`;
          }
          setReloadError(undefined);
          setPast([]);
          setFuture([]);
          // External file change may have removed nodes / edges that
          // were currently selected or being connected from. Drop any
          // stale UI state to keep the inspector and connect overlay
          // consistent with the freshly-loaded document.
          const validNodeIds = new Set(document.nodes.map((n) => n.id));
          const validEdgeIds = new Set(document.edges.map((e) => e.id));
          useUIStore.setState((s) => ({
            selection: s.selection.filter((sel) =>
              sel.type === "node"
                ? validNodeIds.has(sel.id)
                : validEdgeIds.has(sel.id),
            ),
            connectFrom:
              s.connectFrom !== null && validNodeIds.has(s.connectFrom)
                ? s.connectFrom
                : null,
          }));
        },
        (err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : String(err);
          if (loadedOnceRef.current) {
            setReloadError(message);
          } else {
            setState({ status: "error", error: message });
          }
        },
      );
    };
    setState({ status: "loading" });
    load();
    const unsubscribe = subscribeToDocumentChanges(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // Re-run on navigation: each frame loads its own document.
  }, [currentFile.docUrl]);

  useEffect(() => {
    return () => {
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
      }
    };
  }, []);

  // File-list fetch. Drives the file-switcher dropdown plus the
  // pending-suggestion dots in the breadcrumb. Refetches on every
  // doc-change AND suggestion-change SSE event so new files show up
  // and pending-suggestion flags stay current.
  useEffect(() => {
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      try {
        const res = await fetch("/__archik/files", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) return;
        const body: { files?: FileEntry[] } = await res.json();
        if (cancelled) return;
        if (Array.isArray(body.files)) setAvailableFiles(body.files);
      } catch {
        // Endpoint may be missing in older servers — silently skip.
      }
    };
    void refresh();
    const offDoc = subscribeToDocumentChanges(() => void refresh());
    const offSuggestion = subscribeToSuggestionChanges(() => void refresh());
    return () => {
      cancelled = true;
      offDoc();
      offSuggestion();
    };
  }, []);

  // Pending-suggestion poll. Runs whenever the main doc reloads (so
  // the diff stats refresh against the latest truth) and on every
  // `archik:suggestion-changed` event from the dev server.
  useEffect(() => {
    if (state.status !== "ready") return;
    const currentDoc = state.document;
    let cancelled = false;
    const loadSuggestion = async (): Promise<void> => {
      // Short-circuit when the file list (which the dev server
      // already enumerates with hasSuggestion flags) says there
      // is no sidecar for the current file. Saves a network round
      // trip AND avoids browsers logging a 404 on every navigation.
      // Falls through to the GET when the file list is empty (not
      // loaded yet) or doesn't include the current file.
      if (
        currentFilePath !== null &&
        availableFiles.length > 0 &&
        availableFiles.some((f) => f.path === currentFilePath) &&
        !suggestionsByPath.has(currentFilePath)
      ) {
        setSuggestion({ status: "none" });
        return;
      }
      try {
        const res = await fetch(currentFile.sidecarUrl, { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 404) {
          setSuggestion({ status: "none" });
          return;
        }
        if (!res.ok) {
          setSuggestion({
            status: "error",
            message: `Sidecar fetch failed: HTTP ${res.status}`,
          });
          return;
        }
        const text = await res.text();
        let sidecarDoc: Document;
        try {
          sidecarDoc = parseYaml(text);
        } catch (err) {
          setSuggestion({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        const diff = diffDocuments(currentDoc, sidecarDoc);
        setSuggestion({
          status: "pending",
          added: diff.nodes.added.length + diff.edges.added.length,
          removed: diff.nodes.removed.length + diff.edges.removed.length,
          changed: diff.nodes.changed.length + diff.edges.changed.length,
          doc: sidecarDoc,
          ...(sidecarDoc.metadata?.suggestion?.note !== undefined
            ? { note: sidecarDoc.metadata.suggestion.note }
            : {}),
        });
      } catch (err) {
        if (cancelled) return;
        setSuggestion({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    };
    void loadSuggestion();
    const unsubscribe = subscribeToSuggestionChanges(loadSuggestion);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [
    state,
    currentFile.sidecarUrl,
    currentFilePath,
    availableFiles,
    suggestionsByPath,
  ]);

  const acceptSuggestion = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(currentFile.acceptUrl, { method: "POST" });
      if (!res.ok) {
        const body = await res.text();
        setSuggestion({
          status: "error",
          message: `Accept failed: ${body || `HTTP ${res.status}`}`,
        });
        return;
      }
      setSuggestion({ status: "none" });
      setReviewMode(false);
      // The watcher will fire archik:doc-changed and the main load
      // effect will repaint with the new YAML.
    } catch (err) {
      setSuggestion({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [currentFile.acceptUrl]);

  const rejectSuggestion = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(currentFile.sidecarUrl, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        const body = await res.text();
        setSuggestion({
          status: "error",
          message: `Reject failed: ${body || `HTTP ${res.status}`}`,
        });
        return;
      }
      setSuggestion({ status: "none" });
      setReviewMode(false);
    } catch (err) {
      setSuggestion({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [currentFile.sidecarUrl]);

  const toggleReview = useCallback((): void => {
    setReviewMode((m) => !m);
  }, []);

  const save = useCallback(async () => {
    let docToSave: Document | null = null;
    setState((current) => {
      if (current.status === "ready") docToSave = current.document;
      return current;
    });
    if (!docToSave) return;
    // Stash the text BEFORE the PUT so a watcher event triggered by
    // our own write (which can race the response) is recognised as
    // self-write echo and not re-applied to in-memory state.
    const text = stringifyYaml(docToSave);
    lastTextRef.current = text;
    setSaveStatus("saving");
    try {
      await saveDocumentToUrl(currentFile.docUrl, docToSave);
      setSaveStatus("saved");
      // Only clear the dirty flag if the in-memory document still matches
      // what we just persisted. The user may have kept editing during the
      // PUT, in which case there are unsaved changes ahead of the file.
      let stillSame = false;
      setState((current) => {
        if (
          current.status === "ready" &&
          current.document === docToSave
        ) {
          stillSame = true;
        }
        return current;
      });
      if (stillSame) setIsDirty(false);
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
      }
      savedIndicatorTimerRef.current = setTimeout(
        () => setSaveStatus("idle"),
        SAVED_INDICATOR_MS,
      );
    } catch {
      setSaveStatus("error");
    }
  }, [currentFile.docUrl]);

  // Three navigation actions, distinct semantics:
  //
  //   1. openSubFile(file)  — DRILL INTO a child architecture (the
  //      "↓ open" badge on a node carrying `archikFile`). PUSHES
  //      onto the stack. Round-trips rewind via findIndex below
  //      so `tools → main → tools → main` stays linear instead of
  //      growing unboundedly.
  //
  //   2. navigateToFile(file) — LATERAL move to a peer file (a
  //      cross-file edge badge, ↗). RESETS the stack to a single
  //      frame for that file. Cross-file edges aren't drill-downs;
  //      treating them as such piled the breadcrumb up with old
  //      files the user wasn't actually navigating *into*.
  //
  //   3. switchToFile(file) — file-switcher dropdown click. Same
  //      as navigateToFile but plumbed via a different call site.
  //
  // The canonical root file (rootFile.path) needs a special case
  // throughout: ROOT_FRAME carries archikFile=null and uses the
  // stable /architecture.archik.yaml URL, so any time the *target*
  // matches the canonical root we collapse to ROOT_FRAME instead
  // of a peer frame for the same on-disk file.
  const rootFilePath = rootFile?.path ?? null;

  const frameFor = useCallback(
    (archikFile: string, label: string): FileFrame => {
      return rootFilePath === archikFile
        ? ROOT_FRAME
        : frameForArchikFile(archikFile, label);
    },
    [rootFilePath],
  );

  const matchesFile = useCallback(
    (frame: FileFrame, archikFile: string): boolean => {
      if (frame.archikFile === archikFile) return true;
      return frame.archikFile === null && rootFilePath === archikFile;
    },
    [rootFilePath],
  );

  const openSubFile = useCallback(
    (archikFile: string, label: string): void => {
      setFileStack((s) => {
        const existing = s.findIndex((f) => matchesFile(f, archikFile));
        if (existing >= 0) {
          return existing === s.length - 1 ? s : s.slice(0, existing + 1);
        }
        return [...s, frameFor(archikFile, label)];
      });
    },
    [frameFor, matchesFile],
  );

  const navigateToFile = useCallback(
    (archikFile: string, label: string): void => {
      setFileStack((s) => {
        // No-op when already on the target — avoids a needless
        // remount + URL replaceState round-trip.
        const top = s[s.length - 1]!;
        if (matchesFile(top, archikFile)) return s;
        return [frameFor(archikFile, label)];
      });
    },
    [frameFor, matchesFile],
  );

  // Pop the navigation stack to a specific depth (0 = root only).
  // Clicking "main" in the breadcrumbs is goToFrame(0).
  const goToFrame = useCallback((index: number): void => {
    setFileStack((s) => {
      if (index < 0 || index >= s.length - 1) return s;
      return s.slice(0, index + 1);
    });
  }, []);

  // File-switcher dropdown: same lateral semantics as a cross-file
  // edge — pick the file you want as the new root, breadcrumb starts
  // fresh from there.
  const switchToFile = useCallback(
    (file: FileEntry): void => {
      if (file.isRoot) {
        setFileStack([ROOT_FRAME]);
      } else {
        navigateToFile(file.path, file.name);
      }
    },
    [navigateToFile],
  );

  const handleSelectNode = useCallback(
    (id: string, event?: React.MouseEvent) => {
      if (connectFrom === null) {
        if (event && (event.metaKey || event.ctrlKey || event.shiftKey)) {
          toggleNode(id);
        } else {
          selectNode(id);
        }
        return;
      }
      if (id === connectFrom) {
        cancelConnect();
        return;
      }
      let createdEdgeId: string | null = null;
      setState((current) => {
        if (current.status !== "ready") return current;
        const fromNode = current.document.nodes.find(
          (n) => n.id === connectFrom,
        );
        if (!fromNode) return current;
        const taken = new Set(current.document.edges.map((e) => e.id));
        const edgeId = uniqueId(
          slugify(`${connectFrom}-${id}`),
          taken,
          "edge",
        );
        const edge: Edge = {
          id: edgeId,
          from: connectFrom,
          to: id,
          relationship: "http_call",
        };
        try {
          const next = applyCommand(current.document, {
            type: "connect",
            edge,
          });
          setCommandError(undefined);
          setIsDirty(true);
          setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), current.document]);
          setFuture([]);
          createdEdgeId = edgeId;
          return { status: "ready", document: next };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setCommandError(message);
          return current;
        }
      });
      cancelConnect();
      if (createdEdgeId) selectEdge(createdEdgeId);
    },
    [connectFrom, cancelConnect, selectNode, toggleNode, selectEdge],
  );

  const handleSelectEdge = useCallback(
    (id: string, event?: React.MouseEvent) => {
      if (event && (event.metaKey || event.ctrlKey || event.shiftKey)) {
        toggleEdge(id);
      } else {
        selectEdge(id);
      }
    },
    [selectEdge, toggleEdge],
  );

  const handleConnectDrag = useCallback(
    (fromId: string, toId: string) => {
      let createdEdgeId: string | null = null;
      setState((current) => {
        if (current.status !== "ready") return current;
        const fromNode = current.document.nodes.find((n) => n.id === fromId);
        const toNode = current.document.nodes.find((n) => n.id === toId);
        if (!fromNode || !toNode) return current;
        const taken = new Set(current.document.edges.map((e) => e.id));
        const edgeId = uniqueId(slugify(`${fromId}-${toId}`), taken, "edge");
        const edge: Edge = {
          id: edgeId,
          from: fromId,
          to: toId,
          relationship: "http_call",
        };
        try {
          const next = applyCommand(current.document, {
            type: "connect",
            edge,
          });
          setCommandError(undefined);
          setIsDirty(true);
          setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), current.document]);
          setFuture([]);
          createdEdgeId = edgeId;
          return { status: "ready", document: next };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setCommandError(message);
          return current;
        }
      });
      if (createdEdgeId) selectEdge(createdEdgeId);
    },
    [selectEdge],
  );

  const addNode = useCallback(
    (kind: NodeKind, name: string) => {
      setState((current) => {
        if (current.status !== "ready") return current;
        const taken = new Set(current.document.nodes.map((n) => n.id));
        const id = uniqueId(slugify(name), taken, kind);
        try {
          const next = applyCommand(current.document, {
            type: "add_node",
            node: { id, kind, name },
          });
          setCommandError(undefined);
          setIsDirty(true);
          setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), current.document]);
          setFuture([]);
          return { status: "ready", document: next };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setCommandError(message);
          return current;
        }
      });
    },
    [],
  );

  const dispatch = useCallback(
    (cmd: Command) => {
      setState((current) => {
        if (current.status !== "ready") return current;
        try {
          const next = applyCommand(current.document, cmd);
          setCommandError(undefined);
          setIsDirty(true);
          setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), current.document]);
          setFuture([]);
          return { status: "ready", document: next };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setCommandError(message);
          return current;
        }
      });
    },
    [],
  );

  const deleteSelected = useCallback(() => {
    if (selection.length === 0) return;
    // Remove edges first so node-removal doesn't trip over orphan-cascade
    // attempting to drop the same edge twice. Snapshot once for undo.
    setState((current) => {
      if (current.status !== "ready") return current;
      let doc = current.document;
      try {
        const edgeIds = selection
          .filter((s) => s.type === "edge")
          .map((s) => s.id);
        for (const id of edgeIds) {
          if (doc.edges.some((e) => e.id === id)) {
            doc = applyCommand(doc, { type: "disconnect", id });
          }
        }
        const nodeIds = selection
          .filter((s) => s.type === "node")
          .map((s) => s.id);
        for (const id of nodeIds) {
          if (doc.nodes.some((n) => n.id === id)) {
            doc = applyCommand(doc, { type: "remove_node", id });
          }
        }
        if (doc === current.document) return current;
        setCommandError(undefined);
        setIsDirty(true);
        setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), current.document]);
        setFuture([]);
        return { status: "ready", document: doc };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setCommandError(message);
        return current;
      }
    });
    clearSelection();
  }, [selection, clearSelection]);

  const undo = useCallback(() => {
    if (state.status !== "ready" || past.length === 0) return;
    const prev = past[past.length - 1]!;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [...f, state.document]);
    setState({ status: "ready", document: prev });
    setIsDirty(true);
    setCommandError(undefined);
    clearSelection();
  }, [state, past, clearSelection]);

  const redo = useCallback(() => {
    if (state.status !== "ready" || future.length === 0) return;
    const next = future[future.length - 1]!;
    setFuture((f) => f.slice(0, -1));
    setPast((p) => [...p, state.document]);
    setState({ status: "ready", document: next });
    setIsDirty(true);
    setCommandError(undefined);
    clearSelection();
  }, [state, future, clearSelection]);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty) void save();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === "Escape") {
        if (connectFrom) cancelConnect();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const target = e.target;
        const isEditing =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable);
        if (isEditing) return;
        if (selection.length === 0) return;
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    isDirty,
    save,
    connectFrom,
    cancelConnect,
    selection,
    deleteSelected,
    undo,
    redo,
  ]);

  if (state.status === "loading") {
    return <Splash>Loading {currentFile.docUrl}…</Splash>;
  }
  if (state.status === "error") {
    return (
      <Splash>
        <pre className="max-w-3xl whitespace-pre-wrap text-xs text-rose-700">
          {state.error}
        </pre>
      </Splash>
    );
  }

  const doc = state.document;
  // Review mode swaps the rendered document for the merged (current ∪
  // suggestion) view and computes per-id status flags so the canvas
  // can frame added / changed / removed items in the right colour.
  const reviewing =
    reviewMode &&
    suggestion.status === "pending";
  const reviewMerged =
    reviewing && suggestion.status === "pending"
      ? mergeForDiff(doc, suggestion.doc)
      : null;
  const reviewStatuses: StatusMap | null =
    reviewing && suggestion.status === "pending"
      ? statusMap(diffDocuments(doc, suggestion.doc))
      : null;
  const renderDoc = reviewMerged ?? doc;
  // Look up the focused entity in renderDoc (not doc) so that nodes /
  // edges that only exist in the suggestion sidecar still resolve when
  // reviewing — otherwise the inspector shows the empty state for any
  // newly-added entity and the user can't see its description / fields.
  const selectedNode =
    focused?.type === "node"
      ? renderDoc.nodes.find((n) => n.id === focused.id)
      : undefined;
  const selectedEdge =
    focused?.type === "edge"
      ? renderDoc.edges.find((e) => e.id === focused.id)
      : undefined;
  const connectFromNode =
    connectFrom !== null
      ? doc.nodes.find((n) => n.id === connectFrom)
      : undefined;
  const isMultiSelection = selection.length > 1;

  return (
    <div
      className="flex h-full flex-col"
      style={{
        background: "var(--archik-canvas)",
        color: "var(--archik-fg)",
      }}
    >
      <Toolbar
        document={doc}
        commandError={commandError}
        saveStatus={saveStatus}
        isDirty={isDirty}
        onSave={() => void save()}
        onAddNode={addNode}
        density={density}
        onDensityChange={setDensity}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        getSvg={getSvg}
        {...(reloadError !== undefined ? { reloadError } : {})}
        {...(connectFromNode !== undefined
          ? {
              connectingFromName: connectFromNode.name,
              onCancelConnect: cancelConnect,
            }
          : {})}
      />
      {suggestion.status === "pending" && (
        <SuggestionBanner
          added={suggestion.added}
          removed={suggestion.removed}
          changed={suggestion.changed}
          note={suggestion.note}
          reviewing={reviewing}
          onReview={toggleReview}
          onAccept={() => void acceptSuggestion()}
          onReject={() => void rejectSuggestion()}
        />
      )}
      {suggestion.status === "error" && (
        <div
          role="alert"
          style={{
            background: "rgba(217, 119, 6, 0.12)",
            borderBottom: "1px solid rgba(217, 119, 6, 0.45)",
            color: "var(--archik-warning)",
            padding: "8px 16px",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontWeight: 700 }}>SUGGESTION ERROR —</span>
          <span style={{ flex: 1, color: "var(--archik-fg)" }}>
            {suggestion.message}
          </span>
          <button
            type="button"
            onClick={() => setSuggestion({ status: "none" })}
            aria-label="Dismiss"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--archik-fg-dim)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
      {reloadError !== undefined && (
        <div
          role="alert"
          style={{
            background: "rgba(225, 29, 72, 0.12)",
            borderBottom: "1px solid rgba(225, 29, 72, 0.45)",
            color: "var(--archik-danger)",
            padding: "10px 16px",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>
            FILE INVALID —
          </span>
          <pre
            style={{
              margin: 0,
              flex: 1,
              whiteSpace: "pre-wrap",
              fontFamily: "inherit",
              color: "var(--archik-fg)",
            }}
          >
            {reloadError}
          </pre>
          <button
            type="button"
            onClick={() => setReloadError(undefined)}
            aria-label="Dismiss error"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--archik-fg-dim)",
              cursor: "pointer",
              padding: "0 4px",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
      <main
        className="flex min-h-0 flex-1 p-4"
        style={{ gap: 0 }}
      >
        <div
          className="archik-panel"
          style={{ flex: 1, minWidth: 0, overflow: "hidden" }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              width: "100%",
            }}
          >
            {(availableFiles.length > 1 || fileStack.length > 1) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  background: "var(--archik-surface)",
                  borderBottom: "1px solid var(--archik-border)",
                }}
              >
                <FileSwitcher
                  files={availableFiles}
                  currentPath={currentFilePath}
                  onSwitchFile={switchToFile}
                />
                <Breadcrumbs
                  stack={fileStack}
                  onGoToFrame={goToFrame}
                  suggestionsByPath={suggestionsByPath}
                />
              </div>
            )}
            <Canvas
              document={renderDoc}
              className="flex-1 archik-grid"
              layoutOptions={layoutOptions}
              viewMode={viewMode}
              selectedNodeIds={selectedNodeIds}
              selectedEdgeIds={selectedEdgeIds}
              onSelectNode={handleSelectNode}
              onSelectEdge={handleSelectEdge}
              onSelectNothing={
                connectFrom === null ? clearSelection : cancelConnect
              }
              onConnectDrag={handleConnectDrag}
              onOpenSubFile={openSubFile}
              onCrossFileNavigate={navigateToFile}
              viewKey={currentFile.docUrl}
              svgRef={canvasSvgRef}
              {...(reviewStatuses ? { diffStatuses: reviewStatuses } : {})}
            />
          </div>
        </div>
        <aside
          aria-hidden={selection.length === 0}
          className={`archik-drawer-shell ${
            selection.length > 0
              ? "archik-drawer-shell--open"
              : "archik-drawer-shell--closed"
          }`}
        >
          <div
            key={
              isMultiSelection
                ? `multi:${selection.length}`
                : focused
                  ? `${focused.type}:${focused.id}`
                  : "empty"
            }
            className="archik-panel archik-drawer-content archik-drawer-fade"
            style={{ overflow: "hidden" }}
          >
            {isMultiSelection ? (
              <BulkInspector
                count={selection.length}
                onDelete={deleteSelected}
                onClear={clearSelection}
              />
            ) : focused?.type === "edge" ? (
              <EdgeInspector
                edge={selectedEdge}
                dispatch={dispatch}
                readOnly={reviewing}
              />
            ) : focused?.type === "node" ? (
              <NodeInspector
                node={selectedNode}
                dispatch={dispatch}
                onStartConnect={startConnect}
                allNodes={renderDoc.nodes}
                readOnly={reviewing}
              />
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  );
}

function BulkInspector({
  count,
  onDelete,
  onClear,
}: {
  count: number;
  onDelete: () => void;
  onClear: () => void;
}): React.ReactElement {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
      <div>
        <div className="archik-label">Selection</div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: "var(--archik-fg)",
            letterSpacing: "0.01em",
          }}
        >
          {count} items
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--archik-fg-dim)",
            marginTop: 4,
          }}
        >
          Hold ⌘ / Ctrl while clicking to add or remove items.
        </div>
      </div>
      <div className="archik-divider" />
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <button
          type="button"
          onClick={onClear}
          className="archik-btn"
          style={{ justifyContent: "center", padding: "8px 12px" }}
        >
          Clear selection
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="archik-btn archik-btn-danger"
          style={{ justifyContent: "center", padding: "8px 12px" }}
        >
          Delete {count} items
        </button>
      </div>
    </div>
  );
}

function Splash({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      className="flex h-full items-center justify-center p-6 text-sm"
      style={{
        background: "var(--archik-canvas)",
        color: "var(--archik-fg-dim)",
      }}
    >
      {children}
    </div>
  );
}

function SuggestionBanner({
  added,
  removed,
  changed,
  note,
  reviewing,
  onReview,
  onAccept,
  onReject,
}: {
  added: number;
  removed: number;
  changed: number;
  note?: string | undefined;
  reviewing: boolean;
  onReview: () => void;
  onAccept: () => void;
  onReject: () => void;
}): React.ReactElement {
  const total = added + removed + changed;
  return (
    <div
      role="region"
      aria-label="Pending suggestion"
      style={{
        background: "rgba(168, 85, 247, 0.12)",
        borderBottom: "1px solid rgba(168, 85, 247, 0.45)",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <span
        style={{
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: "#c4b5fd",
        }}
      >
        📝 SUGGESTION PENDING
      </span>
      <span style={{ color: "var(--archik-fg)" }}>
        {total === 0 ? (
          "(identical to current — nothing to apply)"
        ) : (
          <>
            <span style={{ color: "var(--archik-success)" }}>
              +{added}
            </span>{" "}
            <span style={{ color: "var(--archik-danger)" }}>
              −{removed}
            </span>{" "}
            <span style={{ color: "var(--archik-warning)" }}>
              ~{changed}
            </span>
          </>
        )}
        {note ? (
          <span
            style={{
              marginLeft: 10,
              color: "var(--archik-fg-dim)",
              fontStyle: "italic",
            }}
          >
            "{note}"
          </span>
        ) : null}
      </span>
      <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onReview}
          className="archik-btn"
          style={{
            padding: "5px 12px",
            fontSize: 12,
            ...(reviewing
              ? {
                  background: "#a855f7",
                  color: "white",
                  borderColor: "#a855f7",
                }
              : {}),
          }}
        >
          {reviewing ? "Hide diff" : "Review"}
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="archik-btn"
          title={
            total === 0
              ? "Suggestion already matches the current file — Accept just clears the sidecar."
              : "Apply the suggestion to the main file."
          }
          style={{
            padding: "5px 12px",
            fontSize: 12,
            background: "var(--archik-success)",
            color: "white",
            borderColor: "var(--archik-success)",
          }}
        >
          Accept
        </button>
        <button
          type="button"
          onClick={onReject}
          className="archik-btn"
          style={{
            padding: "5px 12px",
            fontSize: 12,
            color: "var(--archik-danger)",
            borderColor: "var(--archik-danger)",
          }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
