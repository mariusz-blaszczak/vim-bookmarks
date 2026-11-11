import { describe, expect, it } from "vitest";
import { ACTION_DESCRIPTIONS, effectiveEntries, helpSections } from "./help";
import { ACTIONS } from "./actions";
import { DEFAULT_BINDINGS } from "./keymap/defaults";
import type { Binding } from "./keymap/engine";

describe("help", () => {
  it("groups alternative keys per action in binding order", () => {
    const j = effectiveEntries("normal", DEFAULT_BINDINGS).find((e) => e.action === "cursor.down");
    expect(j).toEqual({ keys: ["j", "<Down>"], action: "cursor.down", description: "Move down" });
  });

  it("reflects overrides and nop, and normalizes notation", () => {
    const bindings: Binding[] = [
      { keys: "j", action: "cursor.down" },
      { keys: "<down>", action: "cursor.down" },
      { keys: "j", action: "nop" },
      { keys: "<lt>", action: "cursor.up" },
      { keys: "x", action: "custom.thing" },
    ];
    expect(effectiveEntries("normal", bindings)).toEqual([
      { keys: ["<Down>"], action: "cursor.down", description: "Move down" },
      { keys: ["<"], action: "cursor.up", description: "Move up" },
      { keys: ["x"], action: "custom.thing", description: "custom.thing" },
    ]);
    expect(helpSections(bindings).map((s) => s.title)).toEqual(["Move", "Other"]);
  });

  it("covers every default binding with a section and a description", () => {
    const sections = helpSections(DEFAULT_BINDINGS);
    expect(sections.map((s) => s.title)).toEqual([
      "Move",
      "Folders",
      "Open",
      "Edit",
      "Search",
      "General",
      "In the search prompt",
      "In text prompts",
      "In this help",
    ]);
    for (const b of DEFAULT_BINDINGS) {
      expect(ACTION_DESCRIPTIONS[b.action], b.action).toBeDefined();
      expect(ACTIONS[b.action], b.action).toBeDefined();
    }
  });
});
