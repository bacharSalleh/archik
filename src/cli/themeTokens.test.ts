import { describe, expect, it } from "vitest";
import {
  inlineThemeVars,
  injectBackground,
  DARK_THEME_TOKENS,
  LIGHT_THEME_TOKENS,
} from "./themeTokens.ts";

describe("inlineThemeVars", () => {
  it("replaces a known dark-theme token with its hex value", () => {
    const svg = `<circle fill="var(--archik-accent)"/>`;
    const result = inlineThemeVars(svg, "dark");
    expect(result).toContain(DARK_THEME_TOKENS["--archik-accent"]);
    expect(result).not.toContain("var(--archik-accent)");
  });

  it("replaces a known light-theme token with its hex value", () => {
    const svg = `<circle fill="var(--archik-accent)"/>`;
    const result = inlineThemeVars(svg, "light");
    expect(result).toContain(LIGHT_THEME_TOKENS["--archik-accent"]);
    expect(result).not.toContain("var(--archik-accent)");
  });

  it("defaults to dark theme when no theme arg is given", () => {
    const svg = `<rect fill="var(--archik-canvas)"/>`;
    const result = inlineThemeVars(svg);
    expect(result).toContain(DARK_THEME_TOKENS["--archik-canvas"]);
  });

  it("leaves unknown var() references untouched", () => {
    const svg = `<rect fill="var(--archik-nonexistent)"/>`;
    const result = inlineThemeVars(svg, "dark");
    expect(result).toContain("var(--archik-nonexistent)");
  });

  it("replaces multiple tokens in a single pass", () => {
    const svg = `<svg><rect fill="var(--archik-canvas)"/><text fill="var(--archik-fg)"/></svg>`;
    const result = inlineThemeVars(svg, "dark");
    expect(result).toContain(DARK_THEME_TOKENS["--archik-canvas"]);
    expect(result).toContain(DARK_THEME_TOKENS["--archik-fg"]);
    expect(result).not.toContain("var(--archik-");
  });
});

describe("injectBackground", () => {
  const svgWithViewBox = (viewBox = "0 0 800 600"): string =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><g/></svg>`;

  it("injects a <rect> with the canvas colour as the first SVG child", () => {
    const result = injectBackground(svgWithViewBox(), "dark");
    expect(result).toContain(`<rect`);
    expect(result).toContain(`fill="${DARK_THEME_TOKENS["--archik-canvas"]}"`);
  });

  it("uses the light canvas colour for light theme", () => {
    const result = injectBackground(svgWithViewBox(), "light");
    expect(result).toContain(`fill="${LIGHT_THEME_TOKENS["--archik-canvas"]}"`);
  });

  it("uses the viewBox dimensions for the background rect", () => {
    const result = injectBackground(svgWithViewBox("-24 -24 848 648"), "dark");
    expect(result).toContain(`x="-24"`);
    expect(result).toContain(`y="-24"`);
    expect(result).toContain(`width="848"`);
    expect(result).toContain(`height="648"`);
  });

  it("inserts the rect immediately after the opening <svg> tag", () => {
    const svg = svgWithViewBox();
    const result = injectBackground(svg, "dark");
    const svgClose = result.indexOf(">") + 1;
    expect(result.slice(svgClose)).toMatch(/^<rect/);
  });

  it("defaults to dark theme when no theme arg is given", () => {
    const result = injectBackground(svgWithViewBox());
    expect(result).toContain(`fill="${DARK_THEME_TOKENS["--archik-canvas"]}"`);
  });
});
