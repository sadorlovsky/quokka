---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Linting & Formatting

Use Biome for linting and formatting. Don't use ESLint or Prettier.

- `bun run lint` — check for lint errors
- `bun run lint:fix` — autofix lint errors
- `bun run format` — format code

Run `bun run lint:fix` after making changes to autofix formatting and lint issues.

## CSS

Don't use CSS Modules (`.module.css`) — they are broken with Bun's HMR dev server ([bun#18258](https://github.com/oven-sh/bun/issues/18258)). Use plain `.css` files with manual scoping via component-name prefixes:

- Prefix all class names with the component/module name: `.home-title`, `.home-brand`, `.game-logo`
- Use BEM-like modifiers: `.game-logo--selected`, `.game-logo--dimmed`
- CSS nesting is supported and encouraged — Bun transpiles it automatically
- Global utilities (`.btn`, `.input`, `.form`, `.layout`, `.screen`) live in `global.css`
- Design tokens use CSS custom properties in `:root` (`--color-primary`, `--radius-md`, etc.)

## Effect

Use `effect` library for error handling, retries, timeouts, and runtime type validation. Don't use `zod`, `yup`, `joi`, `io-ts`, or `superstruct`.

### Error Handling

Use `Effect` instead of try/catch for operations that can fail. Errors are tracked in the type system via the `E` parameter of `Effect<A, E, R>`.

```ts
import { Effect } from "effect"

class DivisionByZero {
  readonly _tag = "DivisionByZero"
}

const divide = (a: number, b: number): Effect.Effect<number, DivisionByZero> =>
  b === 0
    ? Effect.fail(new DivisionByZero())
    : Effect.succeed(a / b)
```

Use `Effect.tryPromise` to wrap async operations that can throw:

```ts
import { Effect } from "effect"

const fetchData = (url: string) =>
  Effect.tryPromise({
    try: () => fetch(url).then((r) => r.json()),
    catch: (error) => new FetchError({ cause: error }),
  })
```

### Retries & Timeouts

Use `Effect.retry` with `Schedule` for retry logic. Use `Effect.timeout` for timeouts. Don't write manual retry/timeout loops.

```ts
import { Effect, Schedule } from "effect"

// Retry up to 3 times with exponential backoff
const withRetry = Effect.retry(myEffect, Schedule.exponential("100 millis").pipe(
  Schedule.compose(Schedule.recurs(3))
))

// Timeout after 5 seconds
const withTimeout = Effect.timeout(myEffect, "5 seconds")
```

### Runtime Type Validation (Schema)

Use `effect/Schema` for runtime type validation, parsing, and encoding. Don't use `zod`, `yup`, or similar.

```ts
import { Schema } from "effect"

const User = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
})

type User = typeof User.Type

// Decode (parse + validate)
const parseUser = Schema.decodeUnknownSync(User)
const user = parseUser({ name: "Alice", age: 30 })

// For WebSocket messages
const GameAction = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("guess"),
    payload: Schema.Struct({ word: Schema.String }),
  }),
  Schema.Struct({
    type: Schema.Literal("skip"),
  }),
)
```

### Running Effects

Use `Effect.runPromise` for async effects, `Effect.runSync` for sync effects:

```ts
// Async
const result = await Effect.runPromise(myEffect)

// Sync
const result = Effect.runSync(myEffect)
```

### Composing Effects

Use `pipe` and `Effect.gen` (generator syntax) for composing effects:

```ts
import { Effect } from "effect"

// Generator syntax (preferred for sequential logic)
const program = Effect.gen(function* () {
  const user = yield* getUser(id)
  const posts = yield* getPosts(user.id)
  return { user, posts }
})

// Pipe syntax (preferred for transformations)
const program = myEffect.pipe(
  Effect.map((x) => x + 1),
  Effect.flatMap((x) => anotherEffect(x)),
  Effect.catchAll((error) => fallback),
)
```


## Git

НИКОГДА не выполняй `git commit`, `git push` или любые другие команды, изменяющие историю git, без явной команды пользователя. Это правило не имеет исключений.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
