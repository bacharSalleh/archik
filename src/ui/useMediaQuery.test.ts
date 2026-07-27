import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useMediaQuery } from "./useMediaQuery.ts";

type Listener = (e: MediaQueryListEvent) => void;

function stubMatchMedia(initial: boolean): {
  listeners: Set<Listener>;
  setMatches: (v: boolean) => void;
} {
  const listeners = new Set<Listener>();
  let current = initial;
  const mql = {
    get matches() {
      return current;
    },
    media: "(max-width: 900px)",
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  };
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn(() => mql),
  });
  return {
    listeners,
    setMatches: (v: boolean) => {
      current = v;
      for (const l of listeners) {
        l({ matches: v } as MediaQueryListEvent);
      }
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
  it("returns the initial match state", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(max-width: 900px)"));
    expect(result.current).toBe(true);
  });

  it("returns false when the query does not match", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(max-width: 900px)"));
    expect(result.current).toBe(false);
  });

  it("updates when the media query changes", () => {
    const stub = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(max-width: 900px)"));
    expect(result.current).toBe(false);
    act(() => stub.setMatches(true));
    expect(result.current).toBe(true);
  });

  it("returns false when matchMedia is unavailable", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useMediaQuery("(max-width: 900px)"));
    expect(result.current).toBe(false);
  });
});
