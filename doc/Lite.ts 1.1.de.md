# Treiber-agnostisches ORM mittels synchroner Iterator-Schnittstelle

**Ziel:** Entkoppelung von `denodrivers/sqlite3`, damit `LiteClient` mit jedem synchronen SQLite-Treiber (Deno, Node/better-sqlite3, Bun) funktioniert, ohne selbst einen Adapter vorgeben zu müssen.

Zudem soll die interne Verarbeitung effizienter gestaltet werden, indem get/all/values/value nicht mehr auf treiberspezifische Methoden zurückgreifen, sondern intern einheitlich über einen synchronen Iterator arbeiten, wodurch Datenabruf, Transformation und JSON-Deserialisierung in einem einzigen Durchlauf statt in zwei aufeinanderfolgenden Schleifen stattfinden; während bei `get` nach der ersten Zeile sofort abgebrochen wird, ohne den Rest der Resultmenge zu materialisieren.

## Neue Konnektor-Schnittstelle

TypeScript-Interfaces fixieren die vorausgesetzten Methoden, welche jeder SQLite-Treiber mitbringen muss: 

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

## Konstruktor-Änderung

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

Die Datenbankklasse wird nicht mehr geerbt, stattdessen ein vom Adapter erstelltes DB-Objekt übernommen (Komposition statt Vererbung); aber nicht vor dem Aufrufer versteckt, damit bei Bedarf noch auf die nativen Funktionen zurückgegriffen werden kann (wie händisches Aufrufen von `close`). Hier bietet sich an, für diesen Zweck durch einen Typparameter automatisch die Schnittstelle des Treibers zu inferieren:

```ts
export class LiteClient<DB extends SqliteConnector = SqliteConnector> extends SqlClient {

	db: DB;
	#prepare: (sql: string) => SQLiteStatement;
```

## Internes Arbeiten

`#query` und `#select` nutzen ausschließlich `iterate()` statt `get/all/values/value`. `get/all/values/value` als öffentliche Methoden bleiben erhalten, sind aber intern alle über einen einzigen privaten `#execute`-Helfer implementiert:

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

Transformatoren, JSON-Deserialisierung etc. laufen direkt in derselben Schleife.

## Adapter für jeden Treiber

je eine dünne Wrapper-Funktion:

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

SQLite-Treiber unterscheiden sich meist nur geringfügig in den Methoden des mittels `prepare` zurückgegebenen `Statement`-Objekts, was ggf. einen „Adapter“ notwendig machen würde.

## Details

- **Was sich nicht ändert:** `orm.ts` komplett, alle Clause-Interfaces, `expandSelection`, `expandWhereClause` und alle anderen Hilfsfunktionen, alle öffentlichen Methoden von `LiteClient` (`get/all/values/value/insert/update/delete/collect/distinct`).

- **Warum `iterate` statt `get/all`:** `get/all` materialisieren alle Rows auf einmal vollständig im Speicher — danach läuft eine zweite Schleife für Transformatoren, JSON-Deserialisierung etc. Mit `iterate` gibt es nur eine einzige Schleife: Zeile für Zeile wird gelesen, sofort transformiert und ins Ergebnis geschrieben: kein doppelter Speicherverbrauch, keine zweite Iteration. Zusätzlich erlaubt `iterate` frühen Abbruch — für `get` wird nach der ersten Zeile gestoppt ohne den Rest überhaupt zu lesen. Das ist effizienter als `all()` aufzurufen und dann nur `rows[0]` zu nehmen. Der Unterschied ist bei kleinen Resultsets vernachlässigbar, aber die Architektur ist sauberer und skaliert besser für größere Queries.