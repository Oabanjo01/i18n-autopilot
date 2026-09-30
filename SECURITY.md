# Security Policy

## Supported versions

Security fixes are released for the latest minor version on npm.

| Version | Supported |
| ------- | --------- |
| 1.1.x   | ✅        |
| < 1.1   | ❌        |

## Reporting a vulnerability

Please **don't** open a public issue for security problems.

Report privately through GitHub: go to the repository's **Security** tab →
**Report a vulnerability**
([direct link](https://github.com/Oabanjo01/i18n-autopilot/security/advisories/new)).
If you can't use GitHub, email **banjolakunri@gmail.com** with "SECURITY" in
the subject.

Please include:
- the affected version (`npx i18n-autopilot --version`)
- steps to reproduce, or a proof of concept
- the impact you believe it has

You'll get an acknowledgement within 5 days. Once a fix is released, the
advisory is published with credit to you, unless you'd rather stay
anonymous.

## Scope notes

i18n Autopilot rewrites source files and stores provider API keys in
`~/.i18n-autopilot/config.json` (readable only by your user). Issues in these
areas are especially welcome — for example, a way for a crafted project file
to make the CLI write outside the project, run code unexpectedly, or expose
stored credentials.
