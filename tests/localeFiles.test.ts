import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  getChangedLocaleKeys,
  getMissingLocaleKeys,
  mergeTranslationsIntoLocaleFile,
  updateTranslationSources,
} from "../src/providers/localeFiles";

let projectDir: string;

function writeLocale(locale: string, data: Record<string, string>) {
  fs.writeFileSync(
    path.join(projectDir, "locales", `${locale}.json`),
    JSON.stringify(data),
  );
}

function readLocale(locale: string) {
  return JSON.parse(
    fs.readFileSync(path.join(projectDir, "locales", `${locale}.json`), "utf-8"),
  );
}

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "locale-files-"));
  fs.mkdirSync(path.join(projectDir, "locales"));
});

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

const EN = { greeting: "Hello", farewell: "Goodbye" };

describe("getMissingLocaleKeys", () => {
  it("returns every key when the locale file does not exist", () => {
    expect(getMissingLocaleKeys(projectDir, "es", EN)).toEqual(EN);
  });

  it("returns only keys absent from the locale file", () => {
    writeLocale("es", { greeting: "Hola" });
    expect(getMissingLocaleKeys(projectDir, "es", EN)).toEqual({
      farewell: "Goodbye",
    });
  });

  it("returns null when the locale is up to date", () => {
    writeLocale("es", { greeting: "Hola", farewell: "Adiós" });
    expect(getMissingLocaleKeys(projectDir, "es", EN)).toBeNull();
  });
});

describe("getChangedLocaleKeys", () => {
  it("returns keys whose English changed since translation", () => {
    writeLocale("es", { greeting: "Hola", farewell: "Adiós" });
    const sources = { greeting: "Hi", farewell: "Goodbye" };
    expect(getChangedLocaleKeys(projectDir, "es", EN, sources)).toEqual({
      greeting: "Hello",
    });
  });

  it("treats keys with no recorded source as unchanged", () => {
    writeLocale("es", { greeting: "Hola", farewell: "Adiós" });
    expect(getChangedLocaleKeys(projectDir, "es", EN, {})).toEqual({});
    expect(getChangedLocaleKeys(projectDir, "es", EN, undefined)).toEqual({});
  });

  it("ignores keys not yet in the locale file (those are missing, not changed)", () => {
    writeLocale("es", { greeting: "Hola" });
    const sources = { greeting: "Hello", farewell: "Bye" };
    expect(getChangedLocaleKeys(projectDir, "es", EN, sources)).toEqual({});
  });

  it("returns {} when the locale file does not exist", () => {
    expect(
      getChangedLocaleKeys(projectDir, "es", EN, { greeting: "Hi" }),
    ).toEqual({});
  });
});

describe("updateTranslationSources", () => {
  it("records current English for translated keys", () => {
    writeLocale("es", { greeting: "Hola" });
    const updated = updateTranslationSources(
      projectDir,
      "es",
      EN,
      { greeting: "Hi" },
      ["greeting"],
    );
    expect(updated.greeting).toBe("Hello");
  });

  it("baselines untracked keys already in the locale file", () => {
    writeLocale("es", { greeting: "Hola", farewell: "Adiós" });
    expect(updateTranslationSources(projectDir, "es", EN, undefined, [])).toEqual(
      EN,
    );
  });

  it("keeps the old source for changed keys that were not re-translated", () => {
    writeLocale("es", { greeting: "Hola", farewell: "Adiós" });
    const updated = updateTranslationSources(
      projectDir,
      "es",
      EN,
      { greeting: "Hi", farewell: "Goodbye" },
      [],
    );
    expect(updated.greeting).toBe("Hi");
  });
});

describe("mergeTranslationsIntoLocaleFile", () => {
  it("creates the locale file when missing", () => {
    mergeTranslationsIntoLocaleFile(projectDir, "es", { greeting: "Hola" });
    expect(readLocale("es")).toEqual({ greeting: "Hola" });
  });

  it("keeps existing translations and adds new ones", () => {
    writeLocale("es", { greeting: "Hola" });
    mergeTranslationsIntoLocaleFile(projectDir, "es", { farewell: "Adiós" });
    expect(readLocale("es")).toEqual({ greeting: "Hola", farewell: "Adiós" });
  });
});
