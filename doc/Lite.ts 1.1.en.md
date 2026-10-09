# Driver-Agnostic ORM through Synchronous Iterator Interface

**Goal:** Decouple `denodrivers/sqlite3` so that `LiteClient` works with any synchronous SQLite driver (Deno, Node/better-sqlite3, Bun) without having to provide an adapter itself.

Additionally, internal processing should be made more efficient by having get/all/values/value no longer rely on driver-specific methods, but instead work internally through a single synchronous iterator — meaning data retrieval, transformation, and JSON deserialization happen in a single pass instead of two consecutive loops; while `get` breaks after the first row without materializing the rest of the result set.

## New Connector Interface

TypeScript interfaces fix the required methods that every SQLite driver must provide:

```ts
export interface SqliteStatement {
	iterate(params?: unknown[]): Iterator<unknown>;
	run(params?: unknown[]): void;
	finalize(): void;
	readonly sql: string;
}

export interface SqliteConnector {
	prepare(sql: string): SqliteStatement;
	exec(sql: string): void;
	transaction(fn: () => void): () => void;
}
```

## Constructor Change

```ts
export class LiteClient {
	db: SqliteConnector;

	constructor(
		adapt: (path: string) => { db: SqliteConnector, prepare?: (sql: string) => SQLiteStatement },
		path: string
	) {
		this.db = adapt(path).db;
		…
	}
}
```

The database class is no longer inherited; instead a DB object created by the adapter is taken over (composition over inheritance) — but not hidden from the caller, so that native functions can still be accessed if needed (such as manually calling `close`). A type parameter can be used here to automatically infer the driver's interface:

```ts
export class LiteClient<DB extends SqliteConnector = SqliteConnector> extends SqlClient {

	db: DB;
	#prepare: (sql: string) => SQLiteStatement;
```

## Internal Operation

`#query` and `#select` exclusively use `iterate()` instead of `get/all/values/value`. `get/all/values/value` as public methods are preserved, but internally all implemented through a single private `#execute` helper:

```ts
#execute(method: ReturnMethod, sql: string, params?: unknown[]): unknown {
	const stmt = this.#db.prepare(sql);
	try {
		const rows: unknown[] = [];
		for (const row of { [Symbol.iterator]: () => stmt.iterate(params) }) {
			rows.push(row);
			if (method === ReturnMethod.get || method === ReturnMethod.value) break;
		}
		return method === ReturnMethod.get ? rows[0]
			: method === ReturnMethod.value ? Object.values(rows[0] as object)
			: method === ReturnMethod.values ? rows.map(r => Object.values(r as object))
			: rows;
	}
	finally {
		stmt.finalize();
	}
}
```

Transformers, JSON deserialization, etc. run directly in the same loop.

## Adapter for Each Driver

One thin wrapper function each:

```ts
// Deno
import { Database } from "jsr:@denodrivers/sqlite3";
export const denoAdapter = (path: string): { db: SqliteConnector } => {
	const db = new Database(path);
	return {
		db: {
			prepare: sql => {
				const stmt = db.prepare(sql);
				return {
					iterate: params => stmt.iterate(...(params ?? [])),
					run: params => void stmt.run(...(params ?? [])),
					finalize: () => stmt.finalize(),
					get sql() { return stmt.sql; }
				};
			},
			exec: sql => db.exec(sql),
			transaction: fn => db.transaction(fn)
		}
	};
};

// Node
import Database from "better-sqlite3";
export const nodeAdapter = (path: string): { db: SqliteConnector } => {
	const db = new Database(path);
	return {
		db: {
			prepare: sql => {
				const stmt = db.prepare(sql);
				return {
					iterate: params => stmt.raw(false).iterate(...(params ?? [])),
					run: params => void stmt.run(...(params ?? [])),
					finalize: () => {},
					get sql() { return stmt.source; }
				};
			},
			exec: sql => db.exec(sql),
			transaction: fn => db.transaction(fn)
		}
	};
};
```

SQLite drivers typically differ only slightly in the methods of the `Statement` object returned by `prepare`, which may necessitate an "adapter" in some cases.

## Details

- **What doesn't change:** `orm.ts` entirely, all clause interfaces, `expandSelection`, `expandWhereClause` and all other helper functions, all public methods of `LiteClient` (`get/all/values/value/insert/update/delete/collect/distinct`).

- **Why `iterate` instead of `get/all`:** `get/all` materialize all rows at once fully in memory — then a second loop runs for transformers, JSON deserialization, etc. With `iterate` there is only a single loop: rows are read one by one, immediately transformed, and written to the result — no double memory usage, no second iteration. Additionally, `iterate` allows early termination — for `get`, processing stops after the first row without reading the rest at all. This is more efficient than calling `all()` and then only taking `rows[0]`. The difference is negligible for small result sets, but the architecture is cleaner and scales better for larger queries.