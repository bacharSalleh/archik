import { describe, expect, it } from "vitest";
import { COMMAND_HELP } from "./help.ts";

const KNOWN_COMMANDS = [
  "init", "dev", "start", "stop", "status",
  "validate", "render", "watch", "schema",
  "q", "diff", "suggest", "skill", "commands", "drift",
] as const;

describe("COMMAND_HELP", () => {
  it("has an entry for every known command", () => {
    for (const cmd of KNOWN_COMMANDS) {
      expect(COMMAND_HELP).toHaveProperty(cmd);
    }
  });

  it("every entry contains a USAGE section", () => {
    for (const cmd of KNOWN_COMMANDS) {
      expect(COMMAND_HELP[cmd]).toContain("USAGE");
    }
  });

  it("every entry mentions the command name in the first line", () => {
    for (const cmd of KNOWN_COMMANDS) {
      const firstLine = COMMAND_HELP[cmd]!.split("\n")[0] ?? "";
      expect(firstLine).toContain(`archik ${cmd}`);
    }
  });

  it("every entry is a non-empty string", () => {
    for (const cmd of KNOWN_COMMANDS) {
      expect(typeof COMMAND_HELP[cmd]).toBe("string");
      expect((COMMAND_HELP[cmd] as string).length).toBeGreaterThan(0);
    }
  });

  it("returns undefined for unknown commands (not in the map)", () => {
    expect(COMMAND_HELP["nonexistent"]).toBeUndefined();
  });
});
