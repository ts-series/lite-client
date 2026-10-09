
import { Interceptor } from "@ts-series/lite-client";
import { BaseClient } from "../standard/base-client.ts";

import { buildPragmaSQL, Pragmas } from "./pragmas.ts";
import { defaultInterceptor, InsertData, ReturnMethod } from "../standard/interception.ts";


// ADAPTER SPECIFICATION

export enum SQLiteFlags {
	OPEN_READWRITE = 0x00000002,
	OPEN_CREATE = 0x00000004,
	OPEN_URI = 0x00000040,
}


export interface SQLiteDatabase {
	prepare(sql: string): any;
	exec(sql: string): void;
	transaction(fn: () => void): () => void;
}


export interface SQLiteStatement {
	iterate(params?: unknown[]): Iterator<unknown>;
	run(params?: unknown[]): unknown;
	finalize(): void;
	readonly source?: string;
}


export interface SQLiteAdapter<DB extends SQLiteDatabase = SQLiteDatabase> {
	connection: DB;
	prepare?(sql: string): SQLiteStatement;
	renames?: Partial<Record<keyof SQLiteStatement, string>>;
}


// SQLITE-SPECIFIC CLIENT

export enum OnConflict {
	abort = "or abort",
	fail = "or fail",
	ignore = "or ignore",
	replace = "or replace",
	rollback = "or rollback"
}


export interface LiteClientOptions<DB extends SQLiteDatabase = SQLiteDatabase> {
	adapt: (path: string) => SQLiteAdapter<DB>;
	paths: string | { main: string; [schemaName: string]: string };
	pragmas?: Pragmas;
	debug?: boolean;
	intercept?: Interceptor;
	attachmentParams?: Record<string, string | number | boolean>;
}


export class LiteClient<DB extends SQLiteDatabase = SQLiteDatabase> extends BaseClient {

	connection: DB;
	#prepare: (sql: string) => SQLiteStatement;


	constructor(options: LiteClientOptions<DB>) {
		const {
			adapt,
			paths,
			pragmas = {},
			debug = false,
			intercept = defaultInterceptor,
			attachmentParams = { mode: "ro" }
		} = options;
	
		super(debug, intercept);
	
		const mainPath = typeof paths === "string" ? paths : paths.main;
		const adapter = adapt(mainPath);
	
		this.connection = adapter.connection;
	
		const iterateKey = adapter.renames?.iterate ?? "iterate";
		const runKey = adapter.renames?.run ?? "run";
		const finalizeKey = adapter.renames?.finalize ?? "finalize";
		const sourceKey = adapter.renames?.source ?? "source";
	
		this.#prepare = adapter.prepare ?? (sql => {
			const stmt = this.connection.prepare(sql) as any;
			return {
				iterate: (...params) => params.length > 0
					? stmt[iterateKey](...params)
					: stmt[Symbol.iterator](),
				run: (...params) => stmt[runKey](...params),
				finalize: () => stmt[finalizeKey](),
				get source() { return stmt[sourceKey]; }
			};
		});
	
		const pragmaSql = buildPragmaSQL(pragmas);
		if (pragmaSql) this.connection.exec(pragmaSql);
	
		if (typeof paths !== "string") {
			const { main, ...attachmentPaths } = paths;
			const query = Object.entries(attachmentParams).map(([key, val]) => `${key}=${val}`).join("&");
			for (const [name, path] of Object.entries(attachmentPaths)) {
				this.connection.exec(`attach database 'file:${path}${query ? `?${query}` : ""}' as ${name}`);
			}
		}

		Object.assign(this.values, {
			insertOrFail: (data: InsertData): undefined | unknown[][] =>
				this.__insert(ReturnMethod.values, data, OnConflict.fail) as any,

			insertOrIgnore: (data: InsertData): undefined | unknown[][] =>
				this.__insert(ReturnMethod.values, data, OnConflict.ignore) as any,

			insertOrReplace: (data: InsertData): undefined | unknown[][] =>
				this.__insert(ReturnMethod.values, data, OnConflict.replace) as any,

			insertOrRollback: (data: InsertData): undefined | unknown[][] =>
				this.__insert(ReturnMethod.values, data, OnConflict.rollback) as any
		});

		Object.assign(this.scalars, {
			insertOrFail: (data: InsertData): undefined | unknown[] =>
				(this.__insert(ReturnMethod.values, data, OnConflict.fail) as unknown[][] | undefined)?.map(row => row[0]),

			insertOrIgnore: (data: InsertData): undefined | unknown[] =>
				(this.__insert(ReturnMethod.values, data, OnConflict.ignore) as unknown[][] | undefined)?.map(row => row[0]),

			insertOrReplace: (data: InsertData): undefined | unknown[] =>
				(this.__insert(ReturnMethod.values, data, OnConflict.replace) as unknown[][] | undefined)?.map(row => row[0]),

			insertOrRollback: (data: InsertData): undefined | unknown[] =>
				(this.__insert(ReturnMethod.values, data, OnConflict.rollback) as unknown[][] | undefined)?.map(row => row[0])
		});
	}


	// SQLITE-SPECIFIC MUTATION METHODS

	insertOrFail(data: InsertData): undefined | object[] {
		return this.__insert(ReturnMethod.all, data, OnConflict.fail) as any;
	}

	insertOrIgnore(data: InsertData): undefined | object[] {
		return this.__insert(ReturnMethod.all, data, OnConflict.ignore) as any;
	}

	insertOrReplace(data: InsertData): undefined | object[] {
		return this.__insert(ReturnMethod.all, data, OnConflict.replace) as any;
	}

	insertOrRollback(data: InsertData): undefined | object[] {
		return this.__insert(ReturnMethod.all, data, OnConflict.rollback) as any;
	}


	declare values: BaseClient["values"] & {
		insertOrFail(data: InsertData): undefined | unknown[][];
		insertOrIgnore(data: InsertData): undefined | unknown[][];
		insertOrReplace(data: InsertData): undefined | unknown[][];
		insertOrRollback(data: InsertData): undefined | unknown[][];
	};

	declare scalars: BaseClient["scalars"] & {
		insertOrFail(data: InsertData): undefined | unknown[];
		insertOrIgnore(data: InsertData): undefined | unknown[];
		insertOrReplace(data: InsertData): undefined | unknown[];
		insertOrRollback(data: InsertData): undefined | unknown[];
	};


	// INTERNAL IMPLEMENTATION

	protected placeholder(_: number): string {
		return "?";
	}


	protected execute(method: ReturnMethod, sql: string, params: unknown[] = []): unknown {
		const wantOne = method === ReturnMethod.get || method === ReturnMethod.value || method === ReturnMethod.scalar;
		const wantValues = method === ReturnMethod.value || method === ReturnMethod.values;
		const wantScalar = method === ReturnMethod.scalar || method === ReturnMethod.scalars;
	
		const stmt = this.#prepare(sql);
	
		try {
			const iter = stmt.iterate(params);
			const iterable: Iterable<unknown> = { [Symbol.iterator]: () => iter };
			const rows: unknown[] = [];
	
			for (const r of iterable) {
				const row = r as Record<string, unknown>;
	
				if (wantScalar) {
					for (const key in row) {
						rows.push(row[key]);
						break;
					}
				}
				else {
					rows.push(wantValues ? Object.values(row) : row);
				}
	
				if (wantOne) break;
			}
	
			return wantOne ? rows[0] : rows;
		}
		finally {
			stmt.finalize();
		}
	}


	protected executeMany(sql: string, rows: unknown[][]): void {
		const stmt = this.#prepare(sql);

		try {
			this.connection.transaction(() => {
				for (const row of rows) stmt.run(row);
			})();
		}
		finally {
			try { stmt.finalize() } catch (_) { /* pass */ }
		}
	}


	protected executeManyReturning(
		sql: string,
		rows: unknown[][],
		method: ReturnMethod.all | ReturnMethod.values
	): unknown[] {
		const stmt = this.#prepare(sql);
		const wantValues = method === ReturnMethod.values;
		const results: unknown[] = [];

		try {
			this.connection.transaction(() => {
				for (const row of rows) {
					const iter = stmt.iterate(row);
					const iterable: Iterable<unknown> = { [Symbol.iterator]: () => iter };
					for (const r of iterable) {
						const out = r as Record<string, unknown>;
						results.push(wantValues ? Object.values(out) : out);
					}
				}
			})();
		}
		finally {
			try { stmt.finalize() } catch (_) { /* pass */ }
		}

		return results;
	}


	protected executeRaw(sql: string, params: unknown[] = []): unknown {
		const stmt = this.#prepare(sql);
	
		try {
			return stmt.run(params);
		}
		finally {
			stmt.finalize();
		}
	}
}
