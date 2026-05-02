import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeToggle } from "./ThemeToggle.tsx";
import * as themeModule from "./theme.ts";

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("shows ☀ icon in dark mode", () => {
    vi.spyOn(themeModule, "getCurrentTheme").mockReturnValue("dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button").textContent).toContain("☀");
  });

  it("shows ☾ icon in light mode", () => {
    vi.spyOn(themeModule, "getCurrentTheme").mockReturnValue("light");
    render(<ThemeToggle />);
    expect(screen.getByRole("button").textContent).toContain("☾");
  });

  it("has aria-label 'Light theme' when in dark mode", () => {
    vi.spyOn(themeModule, "getCurrentTheme").mockReturnValue("dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Light theme",
    );
  });

  it("has aria-label 'Dark theme' when in light mode", () => {
    vi.spyOn(themeModule, "getCurrentTheme").mockReturnValue("light");
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Dark theme",
    );
  });

  it("calls toggleTheme when clicked and updates the icon", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");
    expect(btn.textContent).toContain("☀");
    fireEvent.click(btn);
    // After click: toggleTheme() switches to light → icon becomes ☾
    expect(btn.textContent).toContain("☾");
  });
});
