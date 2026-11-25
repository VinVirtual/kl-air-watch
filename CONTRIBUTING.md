# Contributing

Thanks for helping. Keep changes small and focused.

1. Fork, then branch from `main`.
2. `npm ci` and `./check_env.sh`.
3. Make the change. Numbers that decide what is fetched, kept or alerted live in `scripts/lib/config.mjs`; the Method page is generated from them.
4. Run `npm test` (no network). If you touched pages, styles or charts, also run `./airwatch site && npm run test:e2e` (needs Chrome; set `AIRWATCH_CHROME` if it is not found).
5. Open a pull request saying what changed and why. CI runs the same tests.

House rules:

- No third-party requests from the built site, no inline scripts or styles (the build checks).
- Keep the Open-Meteo and Copernicus attribution on every page.
- Copy is short and plain, in English with Malay labels. No em dashes.
- Commit messages: `type: description` (feat, fix, docs, test, refactor, chore).

Found a security problem? Please open an issue without the details and ask for a private channel, or use GitHub's private vulnerability reporting if it is enabled.
