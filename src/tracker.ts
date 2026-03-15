/** src/tracker.ts
 * 
 * Just to track the hash of files that have been changed
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
    return { files: {}, version: "1.0.0" };
  }
  
  try {
    const content = fs.readFileSync(trackingPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.warn("Warning: Could not parse tracking data, starting fresh");
    return { files: {}, version: "1.0.0" };
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