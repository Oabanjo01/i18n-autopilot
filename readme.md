# Dependencies Overview

- **`@babel/parser`**  
  Reads `.tsx`/`.jsx` files and converts them into an AST tree your code can navigate.  
  Without it, files are just a wall of text.

- **`@babel/traverse`**  
  Walks the AST tree node by node.  
  Lets you find every `<Text>` component and inspect its children.

- **`@babel/types`**  
  Utility belt for AST nodes.  
  Check node types (`isJSXText`, `isStringLiteral`, etc.) and create new nodes when rewriting.

- **`@babel/generator`**  
  Reverse of the parser.  
  Turns modified AST back into readable source code written to files.

- **`commander`**  
  Handles CLI flags (e.g. `--dry-run`).  
  Avoids manual `process.argv` parsing.

- **`inquirer`**  
  Powers interactive prompts (checkboxes, text inputs, selects, etc.) when the tool starts.

- **`chalk`**  
  Adds color to terminal output (green=success, yellow=warning, red=error).  
  Purely cosmetic, but makes the tool feel professional.

- **`ora`**  
  Spinning loading indicators in the terminal.  
  Shows the user that work is in progress.


# i18n Autopilot 🌍

> Instant internationalization for React Native codebases — powered by Lingo.dev.

---

## The Problem

Internationalizing an existing React Native app is one of the most tedious tasks in mobile development. A developer typically spends days:

- Manually hunting down every hardcoded string across dozens of files
- Replacing each one with a `t('key')` call
- Injecting `useTranslation()` hooks into every component
- Setting up translation JSON files from scratch
- Configuring CI/CD to keep translations in sync

**i18n Autopilot eliminates all of it with a single command.**

---

## Demo

```bash
npx i18n-autopilot
```

```
  i18n Autopilot

  ✔ Found 34 files — 31 components, 3 hooks
  ✔ Found 187 translatable strings
  ✔ Generated 187 keys
  ✔ Written locales/en.json (187 keys)
  ✔ Rewrote 21 files
  ✔ Translations complete
  ✔ Config files written
```

Your React Native app now speaks Spanish, French, German, and Japanese. Every source file has been rewritten. CI/CD is wired up. You didn't touch a single file manually.

---

## How It Works

i18n Autopilot runs a 6-step pipeline entirely on your local machine:

**1. Scan** — Recursively walks your project, collecting every `.tsx` and `.jsx` component file and custom hook. Skips `node_modules`, `android`, `ios`, and other non-UI folders automatically.

**2. Parse** — Uses Babel's AST parser to find every hardcoded string inside `<Text>` components (and any custom Text variants you specify — `ThemedText`, `AppText` etc.). Also scans hook files for `useState("string")` calls. Handles JSX text, string literals, and template literals.

**3. Generate Keys** — Converts each string into a clean, readable i18n key. `"Welcome back to the app"` becomes `welcome_back_app`. Collisions are resolved automatically.

**4. Rewrite** — Goes back through every source file and makes two precise changes:
   - Replaces each hardcoded string with `t('key')`
   - Injects `const { t } = useTranslation()` at the correct position inside the component
   - Adds the `react-i18next` import if not already present
   - Installs `i18next` and `react-i18next` in the project if missing

**5. Translate** — Hands `locales/en.json` to the **Lingo.dev CLI**, which runs it through a fully configured localization engine — brand voice, glossary, translation memory, and quality assurance included. Produces one translated JSON file per target language.

**6. Wire Up** — Writes `i18n.json` (Lingo.dev config) and a GitHub Actions workflow so every future change to `en.json` triggers automatic translation on push.

---

## Lingo.dev Integration

i18n Autopilot is built around the Lingo.dev ecosystem:

| Tool | How it's used |
|---|---|
| **Lingo.dev CLI** | Translates `locales/en.json` into every target language with brand voice, glossary, and translation memory applied |
| **Lingo.dev CI/CD** | Generated GitHub Actions workflow keeps translations in sync on every push |
| **Lingo.dev MCP** | After running the tool, configure brand voice and glossary for each locale directly from Claude Code or Cursor — no dashboard needed |

---

## Installation

```bash
npx i18n-autopilot
```

No global install required. On first run you'll be asked for your Lingo.dev API key — it's stored securely in `~/.i18n-autopilot/config.json` (never inside your project).

**Requirements:**
- Node.js v18+
- A React Native project
- A [Lingo.dev](https://lingo.dev) account and API key

---

## Usage

```bash
cd your-react-native-project
npx i18n-autopilot
```

You'll be prompted for:

1. **Project path** — defaults to current directory
2. **Target languages** — select from the list using Space, confirm with Enter
3. **Custom Text components** — e.g. `ThemedText, AppText` (optional)
4. **Lingo.dev API key** — only asked once, saved securely

Add `--dry-run` to preview all changes without writing any files:

```bash
npx i18n-autopilot --dry-run
```

---

## What Gets Generated

Inside your project after running:

```
locales/
  en.json          ← source strings
  es.json          ← translated by Lingo.dev
  fr-FR.json       ← translated by Lingo.dev
  de-DE.json       ← translated by Lingo.dev
  ja-JP.json       ← translated by Lingo.dev

i18n.json          ← Lingo.dev CLI config
.github/
  workflows/
    lingo.yml      ← auto-translate on push
```

Every component that had hardcoded strings is rewritten:

```tsx
// Before
<ThemedText>Welcome back</ThemedText>

// After
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
<ThemedText>{t('welcome_back')}</ThemedText>
```

---

## Security

- API keys are **never written into your project** — stored in `~/.i18n-autopilot/config.json` with `0o600` permissions (owner read/write only)
- Keys are passed to the Lingo.dev CLI via environment variable — memory only, never disk
- The tool only modifies files it explicitly parses — no silent side effects

---

## Architecture

```
npx i18n-autopilot
│
├── scanner.ts       Finds all component and hook files
├── parser.ts        AST extraction — strings inside <Text> and useState()
├── keyGenerator.ts  "Welcome back" → welcome_back
├── localeBuilder.ts Writes locales/en.json
├── rewriter.ts      Rewrites source files + injects useTranslation()
├── lingoRunner.ts   Runs Lingo.dev CLI → produces translated JSON files
└── configWriter.ts  Writes i18n.json + GitHub Actions workflow
```

---

## Supported String Patterns

```tsx
<Text>Hello world</Text>                    ✅
<Text>{'Hello world'}</Text>                ✅
<Text>{`Hello world`}</Text>                ✅
<ThemedText>Hello world</ThemedText>        ✅ (custom components)
const [msg, setMsg] = useState("Loading")   ✅ (hooks)
<Text>{someVariable}</Text>                 ⏭  skipped (already dynamic)
StyleSheet.create({ label: "red" })         ⏭  skipped (not user-facing)
```

---

## Roadmap

- [ ] `TextInput` placeholder and label support
- [ ] Pluralization helpers
- [ ] Interactive diff viewer before committing changes
- [ ] Support for additional i18n libraries (`i18n-js`, `lingui`)
- [ ] Monorepo support

---

## Built With

- [Lingo.dev](https://lingo.dev) — AI-powered localization engine
- [@babel/parser](https://babeljs.io/docs/babel-parser) — AST parsing
- [@babel/traverse](https://babeljs.io/docs/babel-traverse) — AST traversal
- [@babel/generator](https://babeljs.io/docs/babel-generator) — Code generation
- [commander](https://github.com/tj/commander.js) — CLI framework
- [inquirer](https://github.com/SBoudrias/Inquirer.js) — Interactive prompts
- [react-i18next](https://react.i18next.com) — i18n runtime for React Native

---

## License

MIT