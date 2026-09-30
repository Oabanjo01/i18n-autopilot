# Contributing to i18n Autopilot

Thanks for helping! Bug reports, new translation providers, parser edge cases
and docs fixes are all welcome.

## Ground rules

- `main` is protected — every change lands through a pull request, and CI
  (type-check, tests, build) must pass before it can be merged.
- Please open an issue first for larger changes, so we can agree on the
  approach before you spend time on it.
- Be kind. This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting set up

Requires Node.js 22.13+ and Yarn 1. CI tests Node 22.13.0, the latest Node 22 and Node 24.

```bash
git clone https://github.com/Oabanjo01/i18n-autopilot.git
cd i18n-autopilot
yarn install
```

## Checking your change

```bash
npx tsc --noEmit -p .                      # type-check
yarn test                                  # unit + end-to-end tests (~5s)
npx ts-node tests/deep-rewriter.test.ts    # deep-mode regression script
yarn build                                 # compile to dist/
```

`yarn test` includes an end-to-end test that runs the real CLI against a copy
of the scenario app in `tests/fixtures/deep-analyzer-sample` (see its
`SCENARIOS.md`), with an offline fake provider — no API keys needed.

To try the CLI by hand without touching the tracked fixture:

```bash
yarn self-test
```

It copies the fixture to `.self-test/app` (gitignored) and starts the CLI in
`--deep` mode. MyMemory (option 7) works without an API key.

## What to include in a pull request

- **Tests** for new behaviour or bug fixes. For extraction or rewriting
  changes, add the case as a screen in the scenario fixture and an assertion
  in `tests/e2e.test.ts` — that's how most real bugs have been caught.
- **Docs** in `readme.md` and `docs/` when behaviour or flags change.
- **No version bump** unless a maintainer asks for one — see Releases below.

## Adding a translation provider

Providers implement one interface (`src/providers/types.ts`):

```ts
interface TranslationProvider {
  name: string;
  translate(data: Record<string, string>, sourceLocale: string, targetLocale: string):
    Promise<Record<string, string>>;
}
```

1. Add `src/providers/<name>.ts`. Return `{}` for empty input without calling
   the API, return exactly the input keys, and throw `ProviderError` on
   failure. AI providers should batch large inputs and fail clearly on
   truncated responses (see `openai.ts` and `claude.ts`).
2. Register it in `src/providers/registry.ts` and add its prompts in
   `bin/index.ts`.
3. Add tests to `tests/providers.test.ts` with the HTTP call or SDK mocked.
4. Document it in `docs/PROVIDERS.md`.

If you only need a provider for your own project, you don't need a PR — use
a [custom provider file](./docs/PROVIDERS.md#custom-provider--bring-your-own-ai).

## Releases

Releases are automated. When a pull request that changes `version` in
`package.json` is merged to `main`, the Release workflow publishes that
version to npm and creates the matching GitHub Release. Merges without a
version change publish nothing.

## Reporting security issues

Please don't open a public issue — see [SECURITY.md](./SECURITY.md).
