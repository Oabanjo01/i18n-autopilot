/**
 * src/reporter.ts — The narrator.
 * Handles all the terminal output — spinners, progress updates, warnings, and the final summary. 
 * Keeps all the log noise out of the other files.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_FILE = path.join(os.homedir(), '.i18n-autopilot', 'run.log');

export function initLog(): void {
  const dir = path.join(os.homedir(), '.i18n-autopilot');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(LOG_FILE, `=== i18n Autopilot Run: ${new Date().toISOString()} ===\n`, 'utf-8');
}

export function log(message: string): void {
  process.stdout.write(message + '\n');
  fs.appendFileSync(LOG_FILE, message + '\n', 'utf-8');
}

export function getLogPath(): string {
  return LOG_FILE;
}