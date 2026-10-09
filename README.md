# LiteClient.ts

**LiteClient.ts** is a minimalist, driver-agnostic ORM for SQLite: Generate table classes with [smake](https://github.com/ts-series/smake) and get a fluent, powerful and type-safe query API without abstractions that get in your way.

**→ [Reference](https://github.com/ts-series/lite-client/blob/main/REFERENCE.md)**


## Why LiteClient.ts

Most ORMs replace SQL with a leaky abstraction that eventually forces a drop down to raw strings anyway, alongside complex tooling, decorators, migration pipelines, and hard dependencies on specific SQLite drivers that leave little room to choose what actually fits a given project.

**LiteClient.ts** takes the opposite approach. The database schema serves as the single source of truth: running [smake](https://github.com/ts-series/smake) against a SQLite file generates a TypeScript class per table. Building on those classes, **LiteClient.ts** provides a query API that stays as close to SQL as TypeScript allows, with full type inference on results.

A query looks like this:

```ts
const rows = db.all({
	select: [Order.$id, Customer.$name, Order.$total] as const,
	from: Order.innerJoin(Order.$customerId, Customer.$id),
	where: Order.$status.equal("open").and(Order.$total.greater(100)),
	orderBy: Order.$total.desc,
	limit: 50
});
// rows: { id: number; name: string; total: number }[]
```

An entire SQL query is described through a single object whose keys map directly to SQL clauses, making the API immediately familiar to anyone who knows SQL. Queries are assembled from parts through plain object construction, which is far more efficient than the string concatenation or builder chains other ORMs impose.

Beyond full row objects, dedicated methods return scalar values directly, and any query can be nested into a keyed object instead of a flat array — more efficient than filtering or reshaping rows by hand afterward:

```ts
const total = db.scalar({
	select: Sql.sum(Order.$total),
	from: Order,
	where: Order.$status.equal("open")
});
// total: number

const names = db.scalars({
	select: [Customer.$id, Customer.$name] as const,
	from: Customer,
	nestBy: Customer.$id
});
// names: Record<number, string> — customer id → name
```

> The clause `groupBy` is derived from `nestBy` automatically, since nesting only makes sense on grouped data.

### Highlights

**Driver-agnostic by design.** LiteClient.ts contains no runtime calls specific to any SQLite driver or JavaScript platform. All driver differences are handled by a small adapter function passed in — typically a one-liner. The recommended drivers are [sqlite3](https://github.com/denodrivers/sqlite3) for Deno and [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for Node, both the fastest, synchronous options on their respective platforms since asynchronous access only adds overhead for a database that serializes all writes anyway.

**Schema-driven and always in sync.** Table classes are generated directly from the SQLite schema. Column names, types, nullability, and defaults are encoded in the class.

**Composable expressions.** Conditions, aggregates, and other expressions are built by chaining methods on column objects or SQL literals, or through the `Sql` namespace's static methods (`Sql.max`, `Sql.coalesce`, `Sql.derive`, …). All standard operators and SQLite's built-in functions are available and fully composable, including subqueries and derived tables.

**Interceptable execution.** Every query and mutation can be routed through an interceptor, set globally on the client or per call, to add retries, structured logging, read-only guards, or custom error handling without touching the core query logic.

**Result shapes for every use case.** Beyond `get`/`all`/`value`/`values`/`scalar`/`scalars`, a `nestBy` clause groups or keys any result into a nested object instead of a flat array, so you don't have to reshape rows by hand.

**Built-in caching layer.** `LiteCache` extends the base client with a simple in-memory cache. Ideal for reference data that changes rarely.


## Part of a Micro-Framework

LiteClient.ts is a standalone library but also one part of a small, cohesive set of tools for building lean, high-performance server-side applications:

- **[smake](https://github.com/ts-series/smake)** — generates typed table classes from a SQLite database
- **LiteClient.ts** — type-safe query layer on top of those classes
- **[HTML.ts](https://github.com/ts-series/factories)** — very efficient server-side HTML generation through composable factory functions
- **[Set.ts](https://github.com/ts-series/settings)** — reads application settings and manages translations, including pluralization and interpolation

Each library works independently, but together they cover the full backend stack without pulling in a heavy framework.


## Installation

### Deno

```ts
import { LiteClient } from "jsr:@ts-series/lite-client";
```

### Node.js

```bash
npm install @ts-series/lite-client
```


## License

Unlicense — see [unlicense.org](https://unlicense.org/).
