# Usage Guide

Complete guide to using i18n Autopilot in different scenarios.

---

## Basic Usage
```bash
cd your-react-native-project
npx i18n-autopilot
```

Follow the interactive prompts and you're done.

---

## Command-Line Options

### Deep Analysis Mode

Use `--deep` when user-facing text is stored in objects, arrays, or Maps before
it reaches JSX:

```bash
npx i18n-autopilot --deep
```

Deep mode supports:
- Arrays of objects rendered with `.map()`
- Plain string arrays rendered with `.map()`
- Indexed access such as `ITEMS[0].label`
- One-level indirection such as `const item = ITEMS[0]`
- Conditional object access such as `flag ? MESSAGES.success : MESSAGES.error`
- `Map#get(...)` and `Array.from(MAP.values()).map(...)`

Latest behavior changes:
- Module-scope containers are rewritten as functions that accept `t`
- Only rendered user-facing values are translated
- Structural values such as `route`, `path`, IDs, and JSX keys are no longer
  translated simply because they live in the same object

This update broadens container-based extraction without making rewrites noisy
or unsafe.

### Dry Run Mode

Preview all changes without writing any files:
```bash
npx i18n-autopilot --dry-run
```

**What it does:**
- Shows what strings would be extracted
- Shows what keys would be generated
- Shows what files would be rewritten
- Shows, per locale, how many new keys would be translated and how many
  changed keys it would ask about, and via which provider
- **Does NOT:** modify files, create locales, or call the translation provider

*Note:* if `i18next`/`react-i18next` are missing, you may still be asked
whether to install them.

---

## Common Workflows

### 1. First-Time Setup
```bash
npx i18n-autopilot
```

**Prompts:**
- Project path: `.` (press Enter)
- Target languages: Select Spanish & French (use Space, then Enter)
- Custom Text components: (press Enter to skip)
- Translation provider: Type the number of the provider you want (e.g. Lingo.dev, OpenAI, Claude, or Custom)
- Provider credentials: Paste your API key (or URL/email, depending on the provider)

See the [Providers Guide](./PROVIDERS.md) for what each provider asks for.

**Result:**
- `locales/en.json` created with all strings
- `locales/es.json` and `locales/fr-FR.json` created
- 21 files rewritten with `t()` calls
- `i18next` and `react-i18next` installed

---

### 2. Adding New Languages

**Scenario:** App already internationalized, want to add German
```bash
npx i18n-autopilot
```

**Prompts:**
- Project path: `.`
- Target languages: Select **German** (de-DE)
- Custom Text components: (skip)
- Translation provider: Pick one (it doesn't have to be the same as last time)
- Credentials: (already saved for that provider, skipped)

**Result:**
- `locales/de-DE.json` created
- No files rewritten (already done)
- Existing translations preserved

---

### 3. Adding New Features

**Scenario:** You built a new screen with 15 hardcoded strings
```bash
npx i18n-autopilot
```

**Prompts:**
- Same as before (select same languages)

**Result:**
- 15 new strings extracted
- `en.json` updated (preserves existing 187 keys, adds 15 new)
- 15 new keys translated to Spanish, French, German
- Only 1 new file rewritten
- Existing files untouched

---

### 4. Custom Text Components

**Scenario:** Your app uses `<AppText>` and `<ThemedText>` instead of `<Text>`
```bash
npx i18n-autopilot
```

**Prompts:**
- Custom Text components: `AppText, ThemedText`

**Result:**
- Tool extracts strings from all three: `Text`, `AppText`, `ThemedText`

---

### 5. Switching Translation Providers

**Scenario:** You started with one provider and want to try another

```bash
npx i18n-autopilot
```

**Prompts:**
- Translation provider: Pick the new one
- Credentials: Entered once, then saved alongside your other providers' keys

**Result:**
- Existing translations are kept — only keys missing from each locale file are
  sent to the new provider
- Credentials for your previous provider stay saved for later runs

---

### 6. Bring Your Own AI

**Scenario:** You want to translate with a local model or your own service

```bash
npx i18n-autopilot
```

**Prompts:**
- Translation provider: Custom (provide your own JS file)
- Path to your custom provider JS file: `./ollama-provider.js` (an empty path
  or a file that doesn't exist is rejected and you're asked again)

**Result:**
- Missing keys (and any changed keys you chose to re-translate) for each locale
  are passed to your file's `translate()` function

See [Custom Provider / Bring Your Own AI](./PROVIDERS.md#custom-provider--bring-your-own-ai)
for the contract and a full example.

---

### 7. Deep Container-Based Text

**Scenario:** Your screen renders text from arrays, objects, or Maps
```bash
npx i18n-autopilot --deep
```

**Before:**
```tsx
const MENU_ITEMS = [
  { label: "Home", route: "/" },
  { label: "Profile", route: "/profile" },
];
```

**After:**
```tsx
const MENU_ITEMS = (t) => [
  { label: t("home"), route: "/" },
  { label: t("profile"), route: "/profile" },
];
```

**Result:**
- User-facing labels are translated
- Structural values like `route` are preserved
- Module-scope containers stay safe to use from component scope

---

## File Structure

After running i18n Autopilot:
```
your-project/
├── locales/
│   ├── en.json          # Source strings (auto-generated)
│   ├── es.json          # Spanish translations
│   ├── fr-FR.json       # French translations
│   └── de-DE.json       # German translations
├── .i18n-autopilot.json # Tracking data (add to .gitignore)
├── i18n-autopilot.sources.json # English each translation came from (commit this)
├── app/
│   └── screens/
│       └── Home.tsx     # Rewritten with t() calls
└── package.json         # i18next added to dependencies
```

---

## Gitignore Recommendations

Add to `.gitignore`:
```
# i18n Autopilot tracking file
.i18n-autopilot.json

# Lingo.dev CLI files — only if you've run the Lingo.dev CLI in your
# project yourself (i18n Autopilot runs it in a temp directory)
i18n.json
i18n.lock
```

**Keep in Git:**
- `locales/*.json` — All translation files
- `i18n-autopilot.sources.json` — lets everyone on the team detect changed English
- Modified source files — Show reviewers what changed

---

## Best Practices

### ✅ DO

- Run `--dry-run` first on large projects
- Use `--deep` when display text is stored in arrays, objects, or Maps
- Commit before running (easy to revert if needed)
- Review diffs before pushing
- Add `.i18n-autopilot.json` to `.gitignore`
- Use custom component names if you have them

### ❌ DON'T

- Rename keys in `en.json` by hand (source files reference them via `t()`);
  editing the English *values* is fine and is preserved
- Delete `.i18n-autopilot.json` unless you want to re-process everything
- Delete `i18n-autopilot.sources.json` unless you want changed-English
  detection to start over
- Commit API keys (tool stores them outside project)

---

## Incremental Updates

i18n Autopilot is designed for **continuous use**:

| Scenario | What Happens |
|----------|--------------|
| Add new screen | Only new file is processed |
| Modify existing component | Only that file is re-processed |
| Add new language | Existing code untouched, new locale created |
| No changes | Tool detects and skips everything (fast) |

**Key insight:** Content hashing makes subsequent runs fast.

---

## Translation Management

### Updating Existing Translations

After each successful translation, the tool records, per locale, the English
text each key was translated from, in `i18n-autopilot.sources.json` at the
project root. On the next run, if a key's English in
`locales/en.json` differs from what that locale was translated from, it counts
as **changed**, and the CLI asks once:

```
? 3 English string(s) changed since they were last translated. Re-translate them? (Y/n)
```

- **Yes** (default) — changed keys are re-translated along with any missing keys
- **No** — existing translations are kept (saves tokens/cost); the changed keys
  stay flagged, so you'll be asked again on the next run

`--dry-run` doesn't prompt; it reports per locale how many new keys it would
translate and how many changed keys it would ask about.

**Upgrading from an earlier version:** keys translated before this tracking
existed have no recorded source, so on the first run they're baselined to
their current English — edits made before upgrading aren't detected. To force
one of those keys to be re-translated, delete it from each target locale file
(`es.json`, `fr-FR.json`, etc.); it then counts as missing and is translated on
the next run.

**Sharing across a team:** commit `i18n-autopilot.sources.json` alongside
`locales/`. It holds only locale → key → English text (no machine-specific
paths) and is written in sorted order, so teammates share the same
changed-English detection and merges stay simple.

**Reusing keys:** keys come from the first few words of a string. If a new
string produces a key that already exists in `en.json` with different English,
it gets the next free suffix (`_2`, `_3`, …) instead, so existing strings and
any English you've edited are never overwritten. Identical English — in the
same run or a later one — shares one key, so it's translated once.

**Whitespace:** text is read the way React renders it. Text split across lines
becomes a single line in `en.json`, and a space next to a nested element
(`Terms apply. <Text>…</Text>`) is kept in the rewritten code.

### Deleting Unused Keys

Currently manual:
1. Identify unused keys in `en.json`
2. Delete them
3. Delete from all language files (`es.json`, `fr-FR.json`, etc.)

*(Automated cleanup coming in future release)*

---

## Troubleshooting

### "Tool hangs after translations complete"

**Fixed in v1.0.0.** Update to latest version:
```bash
npx i18n-autopilot@latest
```

### "Empty en.json after second run"

**Fixed in v1.0.0.** The merge logic now preserves existing translations.

### "Want to re-translate everything from scratch"

Delete tracking and locales:
```bash
rm -rf .i18n-autopilot.json locales/
npx i18n-autopilot
```

### "Change API key"

Credentials are saved per provider in `~/.i18n-autopilot/config.json`. Remove
the entry for that provider under `providers` and run the tool again — you'll
be prompted for new credentials. To reset every provider at once:
```bash
rm ~/.i18n-autopilot/config.json
npx i18n-autopilot
```

### "One language failed but others succeeded"

Each locale is translated separately. If a provider errors for one locale
(unsupported language, rate limit, invalid key), the error is logged with the
provider name and the run continues. Fix the cause — or pick a different
provider — and run again; keys that failed are still missing (or still
flagged as changed), so they're retried.

### "Why did only some array items get translated?"

Deep mode follows rendered usage.

- `STEPS[0].text` rewrites entry `0`
- `STEPS[1].text` rewrites entry `1`
- `STEPS[2].text` stays unchanged until it is actually rendered

This keeps `--deep` focused on visible text and prevents unrelated data in the
same container from being rewritten.

### "See detailed logs"

Check the log file:
```bash
cat ~/.i18n-autopilot/run.log
```

---

## Advanced Usage

### Contributor Self-Test

`tests/fixtures/deep-analyzer-sample/` is a scenario app covering what the
tool must translate and what it must leave alone — see its `SCENARIOS.md`.

```bash
yarn self-test
```

This copies the fixture to `.self-test/app` (gitignored), prints that path, and
starts the CLI from source in `--deep` mode. Each run starts from a fresh copy,
so the tracked fixture is never rewritten.

`yarn test` runs the same scenarios automatically (`tests/e2e.test.ts`): the
real CLI against a temporary copy, with scripted answers and an offline fake
provider, across several runs (no changes, dry run, edited English, a new
colliding string).

### Releasing (maintainers)

`main` is protected: changes land through pull requests, and CI (type-check,
tests, build) must pass before merging. Merging to `main` runs the Release
workflow, which publishes to npm **only if the version in `package.json`
isn't on npm yet**, then tags `vX.Y.Z` and creates a GitHub Release.

To release, bump `version` in `package.json` in your PR (the CLI's
`--version` reads it) and merge. PRs without a version bump publish nothing.

### Programmatic Use

*(Coming soon)*

i18n Autopilot is currently CLI-only — there is no programmatic API export
yet. To plug in your own translation logic today, use a
[custom provider](./PROVIDERS.md#custom-provider--bring-your-own-ai).

---

## Next Steps

- [How It Works](./HOW_IT_WORKS.md) — Understand the pipeline
- [FAQ](./FAQ.md) — Common questions
- [Providers Guide](./PROVIDERS.md) — Set up a translation provider or bring your own
- [Lingo.dev Setup](./LINGO_SETUP.md) — Lingo.dev account and dashboard settings
