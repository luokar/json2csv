# Vite+ Essentials

Use the `vp` CLI for all tasks. Never use npm/pnpm/yarn directly.

## Daily Commands

- `vp i` - Install dependencies
- `vp dev` - Start dev server
- `vp test` - Run Vitest
- `vp check` - Run format, lint, and type checks
- `vp build` - Production build
- `vp run <name>` - Run custom package.json scripts

## Dependencies

- `vp add <pkg>` - Add package
- `vp rm <pkg>` - Remove package
- `vp up` - Update packages
- `vp dlx <pkg>` - Run one-off binary (npx replacement)

## Critical Rules

- **Imports**: Use `import { ... } from 'vite-plus'` or `vite-plus/test`.
- **No Manual Installs**: Do not install `vitest`, `oxlint`, or `vite` manually.
- **Conflicts**: `vp dev` and `vp test` always run internal tools. Use `vp run <name>` for custom scripts with the same name.
