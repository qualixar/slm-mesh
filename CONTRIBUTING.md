# Contributing to SLM Mesh

Thank you for your interest in contributing.

## Development Setup

```bash
git clone https://github.com/qualixar/slm-mesh.git
cd slm-mesh
npm install
```

## Development Commands

```bash
npm test           # Run 480 tests
npm run typecheck  # TypeScript check (0 errors required)
npm run build      # Production build
npm run dev        # Run in development mode
npm run test:watch # Watch mode
npm run test:coverage # Coverage report
```

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Write tests first (TDD — we require 100% line coverage)
4. Make your changes
5. Run `npm test` and `npm run typecheck`
6. Commit with conventional commits: `feat: add new feature`
7. Open a pull request

## Code Standards

- **TypeScript strict mode** — all strict checks enabled
- **100% line coverage** — no exceptions
- **Functions under 50 lines** — extract helpers for larger logic
- **Files under 800 lines** — split into modules
- **Immutable patterns** — create new objects, don't mutate
- **No `any` types** — use proper typing or `unknown` + runtime validation
- **Error handling** — never swallow errors silently

## Commit Messages

Format: `<type>: <description>`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`

## Testing

We practice TDD:

1. Write the test (RED — it fails)
2. Write minimal code (GREEN — it passes)
3. Refactor (IMPROVE — clean up)

Run coverage: `npm run test:coverage`

## What to Contribute

- Bug fixes (with reproducing test)
- Documentation improvements
- Agent detection patterns (new AI agents)
- Performance improvements (with benchmarks)
- Adapter implementations (Redis, PostgreSQL, etc.)

## What Not to Contribute

- New MCP tools (the 8-tool surface is intentional — each tool consumes agent context)
- Breaking changes to existing tool interfaces
- External dependencies (we target zero runtime deps beyond Node.js built-ins + better-sqlite3 + MCP SDK)

## License

By contributing, you agree that your contributions will be licensed under the Elastic License 2.0.
