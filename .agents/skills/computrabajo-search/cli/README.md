# computrabajo-cli

Zero-dependency CLI for searching Computrabajo Colombia (co.computrabajo.com). See `../SKILL.md`
for flags and examples, and `../url-reference.md` for the endpoints and parsing anchors.

```bash
bun install          # dev types only (TypeScript, @types/bun)
bun run src/cli.ts search -q "desarrollador full stack" -l "Medellín" --format table
bun run src/cli.ts detail <id> --format plain
bun run typecheck
bun run test         # includes one live search request
```

Personal use only: keep volume low.
