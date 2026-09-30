// Runs the CLI from source (bin/index.ts) with scripted prompt answers, so the
// end-to-end test exercises the real pipeline without a terminal.
// Every prompt's own `when`, `validate` and `filter` functions are applied.
//
// env ANSWERS: JSON map of prompt name -> answer
// argv: CLI flags, e.g. --deep --dry-run
const path = require("path");

const repo = path.resolve(__dirname, "../..");
require(path.join(repo, "node_modules/ts-node")).register({
  transpileOnly: true,
  project: path.join(repo, "tsconfig.json"),
});

const answers = JSON.parse(process.env.ANSWERS);
process.argv = [process.argv[0], "i18n-autopilot", ...process.argv.slice(2)];

const inquirer = require(path.join(repo, "node_modules/inquirer")).default;

inquirer.prompt = async (questions) => {
  const result = {};
  for (const q of [].concat(questions)) {
    if (typeof q.when === "function" && !q.when({ ...answers, ...result })) {
      continue;
    }
    if (!(q.name in answers)) {
      throw new Error(`No scripted answer for prompt "${q.name}": ${q.message}`);
    }
    let value = answers[q.name];
    if (typeof q.validate === "function") {
      if (q.name === "customProviderPath") {
        console.log(`[harness] validate empty -> ${q.validate("")}`);
        console.log(`[harness] validate missing -> ${q.validate("./missing-provider.js")}`);
      }
      const ok = q.validate(value);
      if (ok !== true) throw new Error(`Validation rejected "${value}": ${ok}`);
    }
    if (typeof q.filter === "function") value = q.filter(value);
    console.log(`[harness] asked ${q.name}`);
    result[q.name] = value;
  }
  return result;
};

require(path.join(repo, "bin/index.ts"));
