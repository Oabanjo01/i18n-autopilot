import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const { execFileSync, prompt } = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  prompt: vi.fn(),
}));

vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("child_process")>()),
  execFileSync,
}));
vi.mock("inquirer", () => ({ default: { prompt } }));

import { ensureI18nDependencies } from "../src/rewriter";

let root: string;

function makeProject(dirName: string, deps: Record<string, string>, lockfile?: string) {
  const dir = path.join(root, dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ dependencies: deps }));
  if (lockfile) fs.writeFileSync(path.join(dir, lockfile), "");
  return dir;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "install-deps-"));
  execFileSync.mockReset();
  prompt.mockReset();
  prompt.mockResolvedValue({ permission: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("ensureI18nDependencies", () => {
  it("does nothing when i18next and react-i18next are already installed", async () => {
    const dir = makeProject("app", { i18next: "^26", "react-i18next": "^17" });
    expect(await ensureI18nDependencies(dir)).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("never puts the project path into a shell command", async () => {
    // A directory name that would run a command if it reached a shell.
    const dir = makeProject("app; touch PWNED $(whoami)", {}, "yarn.lock");

    expect(await ensureI18nDependencies(dir)).toBe(true);

    expect(execFileSync).toHaveBeenCalledTimes(1);
    const [command, args, options] = execFileSync.mock.calls[0];
    expect(command).toBe("yarn");
    expect(args).toEqual(["add", "i18next", "react-i18next"]);
    expect(options.cwd).toBe(path.resolve(dir));
    expect(JSON.stringify([command, args])).not.toContain("PWNED");
  });

  it("uses npm when the project has a package-lock.json", async () => {
    const dir = makeProject("npm-app", { i18next: "^26" }, "package-lock.json");
    await ensureI18nDependencies(dir);
    const [command, args] = execFileSync.mock.calls[0];
    expect(command).toBe("npm");
    expect(args).toEqual(["install", "react-i18next"]);
  });

  it("doesn't install when the user declines", async () => {
    prompt.mockResolvedValue({ permission: false });
    const dir = makeProject("app", {});
    expect(await ensureI18nDependencies(dir)).toBe(false);
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("reports failure when the install command fails", async () => {
    execFileSync.mockImplementation(() => {
      throw new Error("exit 1");
    });
    const dir = makeProject("app", {});
    expect(await ensureI18nDependencies(dir)).toBe(false);
  });
});
