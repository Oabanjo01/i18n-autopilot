# How It Works

i18n Autopilot runs a 7-step automated pipeline to internationalize your React
Native app. The current deep-analysis implementation extends that pipeline so
container-based strings can be translated safely without rewriting structural
data such as routes or JSX keys.

---

## Pipeline Overview
```
┌─────────────┐
│  1. Scan    │ Find all component files
└──────┬──────┘
       │
┌──────▼──────┐
│  2. Parse   │ Extract hardcoded strings via AST
└──────┬──────┘
       │
┌──────▼──────┐
│ 3. Generate │ Create translation keys
└──────┬──────┘
       │
┌──────▼──────┐
│  4. Build   │ Merge into en.json
└──────┬──────┘
       │
┌──────▼──────┐
│ 5. Translate│ Send missing (and, if you agree, changed) keys to your provider
└──────┬──────┘
       │
┌──────▼──────┐
│ 6. Rewrite  │ Replace strings with t() calls
└──────┬──────┘
       │
┌──────▼──────┐
│  7. Track   │ Save file hashes for next run
└─────────────┘
```

---

## Step 1: Smart Scan

**Module:** `scanner.ts`

Recursively walks your project directory to find:
- `.tsx` and `.jsx` component files
- Custom hook files (`.ts`, `.js` in `hooks/` or starting with `use`)

**Automatically skips:**
- `node_modules/`, `android/`, `ios/`
- `build/`, `dist/`, `.expo/`
- Test files (`.test.tsx`, `.spec.jsx`)
- Config files (`.env`, etc.)

**Smart tracking:**
- Computes SHA-256 hash of each file's content
- Compares with `.i18n-autopilot.json` to detect changes
- Returns: `new`, `modified`, or `unchanged` status

---

## Step 2: Intelligent Parsing

**Module:** `parser.ts`

Uses Babel's AST parser to find hardcoded strings inside:

### Supported Patterns
```tsx
<Text>Hello world</Text>                    ✅ JSXText
<Text>{'Hello world'}</Text>                ✅ StringLiteral
<Text>{`Hello world`}</Text>                ✅ TemplateLiteral
<ThemedText>Welcome</ThemedText>            ✅ Custom components
const [msg, setMsg] = useState("Loading")   ✅ useState hook
```

### Ignored Patterns
```tsx
<Text>{userName}</Text>                     ⏭ Already dynamic
<Text>{count}</Text>                        ⏭ Number, not string
StyleSheet.create({ label: "red" })         ⏭ Non-user-facing
```

**Validation:** Strings must be 2+ characters and contain at least one letter.

### Deep Analysis Extension

When `--deep` is enabled, `deepAnalyzer.ts` performs an additional static
analysis pass after the base parser.

It follows:
- Object literals accessed from JSX
- Arrays rendered with `.map()`
- Indexed access such as `ITEMS[0].label`
- One-level aliases such as `const item = ITEMS[0]`
- Maps accessed through `.get()` or rendered through `.values()`

The rule is simple: translate rendered user-facing values, not every string
that happens to exist in the same container.

---

## Step 3: Key Generation

**Module:** `keyGenerator.ts`

Transforms strings into clean, readable keys:
```
"Welcome back to the app!" → welcome_back_app
"Loading..."               → loading
"Sign In"                  → sign
```

**Algorithm:**
1. Lowercase the string
2. Remove punctuation (replace with spaces)
3. Split into words
4. Filter out stop words (`the`, `a`, `and`, `to`, `for`, etc.)
5. Take first 3 meaningful words
6. Join with underscores

**Collision handling:**
- First occurrence: `welcome_back`
- Second occurrence: `welcome_back_2`
- Third occurrence: `welcome_back_3`

---

## Step 4: Merge-Safe Locale Building

**Module:** `localeBuilder.ts`

Creates or updates `locales/en.json`:

### First Run
```json
{
  "welcome_back": "Welcome back",
  "sign": "Sign In",
  "loading": "Loading..."
}
```

### Second Run (new strings found)
**Existing en.json:**
```json
{
  "welcome_back": "Welcome back",
  "sign": "Sign In"
}
```

**After merge:**
```json
{
  "welcome_back": "Welcome back",
  "sign": "Sign In",
  "loading": "Loading..."
}
```

**Key behavior:**
- ✅ Preserves existing keys
- ✅ Adds only new keys
- ✅ Never overwrites
- ✅ Idempotent (safe to run multiple times)

---

## Step 5: Translation

**Modules:** `providers/types.ts`, `providers/registry.ts`,
`providers/localeFiles.ts`, and one adapter per provider in `providers/`

Translation is provider-agnostic. Every service is wrapped in an adapter that
implements the same interface:

```ts
interface TranslationProvider {
  readonly name: string;
  translate(
    data: Record<string, string>, // missing keys (+ changed keys, if chosen)
    sourceLocale: string,         // always "en"
    targetLocale: string,         // e.g. "es", "fr-FR"
  ): Promise<Record<string, string>>; // same keys, translated values
}
```

**Provider selection:**
- The provider you pick at the prompt is resolved from a **registry**
  (`registry.ts`), built from the credentials you entered or saved in
  `~/.i18n-autopilot/config.json`
- Built-in adapters: `lingo`, `google`, `openai`, `claude`, `aws`,
  `libretranslate`, `mymemory`
- **Custom:** your JS file is loaded with `require()`, checked for a string
  `name` and a `translate` function, and registered under its own name. The
  path prompt rejects an empty path or a file that doesn't exist

**Changed English:** after each successful translation, the English text each
key was translated from is recorded per locale in `i18n-autopilot.sources.json`
at the project root (`tracker.ts`). It's kept separate from
`.i18n-autopilot.json` (which stores machine-specific absolute paths) so it
can be committed and shared by a team. Before translating, the CLI compares
those records with the current `en.json` (`getChangedLocaleKeys`). If any keys
changed (and it isn't a dry run), it asks once: *"N English string(s) changed
since they were last translated. Re-translate them?"* (default Yes). Answering
No keeps the existing translations and leaves the keys flagged for next run.
Keys with no recorded source (translated before this tracking existed) are
baselined to their current English.

For each target language:

1. **Diff** (`localeFiles.ts`)
   - Compare `en.json` with `es.json` (for example) by key
   - Extract keys that don't exist in `es.json`, plus changed keys if you
     chose to re-translate them
   - If there's nothing to translate, skip the locale
     (`⏭  es — up to date, skipping`)

2. **Translate**
   - Call `provider.translate(keysToTranslate, "en", "es")`
   - The adapter handles its own API format, locale-code mapping, and
     batching (one request per locale, or one per string, depending on the
     service)

3. **Merge** (`localeFiles.ts`)
   - Merge the returned keys into the project's `locales/es.json`
   - Create the file if it doesn't exist
   - Preserve existing translations
   - Record the English each returned key was translated from

If a provider throws for one locale, the error is logged and the loop moves on
to the next locale.

**Incremental behavior:** Only translates missing keys — and changed keys when
you say yes — saving API costs.

### Example Adapter: Lingo.dev

The Lingo.dev adapter (`providers/lingo.ts`) wraps the Lingo.dev CLI rather
than calling an HTTP API:

1. Write the keys to translate to `<tmp>/lingo-run-{timestamp}/locales/en.json`
2. Write a Lingo.dev config (`i18n.json`) in that temp directory
3. Run the CLI there:
```bash
   lingo run --target-locale es
```
4. Read the generated `es.json` from the temp directory and return it
5. Delete the temp directory

Other adapters (Google, OpenAI, Claude, AWS, LibreTranslate, MyMemory)
call their service's API directly. See the [Providers Guide](./PROVIDERS.md)
for details and limitations of each.

*(`lingoRunner.ts` is a legacy compatibility shim; the CLI no longer uses it.)*

---

## Step 6: Surgical Code Rewriting

**Module:** `rewriter.ts`

For each file with extractable strings:

### 1. Add import
```tsx
import { useTranslation } from 'react-i18next';
```

### 2. Inject hook
```tsx
function MyComponent() {
  const { t } = useTranslation(); // ← Injected at top of function
  // ... rest of component
}
```

### 3. Replace strings
```tsx
// Before
<Text>Welcome back</Text>

// After
<Text>{t('welcome_back')}</Text>
```

**Smart injection:**
- Detects if `useTranslation` is already imported
- Detects if hook is already declared
- Only injects where needed

### Deep Rewrite Safety

For `--deep`, the rewriter applies an extra safety step for module-scope
containers.

Example:

```tsx
const ITEMS = [
  { label: "Home", route: "/" },
];
```

becomes:

```tsx
const ITEMS = (t) => [
  { label: t("home"), route: "/" },
];
```

Render sites are then updated to call `ITEMS(t)` from inside the component.
This keeps the generated code compatible with React's hook rules.

---

## Step 7: Content Tracking

**Module:** `tracker.ts`

Updates `.i18n-autopilot.json`:
```json
{
  "files": {
    "/path/to/HomeScreen.tsx": {
      "filePath": "/path/to/HomeScreen.tsx",
      "contentHash": "a1b2c3d4...",
      "lastProcessed": "2025-01-15T10:30:00.000Z",
      "keysExtracted": ["welcome_back", "sign"]
    }
  },
  "version": "1.0.1"
}
```

Translation sources are written to `i18n-autopilot.sources.json` (sorted, so
diffs stay small):
```json
{
  "es": { "sign": "Sign In", "welcome_back": "Welcome back" }
}
```

It records, per locale, the English text each key was translated from; it's
how changed English is detected (see Step 5).

**On next run:**
- Recompute hash of each file
- Compare with stored hash
- Only process files where hash changed

---

## Workflows

### First Run (Fresh Project)
1. Scan → finds 34 files
2. Parse → extracts 187 strings
3. Generate → creates 187 keys
4. Build → writes `en.json`
5. Translate → creates `es.json`, `fr-FR.json`
6. Rewrite → modifies 21 files
7. Track → saves hashes

### Adding a New Language
1. Scan → finds 34 files (unchanged)
2. Parse → skipped (no new files)

3. Build → skipped (no new strings)
4. Translate → only runs for new language
5. Rewrite → skipped (files already rewritten)
6. Track → no changes

### Adding a New Feature
1. Scan → finds 1 new file
2. Parse → extracts 12 new strings
3. Generate → creates 12 new keys
4. Build → merges into `en.json` (187 + 12 = 199)
5. Translate → translates 12 new keys to all languages
6. Rewrite → modifies 1 new file
7. Track → saves hash for new file

---

## Performance

**Typical run time:**
- Small app (20 files): ~10 seconds
- Medium app (100 files): ~30 seconds
- Large app (500 files): ~2 minutes

**Bottleneck:** Translation API calls (network-bound). Providers that
translate one string per request (LibreTranslate, MyMemory) are slower on
large batches than those that send a whole locale at once.

**Optimization:** Incremental translation only sends missing keys (and changed
keys, if you choose to re-translate them)

---

## Limitations

### Function Components Only

The rewriter currently only supports function components:
```tsx
// ✅ SUPPORTED
export default function Home() {
  const { t } = useTranslation();
  return <Text>{t('welcome')}</Text>;
}

// ✅ SUPPORTED
const Home = () => {
  const { t } = useTranslation();
  return <Text>{t('welcome')}</Text>;
};

// ❌ NOT SUPPORTED
export default class Home extends React.Component {
  // Can't inject useTranslation hook in class components
  render() {
    return <Text>Welcome</Text>;
  }
}
```

**Why?** The tool injects the `useTranslation()` hook, which is only compatible with function components. Class components would require wrapping with the `withTranslation()` HOC, which is a different AST transformation pattern.

The tool skips class components: their strings aren't extracted and the file
is left unchanged. The same applies to text outside any function component or
hook (module scope, plain helper functions), because there's nowhere to call
`useTranslation()` from.

**Workaround:** Convert class components to function components before running the tool, or manually add `withTranslation()` HOC after running.

**What counts as a component:** a function whose name starts with a capital
letter (including ones wrapped in `memo`/`forwardRef` or exported as the
default), or a hook whose name starts with `use`. Implicit-return arrow
components like `const Empty = () => <Text>…</Text>` are converted to a block
body so the hook can be added.

---

## Next Steps

- [Usage Guide](./USAGE.md) — Learn workflows and best practices
- [Providers Guide](./PROVIDERS.md) — Set up a provider or write your own
- [FAQ](./FAQ.md) — Common questions and troubleshooting
