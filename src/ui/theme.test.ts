import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCurrentTheme, setTheme, toggleTheme } from "./theme.ts";

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

describe("getCurrentTheme", () => {
  it("returns 'dark' when no data-theme attribute is set", () => {
    expect(getCurrentTheme()).toBe("dark");
  });

  it("returns 'light' when data-theme='light'", () => {
    document.documentElement.setAttribute("data-theme", "light");
    expect(getCurrentTheme()).toBe("light");
  });

  it("returns 'dark' for any unrecognised attribute value", () => {
    document.documentElement.setAttribute("data-theme", "auto");
    expect(getCurrentTheme()).toBe("dark");
  });
});

describe("setTheme", () => {
  it("sets data-theme attribute on documentElement", () => {
    setTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("persists the theme to localStorage", () => {
    setTheme("dark");
    expect(localStorage.getItem("archik-theme")).toBe("dark");
  });

  it("reflects the new value immediately via getCurrentTheme", () => {
    setTheme("light");
    expect(getCurrentTheme()).toBe("light");
  });
});

describe("toggleTheme", () => {
  it("switches from dark to light and returns 'light'", () => {
    setTheme("dark");
    expect(toggleTheme()).toBe("light");
    expect(getCurrentTheme()).toBe("light");
  });

  it("switches from light to dark and returns 'dark'", () => {
    setTheme("light");
    expect(toggleTheme()).toBe("dark");
    expect(getCurrentTheme()).toBe("dark");
  });
});
