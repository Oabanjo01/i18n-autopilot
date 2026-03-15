import fs from "fs";
import path from "path";
import { loadTrackingData, getUnprocessedOrModifiedFiles } from "./tracker";

export interface ScannedFile {
  filePath: string;
  source: string;
  fileType: "component" | "hook";
}

const SKIP_DIRS = new Set([
  "node_modules",
  "android",
  "ios",
  ".git",
  "dist",
  "build",
  "__tests__",
  "coverage",
  ".expo",
  "scripts",
  "constants",
]);

const COMPONENT_EXTENSIONS = new Set([".tsx", ".jsx"]);
const HOOK_EXTENSIONS = new Set([".js",".ts", ".tsx"]);

function isHookFile(fileName: string): boolean {
  return fileName.startsWith("use") || fileName.includes("/use");
}

function isTestFile(fileName: string): boolean {
  return (
    fileName.endsWith(".test.tsx") ||
    fileName.endsWith(".spec.tsx") ||
    fileName.endsWith(".test.jsx") ||
    fileName.endsWith(".spec.jsx") ||
    fileName.endsWith(".test.ts") ||
    fileName.endsWith(".spec.ts")
  );
}

export function scanProject(projectPath: string): ScannedFile[] {
  const results: ScannedFile[] = [];
  const absolutePath = path.resolve(projectPath);

  function walk(dir: string, insideHooksDir: boolean = false) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const isHooksDir = entry.name === "hooks";
        if (!SKIP_DIRS.has(entry.name) || isHooksDir) {
          walk(fullPath, insideHooksDir || isHooksDir);
        }
        continue;
      }

      if (entry.name.startsWith(".env")) continue;
      if (isTestFile(entry.name)) continue;

      const ext = path.extname(entry.name);
      const nameWithoutExt = path.basename(entry.name, ext);

      if (insideHooksDir || isHookFile(nameWithoutExt)) {
        if (HOOK_EXTENSIONS.has(ext)) {
          const source = fs.readFileSync(fullPath, "utf-8");
          results.push({ filePath: fullPath, source, fileType: "hook" });
        }
        continue;
      }

      if (COMPONENT_EXTENSIONS.has(ext)) {
        const source = fs.readFileSync(fullPath, "utf-8");
        results.push({ filePath: fullPath, source, fileType: "component" });
      }
    }
  }

  walk(absolutePath);
  return results;
}

export function scanProjectSmart(projectPath: string): {
  allFiles: ScannedFile[];
  filesToProcess: Array<ScannedFile & { reason: "new" | "modified" }>;
  stats: {
    total: number;
    new: number;
    modified: number;
    unchanged: number;
  };
} {
  const allFiles = scanProject(projectPath);
  const trackingData = loadTrackingData(projectPath);
  
  const filesToProcess = getUnprocessedOrModifiedFiles(allFiles, trackingData);
  
  const stats = {
    total: allFiles.length,
    new: filesToProcess.filter((f) => f.reason === "new").length,
    modified: filesToProcess.filter((f) => f.reason === "modified").length,
    unchanged: allFiles.length - filesToProcess.length,
  };
  
  return { allFiles, filesToProcess, stats };
}