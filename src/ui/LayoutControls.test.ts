import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clampDensity,
  loadDensity,
  loadShowStereotypeBands,
  loadViewMode,
  saveDensity,
  saveShowStereotypeBands,
  saveViewMode,
} from "./LayoutControls.tsx";

describe("clampDensity", () => {
  it("clamps below minimum to 0.3", () => {
    expect(clampDensity(0)).toBe(0.3);
    expect(clampDensity(0.1)).toBe(0.3);
  });

  it("clamps above maximum to 4", () => {
    expect(clampDensity(5)).toBe(4);
    expect(clampDensity(100)).toBe(4);
  });

  it("passes through values inside the range unchanged", () => {
    expect(clampDensity(1)).toBe(1);
    expect(clampDensity(0.3)).toBe(0.3);
    expect(clampDensity(4)).toBe(4);
    expect(clampDensity(2.5)).toBe(2.5);
  });
});

describe("loadViewMode / saveViewMode", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("returns 'detailed' when nothing is stored", () => {
    expect(loadViewMode()).toBe("detailed");
  });

  it("returns 'compact' after saveViewMode('compact')", () => {
    saveViewMode("compact");
    expect(loadViewMode()).toBe("compact");
  });

  it("returns 'detailed' for any unrecognised stored value", () => {
    localStorage.setItem("archik-view-mode", "unknown");
    expect(loadViewMode()).toBe("detailed");
  });

  it("saveViewMode writes the value to localStorage", () => {
    saveViewMode("detailed");
    expect(localStorage.getItem("archik-view-mode")).toBe("detailed");
  });
});

describe("loadDensity / saveDensity", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("returns 1 (default) when nothing is stored", () => {
    expect(loadDensity()).toBe(1);
  });

  it("returns the stored value after saveDensity", () => {
    saveDensity(2);
    expect(loadDensity()).toBe(2);
  });

  it("clamps out-of-range stored values on load", () => {
    localStorage.setItem("archik-density", "10");
    expect(loadDensity()).toBe(4);
  });

  it("clamps values before saving", () => {
    saveDensity(0.1);
    expect(localStorage.getItem("archik-density")).toBe("0.3");
  });

  it("returns default for a non-numeric stored value", () => {
    localStorage.setItem("archik-density", "not-a-number");
    expect(loadDensity()).toBe(1);
  });
});

describe("loadShowStereotypeBands / saveShowStereotypeBands", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("returns false (default) when nothing is stored", () => {
    expect(loadShowStereotypeBands()).toBe(false);
  });

  it("returns true after saveShowStereotypeBands(true)", () => {
    saveShowStereotypeBands(true);
    expect(loadShowStereotypeBands()).toBe(true);
  });

  it("returns false after saveShowStereotypeBands(false)", () => {
    saveShowStereotypeBands(false);
    expect(loadShowStereotypeBands()).toBe(false);
  });

  it("returns the default for any unrecognised stored value", () => {
    localStorage.setItem("archik-show-stereotype-bands", "yes");
    expect(loadShowStereotypeBands()).toBe(false);
  });
});
