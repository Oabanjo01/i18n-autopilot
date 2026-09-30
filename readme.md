# i18n Autopilot

[![npm version](https://img.shields.io/npm/v/i18n-autopilot.svg)](https://www.npmjs.com/package/i18n-autopilot)
[![CI](https://github.com/Oabanjo01/i18n-autopilot/actions/workflows/release.yml/badge.svg?branch=main)](https://github.com/Oabanjo01/i18n-autopilot/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE.md)

Instant i18n for React Native codebases.

i18n Autopilot scans your React Native project, extracts hardcoded user-facing
strings into `locales/en.json`, rewrites your components to use `t()` from
[react-i18next](https://react.i18next.com), and translates missing keys into
your target languages — using **the translation provider of your choice**,
including your own AI.

```tsx
// Before
<Text>Welcome back</Text>

// After
const { t } = useTranslation();
<Text>{t('welcome_back')}</Text>
```

---

## Features

- **AST-based extraction** — finds strings in `<Text>`, custom Text components,
  and `useState("...")` hooks
- **Safe rewrites** — injects `useTranslation()` and replaces strings with
  `t()` calls
- **Deep mode** (`--deep`) — extracts rendered text stored in objects, arrays,
  and Maps
- **Incremental** — content hashing skips unchanged files; only missing keys
  are translated, and if English text changed since it was last translated
  you're asked whether to re-translate it
- **Pluggable translation** — Lingo.dev, Google, OpenAI, Claude, AWS,
  LibreTranslate, MyMemory, or a custom JS file
- **Dry run** (`--dry-run`) — preview everything before writing files
- **Coverage check** (`--check`) — reports missing, outdated and stale
  translations without prompting, and exits non-zero so CI can fail on it

---

## Quick Start

Requires Node.js 22.13 or later (Node 22 or 24 LTS).

```bash
# Commit your work first — this tool rewrites source files
git commit -am "before i18n"

cd your-react-native-project
npx i18n-autopilot --dry-run   # preview
npx i18n-autopilot             # run for real
```

You'll be prompted for:

```
? Path to your React Native project: .
? Target languages: (Space to select, Enter to confirm)
? Custom Text component names (comma-separated, press enter to skip):
? Translation provider: (type a number)
? <credentials for the provider you picked>
```

Credentials are saved per provider in `~/.i18n-autopilot/config.json` (outside
your project, owner-only permissions) and reused on later runs.

**Target languages:** Spanish (`es`), French (`fr-FR`), German (`de-DE`),
Japanese (`ja-JP`), Hausa (`ha`), Portuguese (`pt-BR`), Chinese Simplified
(`zh-CN`), Arabic (`ar-SA`).

**Options:**

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview changes without writing any files |
| `--deep` | Enable deep object/array/Map string extraction |
| `--check` | Report translation coverage without prompting; exits 1 if anything is missing, outdated or stale |
| `--project <path>` | Project to check (with `--check`; default `.`) |
| `--locales <codes>` | Comma-separated locales to check (with `--check`; default: every `locales/*.json`) |
| `--json` | Print the `--check` report as JSON |

---

## Translation Providers

Pick any provider at the prompt — there's no default, and you can switch
between runs.

| Provider | What you need | Cost |
|----------|---------------|------|
| Lingo.dev | API key (Lingo.dev CLI auto-install offered) | Free tier + paid plans |
| Google Translate | Cloud Translation API key | Usage-based |
| OpenAI (GPT-4o) | OpenAI API key | Usage-based |
| Claude (Anthropic) | Anthropic API key | Usage-based |
| AWS Translate | Access key ID, secret, region | Usage-based |
| LibreTranslate | Instance URL, optional API key | Free if self-hosted |
| MyMemory | Nothing (optional email) | Free — 5k words/day, 50k with email |
| Custom | A local JS file | Up to you |

Setup steps and limitations for each: **[Providers Guide](./docs/PROVIDERS.md)**.

### Bring Your Own AI

Choose **Custom** and point the CLI at a JS file that exports a `name` and an
async `translate(data, sourceLocale, targetLocale)` function. Use a local model
(Ollama, LM Studio), any OpenAI-compatible endpoint, or an internal service.
A complete, working Ollama example is in the
[Providers Guide](./docs/PROVIDERS.md#custom-provider--bring-your-own-ai).

---

## Deep Analysis

The `--deep` mode handles text that lives in containers before it reaches JSX:

- Module-scope arrays, objects, and Maps are rewritten as functions that
  receive `t`, which keeps the generated code compatible with React hooks.
- Deep analysis follows rendered user-facing values instead of rewriting every
  string found in a container.

In practice, visible labels and messages are translated, while structural
values such as routes, paths, IDs, and JSX keys are left untouched.

```tsx
// Before
const MENU_ITEMS = [
  { label: "Home", route: "/" },
];

// After
const MENU_ITEMS = (t) => [
  { label: t("home"), route: "/" },
];
```

---

## Important Notes

⚠️ **Function Components Only** — Currently supports React function components and hooks. Class components are not supported (they require the `withTranslation` HOC instead of the `useTranslation` hook).

⚠️ **File Modification** — This tool rewrites your source files. Always commit your code before running, or use `--dry-run` to preview changes first.

⚠️ **Custom Text Components** — If your app uses custom Text wrappers (e.g., `ThemedText`, `AppText`), specify them when prompted. Otherwise, those strings won't be extracted.

⚠️ **Deep Mode Scope** — `--deep` translates rendered container values. Unused
entries in arrays or objects are intentionally left unchanged until they are
actually rendered.

⚠️ **Review Machine Translations** — Every provider produces machine
translations. Have a fluent speaker review `locales/*.json` before shipping.

---

## Output

```
your-project/
├── locales/
│   ├── en.json          # Source strings (auto-generated)
│   ├── es.json          # Translations
│   └── fr-FR.json
├── .i18n-autopilot.json # Tracking data (add to .gitignore)
├── i18n-autopilot.sources.json # English each translation came from (commit this)
└── ...                  # Source files rewritten with t() calls
```

If `i18next` and `react-i18next` aren't installed, the tool offers to install
them with your package manager.

---

## Documentation

- [Providers Guide](./docs/PROVIDERS.md) — Set up each translation provider, or write your own
- [Usage Guide](./docs/USAGE.md) — Workflows and best practices
- [How It Works](./docs/HOW_IT_WORKS.md) — The pipeline, step by step
- [Lingo.dev Setup](./docs/LINGO_SETUP.md) — Lingo.dev account and dashboard settings
- [FAQ](./docs/FAQ.md) — Common questions

---

## License

MIT

---

[![npm downloads](https://img.shields.io/npm/dm/i18n-autopilot.svg)](https://www.npmjs.com/package/i18n-autopilot)

## Contributing

Bug reports, new providers and parser edge cases are welcome — see
[CONTRIBUTING.md](./CONTRIBUTING.md). Please report security issues privately
as described in [SECURITY.md](./SECURITY.md). This project follows a
[Code of Conduct](./CODE_OF_CONDUCT.md).

**Need help?** Open an issue on [GitHub](https://github.com/Oabanjo01/i18n-autopilot/issues).
