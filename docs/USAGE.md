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

### Dry Run Mode

Preview all changes without writing any files:
```bash
npx i18n-autopilot --dry-run
```

**What it does:**
- Shows what strings would be extracted
- Shows what keys would be generated
- Shows what files would be rewritten
- **Does NOT:** modify files, create locales, or call translation API

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
- Lingo.dev API key: Paste your key

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
- API key: (already saved, skipped)

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

# Lingo.dev temp files (auto-cleaned, but just in case)
i18n.json
i18n.lock
```

**Keep in Git:**
- `locales/*.json` — All translation files
- Modified source files — Show reviewers what changed

---

## Best Practices

### ✅ DO

- Run `--dry-run` first on large projects
- Commit before running (easy to revert if needed)
- Review diffs before pushing
- Add `.i18n-autopilot.json` to `.gitignore`
- Use custom component names if you have them

### ❌ DON'T

- Manually edit generated `en.json` (tool will overwrite on next run)
- Delete `.i18n-autopilot.json` unless you want to re-process everything
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

1. Edit `locales/en.json` directly
2. Run `npx i18n-autopilot`
3. Select **same languages** as before
4. Tool translates only changed/new keys

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

Delete config:
```bash
rm ~/.i18n-autopilot/config.json
npx i18n-autopilot
```

### "See detailed logs"

Check the log file:
```bash
cat ~/.i18n-autopilot/run.log
```

---

## Advanced Usage

### Programmatic Use

*(Coming soon)*
```typescript
import { runI18nAutopilot } from 'i18n-autopilot';

await runI18nAutopilot({
  projectPath: './my-app',
  targetLocales: ['es', 'fr-FR'],
  apiKey: process.env.LINGO_API_KEY,
  dryRun: false,
});
```

---

## Next Steps

- [How It Works](./HOW_IT_WORKS.md) — Understand the pipeline
- [FAQ](./FAQ.md) — Common questions
- [Lingo.dev Setup](./LINGO_SETUP.md) — Configure translation settings