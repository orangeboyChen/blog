# Repository Guidelines

## Git and Pull Requests

- Do not commit or push directly to `main`.
- Create a focused feature branch for every change and submit it through a pull request.
- Keep each pull request limited to one purpose and avoid unrelated cleanup.
- Use English Conventional Commit messages, for example: `feat: add project timeline`.
- Before committing, run `pnpm exec biome ci ./src` and fix all lint and formatting errors.
- Do not create a commit until the lint command passes.

## Astro and TypeScript

- Prefer TypeScript for new source files, utilities, content data, and configuration.
- Use Astro components for static page structure; introduce client-side framework components only when interactivity requires them.
- Keep component props typed and reuse the project's existing path aliases and shared utilities.
- Preserve the existing content-collection and frontmatter conventions when adding posts or pages.
- Do not add dependencies when the existing Astro, TypeScript, or CSS tooling can solve the problem.

## Style and Validation

- Follow the existing Biome formatting and import-order rules; do not hand-format around them.
- Run `pnpm check` after changes that affect Astro components, content schemas, or TypeScript types.
- Do not edit generated output, dependency directories, or local caches such as `dist/`, `node_modules/`, `.astro/`, and `.pnpm-store/`.
