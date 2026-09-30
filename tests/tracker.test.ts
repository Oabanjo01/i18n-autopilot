import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  TRANSLATION_SOURCES_FILE,
  loadTranslationSources,
  saveTranslationSources,
} from "../src/tracker";

let projectDir: string;

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-"));
});

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe("translation sources file", () => {
  it("returns {} when the file does not exist", () => {
    expect(loadTranslationSources(projectDir)).toEqual({});
  });

  it("round-trips through a committable file at the project root", () => {
    const sources = { es: { greeting: "Hello" } };
    saveTranslationSources(projectDir, sources);
    expect(fs.existsSync(path.join(projectDir, TRANSLATION_SOURCES_FILE))).toBe(
      true,
    );
    expect(loadTranslationSources(projectDir)).toEqual(sources);
  });

  it("writes locales and keys in sorted order for stable diffs", () => {
    saveTranslationSources(projectDir, {
      "fr-FR": { b: "B", a: "A" },
      es: { z: "Z", m: "M" },
    });
    const raw = fs.readFileSync(
      path.join(projectDir, TRANSLATION_SOURCES_FILE),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    expect(Object.keys(parsed)).toEqual(["es", "fr-FR"]);
    expect(Object.keys(parsed["fr-FR"])).toEqual(["a", "b"]);
  });

  it("does not write in dry-run mode", () => {
    saveTranslationSources(projectDir, { es: { a: "A" } }, true);
    expect(fs.existsSync(path.join(projectDir, TRANSLATION_SOURCES_FILE))).toBe(
      false,
    );
  });
});
