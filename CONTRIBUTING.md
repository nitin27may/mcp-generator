# Contributing

The full guide lives at [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — building from source,
the verification chain every change has to pass, linking the CLI locally, and running the web
wizard.

This file exists so GitHub's contributor prompts find it.

Worth reading before a first change:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the packages and the boundaries between them.
  Eight of those boundaries are enforced on every push, so a change that crosses one fails CI
  rather than getting a review comment.
- [`docs/adr/`](docs/adr/) — ten decision records, eight mandatory. A pull request that violates
  a mandatory ADR is either rejected or amends the ADR; there is no third option.
- [`SECURITY.md`](SECURITY.md) — if what you found is a vulnerability, it does not go in a pull
  request or a public issue.
