import { describe, it, expect } from "vitest";
import { generateKeys } from "../src/keyGenerator";
import type { ExtractedString } from "../src/parser";

function strings(...values: string[]): ExtractedString[] {
  return values.map((value) => ({ value }) as ExtractedString);
}

describe("generateKeys", () => {
  it("builds keys from the first three meaningful words", () => {
    const [item] = generateKeys(strings("Welcome back to the app"));
    expect(item.key).toBe("welcome_back_app");
  });

  it("gives identical strings in one run the same key", () => {
    const keys = generateKeys(strings("Save", "Save", "Save")).map((k) => k.key);
    expect(keys).toEqual(["save", "save", "save"]);
  });

  it("suffixes different strings that collide within one run", () => {
    const keys = generateKeys(
      strings("Save draft now?", "Save draft now!", "Save draft now?"),
    ).map((k) => k.key);
    expect(keys).toEqual(["save_draft_now", "save_draft_now_2", "save_draft_now"]);
  });

  it("reuses an existing key that already holds the same English", () => {
    const [item] = generateKeys(strings("Save"), { save: "Save" });
    expect(item.key).toBe("save");
  });

  it("does not reuse an existing key that holds different English", () => {
    const [item] = generateKeys(
      strings("Welcome back to the app, friend"),
      { welcome_back_app: "Welcome back to the app" },
    );
    expect(item.key).toBe("welcome_back_app_2");
  });

  it("skips every taken suffix when finding a free key", () => {
    const [item] = generateKeys(strings("Save draft now"), {
      save_draft_now: "Save draft now?",
      save_draft_now_2: "Save draft now!",
    });
    expect(item.key).toBe("save_draft_now_3");
  });

  it("keeps a user's edited English and gives the new string its own key", () => {
    const [item] = generateKeys(strings("Save"), { save: "Save now" });
    expect(item.key).toBe("save_2");
  });
});
