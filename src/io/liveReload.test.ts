import { describe, it, expect, vi } from "vitest";
import {
  emitDocumentChanged,
  subscribeToDocumentChanges,
} from "./liveReload.ts";

describe("liveReload", () => {
  it("calls a subscriber when emitDocumentChanged fires", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToDocumentChanges(listener);
    emitDocumentChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("calls every subscriber on each emit", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeToDocumentChanges(a);
    const unsubB = subscribeToDocumentChanges(b);
    emitDocumentChanged();
    emitDocumentChanged();
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
    unsubA();
    unsubB();
  });

  it("stops calling after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToDocumentChanges(listener);
    emitDocumentChanged();
    unsubscribe();
    emitDocumentChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("is safe to emit with no subscribers", () => {
    expect(() => emitDocumentChanged()).not.toThrow();
  });
});
