// Copies the scenario fixture into .self-test/app (gitignored) and runs the CLI
// from source against it, so a manual run never rewrites the tracked fixture.
// Usage: yarn self-test [--deep] [--dry-run]
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const fixture = path.join(repo, "tests/fixtures/deep-analyzer-sample");
const sandbox = path.join(repo, ".self-test/app");

fs.rmSync(sandbox, { recursive: true, force: true });
fs.cpSync(fixture, sandbox, {
  recursive: true,
  filter: (src) =>
    !/[\\/](node_modules|locales)([\\/]|$)/.test(path.sep + path.relative(fixture, src)),
});

console.log(`\n  Fresh copy of the scenario fixture: ${sandbox}`);
console.log("  Enter that path at the first prompt. See SCENARIOS.md in it for what to expect.\n");

const result = spawnSync(
  process.execPath,
  [require.resolve("ts-node/dist/bin.js"), path.join(repo, "bin/index.ts"), ...process.argv.slice(2)],
  { stdio: "inherit", cwd: repo },
);
process.exit(result.status ?? 1);
