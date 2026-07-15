
# Contributing to orangeboyChen/blog

Thank you for your interest in contributing to this personal blog, maintained by [orangeboyChen](https://github.com/orangeboyChen).

## Before You Start

If you plan to make major changes (especially new features or design changes), please open an issue or discussion before starting work. This helps ensure your effort aligns with the project's direction.

## Submitting Code

Please keep each pull request focused on a single purpose. Avoid mixing unrelated changes in one PR, as this can make reviewing and merging code more difficult.

Please use English [Conventional Commits](https://www.conventionalcommits.org/) messages. This keeps the history clear and consistent.

Do not commit or push directly to `main`. Create a feature branch and open a pull request instead.

Before committing, run the following checks and fix all reported issues.

```bash
pnpm exec biome ci ./src
pnpm check
```
