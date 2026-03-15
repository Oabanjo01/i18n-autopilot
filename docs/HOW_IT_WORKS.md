# How It Works

i18n Autopilot runs a 7-step automated pipeline to internationalize your React Native app.

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
│ 5. Translate│ Call Lingo.dev API
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

## Step 5: AI Translation

**Module:** `lingoRunner.ts`

For each target language:

1. **Check for missing keys**
   - Compare `en.json` with `es.json` (for example)
   - Extract only keys that don't exist in `es.json`

2. **Create temp directory**
   - Copy missing keys to `/tmp/lingo-run-{timestamp}/locales/en.json`
   - Write Lingo.dev config (`i18n.json`)

3. **Run Lingo.dev CLI**
```bash
   lingo run --target-locale es
```

4. **Merge translations**
   - Read generated `es.json` from temp directory
   - Merge into project's `locales/es.json`
   - Preserve existing translations

5. **Cleanup**
   - Delete temp directory
   - Remove `i18n.json` and `i18n.lock` from project

**Incremental behavior:** Only translates missing keys, saving API costs.

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
  "version": "1.0.0"
}
```

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

**Bottleneck:** Translation API calls (network-bound)

**Optimization:** Incremental translation only sends missing keys

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

**Workaround:** Convert class components to function components before running the tool, or manually add `withTranslation()` HOC after running.

---

## Next Steps

- [Usage Guide](./USAGE.md) — Learn workflows and best practices
- [FAQ](./FAQ.md) — Common questions and troubleshooting