import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  CoverageError,
  checkCoverage,
  formatCoverageReport,
} from "../src/coverage";
import { saveTranslationSources } from "../src/tracker";

let projectDir: string;

function writeLocale(locale: string, data: Record<string, string>) {
  fs.writeFileSync(
    path.join(projectDir, "locales", `${locale}.json`),
    JSON.stringify(data),
  );
}

const EN = { greeting: "Hello", farewell: "Goodbye", thanks: "Thanks" };

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-"));
  fs.mkdirSync(path.join(projectDir, "locales"));
  writeLocale("en", EN);
});

afterEach(() => {
  fs.rmSync(projectDir, { recursive: true, force: true });
});

describe("checkCoverage", () => {
  it("is ok when every locale is complete and current", () => {
    writeLocale("es", { greeting: "Hola", farewell: "Adiós", thanks: "Gracias" });
    saveTranslationSources(projectDir, { es: EN });
    const report = checkCoverage(projectDir);
    expect(report.ok).toBe(true);
    expect(report.sourceKeys).toBe(3);
    expect(report.locales).toEqual([
      {
        locale: "es",
        translated: 3,
        missing: [],
        stale: [],
        outdated: [],
        sourcesTracked: true,
      },
    ]);
  });

  it("reports missing keys", () => {
    writeLocale("es", { greeting: "Hola" });
    const [es] = checkCoverage(projectDir).locales;
    expect(es.missing).toEqual(["farewell", "thanks"]);
    expect(es.translated).toBe(1);
  });

  it("reports stale keys no longer in en.json", () => {
    writeLocale("es", { greeting: "Hola", farewell: "Adiós", thanks: "Gracias", old_key: "Viejo" });
    const report = checkCoverage(projectDir);
    expect(report.locales[0].stale).toEqual(["old_key"]);
    expect(report.ok).toBe(false);
  });

  it("reports translations made from outdated English", () => {
    writeLocale("es", { greeting: "Hola", farewell: "Adiós", thanks: "Gracias" });
    saveTranslationSources(projectDir, { es: { ...EN, greeting: "Hi" } });
    const report = checkCoverage(projectDir);
    expect(report.locales[0].outdated).toEqual(["greeting"]);
    expect(report.ok).toBe(false);
  });

  it("notes when no translation sources are recorded", () => {
    writeLocale("es", { greeting: "Hola", farewell: "Adiós", thanks: "Gracias" });
    const report = checkCoverage(projectDir);
    expect(report.ok).toBe(true);
    expect(report.locales[0].sourcesTracked).toBe(false);
    expect(formatCoverageReport(report)).toContain(
      "no translation sources recorded for es",
    );
  });

  it("discovers every locale file except en.json and dotfiles, sorted", () => {
    writeLocale("fr-FR", {});
    writeLocale("es", {});
    fs.writeFileSync(path.join(projectDir, "locales", ".DS_Store.json"), "{}");
    const report = checkCoverage(projectDir);
    expect(report.locales.map((r) => r.locale)).toEqual(["es", "fr-FR"]);
  });

  it("checks only the requested locales, treating a missing file as untranslated", () => {
    writeLocale("es", { greeting: "Hola", farewell: "Adiós", thanks: "Gracias" });
    const report = checkCoverage(projectDir, ["de-DE"]);
    expect(report.locales).toHaveLength(1);
    expect(report.locales[0]).toMatchObject({ locale: "de-DE", translated: 0 });
    expect(report.locales[0].missing).toHaveLength(3);
  });

  it("throws a CoverageError when en.json doesn't exist", () => {
    fs.rmSync(path.join(projectDir, "locales", "en.json"));
    expect(() => checkCoverage(projectDir)).toThrow(CoverageError);
  });

  it("throws a CoverageError for unparseable JSON", () => {
    fs.writeFileSync(path.join(projectDir, "locales", "es.json"), "{ not json");
    expect(() => checkCoverage(projectDir)).toThrow(/Could not parse .*es\.json/);
  });
});

describe("formatCoverageReport", () => {
  it("summarises each locale and lists the problem keys", () => {
    writeLocale("es", { greeting: "Hola", farewell: "Adiós", thanks: "Gracias" });
    writeLocale("fr-FR", { greeting: "Bonjour", gone: "Parti" });
    saveTranslationSources(projectDir, { es: EN, "fr-FR": { greeting: "Hi" } });
    const text = formatCoverageReport(checkCoverage(projectDir));

    expect(text).toContain("Source strings (en): 3 keys");
    expect(text).toMatch(/es\s+3\/3\s+✅\s+100%/);
    expect(text).toMatch(/fr-FR\s+1\/3\s+❌\s+33%\s+— 2 missing, 1 outdated, 1 stale/);
    expect(text).toContain("Missing in fr-FR:\n    - farewell\n    - thanks");
    expect(text).toContain("    - greeting");
    expect(text).toContain("Stale in fr-FR (no longer in en.json):\n    - gone");
    expect(text).toContain("Run i18n-autopilot to translate missing and outdated keys.");
    expect(text).toContain("Stale keys are safe to delete from the locale files.");
  });

  it("caps long key lists", () => {
    const manyKeys = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`k${i}`, `v${i}`]),
    );
    writeLocale("en", manyKeys);
    writeLocale("es", {});
    const text = formatCoverageReport(checkCoverage(projectDir));
    expect(text).toContain("…and 5 more");
  });

  it("says so when everything is up to date", () => {
    writeLocale("es", { greeting: "Hola", farewell: "Adiós", thanks: "Gracias" });
    saveTranslationSources(projectDir, { es: EN });
    expect(formatCoverageReport(checkCoverage(projectDir))).toContain(
      "All locales are up to date.",
    );
  });
});
