import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import inquirer from 'inquirer';

// ─── Config storage (home directory, never the project) ──────────────────────

const CONFIG_DIR = path.join(os.homedir(), '.i18n-autopilot');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function saveApiKey(apiKey: string): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ apiKey }, null, 2),
    { encoding: 'utf-8', mode: 0o600 }  // owner read/write only
  );
}

export function loadApiKey(): string | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return config.apiKey || null;
  } catch {
    return null;
  }
}

// ─── Lingo CLI ────────────────────────────────────────────────────────────────

interface LingoRunnerOptions {
  projectPath: string;
  targetLocales: string[];
  apiKey: string;
  dryRun: boolean;
}

function isLingoInstalled(): boolean {
  try {
    execSync('lingo --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function ensureLingoInstalled(): Promise<boolean> {
  if (isLingoInstalled()) return true;

  const { permission } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'permission',
      message: 'Lingo.dev CLI is not installed. Install it now? (npm install -g lingo.dev)',
      default: true,
    },
  ]);

  if (!permission) {
    console.log('\n  Install it manually with: npm install -g lingo.dev\n');
    return false;
  }

  try {
    execSync('npm install -g lingo.dev', { stdio: 'inherit' });
    return true;
  } catch {
    console.error('  Failed to install Lingo.dev CLI automatically.');
    console.error('  Try manually: npm install -g lingo.dev\n');
    return false;
  }
}

function writeLingoCLIConfig(
  projectPath: string,
  targetLocales: string[]
): void {
  const config = {
    version: "1.15",
    locale: {
      source: "en",
      targets: targetLocales,
    },
    buckets: {
      json: {
        include: [
          "locales/[locale].json"
        ],
      },
    },
    $schema: "https://lingo.dev/schema/i18n.json",
  };

  fs.writeFileSync(
    path.join(path.resolve(projectPath), 'i18n.json'),
    JSON.stringify(config, null, 2),
    'utf-8'
  );
}

async function runLingoCLI(
  projectPath: string,
  apiKey: string,
  targetLocales: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {

    // Pass each locale as its own --target-locale flag
    const localeFlags = targetLocales.flatMap((l) => ["--target-locale", l]);

    console.log("DEBUG localeFlags:", localeFlags);
    console.log("DEBUG targetLocales:", targetLocales);

    const lingo = spawn(
      'lingo',
      ['run', ...localeFlags],
      {
        cwd: path.resolve(projectPath),
        stdio: 'inherit',
        env: {
          ...process.env,
          LINGO_API_KEY: apiKey,
        },
      }
    );

    lingo.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Lingo.dev CLI exited with code ${code}`));
    });

    lingo.on('error', (err) => {
      reject(new Error(`Failed to spawn Lingo.dev CLI: ${err.message}`));
    });
  });
}

export async function runLingoTranslations(
  options: LingoRunnerOptions
): Promise<boolean> {
  const { projectPath, targetLocales, apiKey, dryRun } = options;

  const ready = await ensureLingoInstalled();
  if (!ready) return false;

  if (dryRun) {
    console.log('  Dry run — skipping Lingo.dev CLI execution');
    return true;
  }

  writeLingoCLIConfig(projectPath, targetLocales);
  await runLingoCLI(projectPath, apiKey, targetLocales);

  return true;
}