/**
 * Persist file hashes so repeated runs only process new or changed files.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { ScannedFile } from "./scanner";

interface ProcessedFile {
  filePath: string;
  contentHash: string;
  lastProcessed: string;
  keysExtracted: string[];
}

/** locale → key → the English text that locale's translation was made from. */
export type TranslationSources = Record<string, Record<string, string>>;

interface TrackingData {
  files: Record<string, ProcessedFile>;
  version: string;
}

function getTrackingPath(projectPath: string): string {
  return path.join(projectPath, ".i18n-autopilot.json");
}

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function loadTrackingData(projectPath: string): TrackingData {
  const trackingPath = getTrackingPath(projectPath);
  
  if (!fs.existsSync(trackingPath)) {
    return { files: {}, version: "1.0.1" };
  }
  
  try {
    const content = fs.readFileSync(trackingPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.warn("Warning: Could not parse tracking data, starting fresh");
    return { files: {}, version: "1.0.1" };
  }
}

export function saveTrackingData(
  projectPath: string,
  data: TrackingData,
  dryRun: boolean = false
): void {
  if (dryRun) return;
  
  const trackingPath = getTrackingPath(projectPath);
  fs.writeFileSync(trackingPath, JSON.stringify(data, null, 2));
}

// Kept apart from the tracking file (which holds machine-specific absolute
// paths) so teams can commit it alongside locales/.
export const TRANSLATION_SOURCES_FILE = "i18n-autopilot.sources.json";

function getTranslationSourcesPath(projectPath: string): string {
  return path.join(path.resolve(projectPath), TRANSLATION_SOURCES_FILE);
}

export function loadTranslationSources(projectPath: string): TranslationSources {
  const sourcesPath = getTranslationSourcesPath(projectPath);
  if (!fs.existsSync(sourcesPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(sourcesPath, "utf-8"));
  } catch {
    console.warn(
      `Warning: Could not parse ${TRANSLATION_SOURCES_FILE}, changed-string detection starts fresh`
    );
    return {};
  }
}

export function saveTranslationSources(
  projectPath: string,
  sources: TranslationSources,
  dryRun: boolean = false
): void {
  if (dryRun) return;
  fs.writeFileSync(
    getTranslationSourcesPath(projectPath),
    JSON.stringify(sortTranslationSources(sources), null, 2) + "\n"
  );
}

// Stable key order keeps diffs of the committed file small and merge-friendly.
function sortTranslationSources(sources: TranslationSources): TranslationSources {
  return Object.fromEntries(
    Object.keys(sources)
      .sort()
      .map((locale) => [
        locale,
        Object.fromEntries(
          Object.keys(sources[locale])
            .sort()
            .map((key) => [key, sources[locale][key]])
        ),
      ])
  );
}

export function isFileModified(
  filePath: string,
  currentContent: string,
  trackingData: TrackingData
): boolean {
  const tracked = trackingData.files[filePath];
  
  if (!tracked) {
    return true;
  }
  
  const currentHash = hashContent(currentContent);
  return currentHash !== tracked.contentHash;
}

export function markFileProcessed(
  trackingData: TrackingData,
  filePath: string,
  content: string,
  keysExtracted: string[]
): void {
  trackingData.files[filePath] = {
    filePath,
    contentHash: hashContent(content),
    lastProcessed: new Date().toISOString(),
    keysExtracted,
  };
}

export function getUnprocessedOrModifiedFiles(
  scannedFiles: ScannedFile[],
  trackingData: TrackingData
): Array<ScannedFile & { reason: "new" | "modified" }> {
  return scannedFiles
    .map((file) => {
      const tracked = trackingData.files[file.filePath];
      
      if (!tracked) {
        return { ...file, reason: "new" as const };
      }
      
      const currentHash = hashContent(file.source);
      if (currentHash !== tracked.contentHash) {
        return { ...file, reason: "modified" as const };
      }
      
      return null;
    })
    .filter((file): file is ScannedFile & { reason: "new" | "modified" } => 
      file !== null
    );
}
