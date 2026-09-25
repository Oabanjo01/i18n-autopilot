# Scenario fixture

A small React Native app covering the cases i18n Autopilot must handle — or
deliberately leave alone. `tests/e2e.test.ts` runs the real CLI against a copy
of this folder and checks every outcome below; `yarn self-test` gives you a
fresh copy to try by hand.

**Answers used by the tests:** languages `es` + `fr-FR`, custom Text components
`ThemedText, AppText`, flag `--deep`.

## Translated

| File | Scenario | Expected |
| --- | --- | --- |
| `screens/BasicText.tsx` | Plain text, `{"literal"}`, `` {`template`} ``, multi-line text, `<Text>` nested in `<Text>` | All extracted. Multi-line text collapses to one line (`"This sentence is split across two lines"`). The space in `Terms apply. <Text>…` survives the rewrite |
| `screens/CustomText.tsx` | `ThemedText`, `AppText` (entered at the prompt), `Label` (not entered) | ThemedText/AppText rewritten; `<Label>` untouched |
| `screens/KeyCollisions.tsx` | Two strings sharing a key base; the same string twice | `get_started_your` + `get_started_your_2`; both `Save` use one `save` key |
| `screens/ComponentShapes.tsx` | Implicit-return arrow, block arrow, function declaration — three components in one file | Each gets its own `useTranslation()`; the implicit arrow is converted to a block body |
| `screens/AlreadyTranslated.tsx` | Already imports and calls `useTranslation` | Only the new literal converted; no duplicate import or hook |
| `hooks/useGreeting.ts` | `useState("Welcome back")`, `useState("idle")` | Greeting translated; `"idle"` (a state value) left alone |
| `screens/Pattern*.tsx` | The 8 `--deep` object/array/Map patterns | Container strings translated; routes/IDs untouched |

## Left alone (files stay byte-for-byte identical)

| File | Why |
| --- | --- |
| `screens/ClassComponent.tsx` | Class components can't use hooks — not extracted, not rewritten |
| `screens/NotTranslated.tsx` | Numbers, punctuation, single characters, interpolated templates, `testID`, and `placeholder`/`accessibilityLabel` (not supported yet) |
| `screens/BasicText.test.tsx` | Test files are skipped |
| `constants/copy.tsx` | `constants/` is skipped |
| `components/Typography.tsx`, `App.tsx` | No literal text |

## Later runs

1. **Run again with no changes** — every file reported unchanged; both locales "up to date"; no provider calls.
2. **Edit a value in `locales/en.json`** — the CLI asks to re-translate the changed string. **No** keeps the old translation and asks again next time; **Yes** re-translates only that key.
3. **Add a new screen with `<Text>Get started with your adventure</Text>`** — it gets `get_started_your_3`; existing English is untouched.
4. **`--dry-run`** — reports what it would do and writes nothing.
