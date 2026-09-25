// Offline custom provider for the end-to-end test: tags each value with the
// target locale and logs what it was asked to translate to $CALLS_LOG.
const fs = require("fs");

module.exports = {
  name: "fake",
  async translate(data, sourceLocale, targetLocale) {
    fs.appendFileSync(
      process.env.CALLS_LOG,
      JSON.stringify({ targetLocale, keys: Object.keys(data) }) + "\n",
    );
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, `[${targetLocale}] ${v}`]),
    );
  },
};
