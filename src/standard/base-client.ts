
import {
	buildSelection,
	DeleteClauses,
	DerivedSelect,
	EntryOf,
	expandOnConflict,
	expandPostClauses,
	expandReturnClause,
	expandWhereClause,
	InsertClauses,
	KeyNames,
	NestByClause,
	NestedByObject,
	RowFromColumns,
	RowFromDerivedSelect,
	Selectables,
	SelectClauses,
	Selection,
	selectionNames,
	SingleRowClauses,
	UpdateClauses
} from "./clauses.ts";

import { Column } from "./column.ts";
import {
	Interceptor,
	defaultInterceptor,
	ReturnMethod,
	OperationKind,
	DeleteData,
	InsertData,
	UpdateData
} from "./interception.ts";

import { toSql } from "./sql-expression.ts";
import { Sql } from "./sql.ts";
import { TableObject, Table } from "./table.ts";


//

export type MutationResult = undefined | unknown[] | Record<PropertyKey, unknown>;


export interface ValuesMethod {
	(col: Column): unknown[][];
	(table: Table): unknown[][];
	(clauses: SelectClauses): unknown[][];
	(sql: string, ...params: unknown[]): unknown[][];
	(first: Column, ...rest: Column[]): unknown[][];
	insert(data: InsertData): undefined | unknown[][];
	update(data: UpdateData): undefined | unknown[][];
	delete(data: DeleteData): undefined | unknown[][];
}


export interface ScalarsMethod {
	<T>(clauses: SelectClauses & { nestBy: NestByClause }): T;
	<V = unknown>(table: Table): V[];
	<V = unknown>(clauses: SelectClauses): V[];
	<V = unknown>(sql: string, ...params: unknown[]): V[];
	insert(data: InsertData): undefined | unknown[];
	update(data: UpdateData): undefined | unknown[];
	delete(data: DeleteData): undefined | unknown[];
}


//

/** Abstract SQL client providing database-agnostic query and mutation methods. */
export abstract class BaseClient {

	#debugging: boolean;
	#intercept: Interceptor;


	constructor(
		debug: boolean = false,
		intercept: Interceptor = defaultInterceptor
	) {
		this.#debugging = debug;
		this.#intercept = intercept;
	}


	/** Executes a SQL statement and returns rows according to the requested method. */
	protected abstract execute(method: ReturnMethod, sql: string, params?: unknown[]): unknown;

	/** Executes a SQL statement repeatedly within a transaction without returning rows. */
	protected abstract executeMany(sql: string, rows: unknown[][]): void;

	/** Executes a SQL statement repeatedly within a transaction, collecting returned rows. */
	protected abstract executeManyReturning(sql: string, rows: unknown[][], method: ReturnMethod.all | ReturnMethod.values): unknown[];

	protected abstract executeRaw(sql: string, params?: unknown[]): unknown;

	/** Returns the placeholder format for the given parameter index (1-based). */
	protected abstract placeholder(index: number): string;


	// — QUERY METHODS

	get<T extends Table>(table: T): EntryOf<T> | undefined;
	get<T extends Table>(clauses: SingleRowClauses<T>): EntryOf<T> | undefined;
	get<Cols extends Selectables>(clauses: SingleRowClauses<Cols>): RowFromColumns<Cols> | undefined;
	get<T = any>(table: Table): T | undefined;
	get<T = any>(first: Column, ...rest: Column[]): T | undefined;
	get<T = any>(clauses: SingleRowClauses): T | undefined;
	get<T = any>(sql: string, ...params: unknown[]): T | undefined;
	get(sqlOrSelection: string | SingleRowClauses | Table | Column, ...rest: unknown[]): unknown {
		if (typeof sqlOrSelection === "string") {
			return this.execute(ReturnMethod.get, sqlOrSelection, rest);
		}
		else if (TableObject.isTable(sqlOrSelection)) {
			return this.__select(ReturnMethod.get, { select: sqlOrSelection });
		}
		else if (sqlOrSelection instanceof Column) {
			return this.__select(ReturnMethod.get, { select: [sqlOrSelection, ...rest as Column[]] });
		}
		else {
			return this.__select(ReturnMethod.get, sqlOrSelection);
		}
	}


	all<const S extends Selectables, const Keys extends readonly (Column | string)[]>(
		clauses: SelectClauses<S> & { nestBy: Keys }
	): NestedByObject<RowFromColumns<S>, KeyNames<Keys>>;
	all<S extends DerivedSelect, const Keys extends readonly (Column | string)[]>(
		clauses: SelectClauses<S> & { nestBy: Keys }
	): NestedByObject<RowFromDerivedSelect<S>, KeyNames<Keys>>;
	all<T extends Table, const Keys extends readonly (Column | string)[]>(
		clauses: SelectClauses<T> & { nestBy: Keys }
	): NestedByObject<EntryOf<T>, KeyNames<Keys>>;
	all<T extends Table>(table: T): EntryOf<T>[];
	all<T extends Table>(clauses: SelectClauses<T>): EntryOf<T>[];
	all<Cols extends Selectables>(clauses: SelectClauses<Cols>): RowFromColumns<Cols>[];
	all<T = any>(table: Table): T[];
	all<T = any>(first: Column, ...rest: Column[]): T[];
	all<T = any>(clauses: SelectClauses): T[];
	all<T = any>(sql: string, ...params: unknown[]): T[];
	all(sqlOrSelection: string | SelectClauses | Table | Column, ...rest: unknown[]): unknown {
		if (typeof sqlOrSelection === "string") {
			return this.execute(ReturnMethod.all, sqlOrSelection, rest);
		}
		else if (TableObject.isTable(sqlOrSelection)) {
			return this.__select(ReturnMethod.all, { select: sqlOrSelection });
		}
		else if (sqlOrSelection instanceof Column) {
			return this.__select(ReturnMethod.all, { select: [sqlOrSelection, ...rest as Column[]] });
		}
		else {
			return this.__select(ReturnMethod.all, sqlOrSelection);
		}
	}


	value(table: Table): unknown[] | undefined;
	value(clauses: SingleRowClauses): unknown[] | undefined;
	value(sql: string, ...params: unknown[]): unknown[] | undefined;
	value(first: Column, ...rest: Column[]): unknown[] | undefined;
	value(sqlOrSelection: string | SingleRowClauses | Table | Column, ...rest: unknown[]): unknown {
		if (typeof sqlOrSelection === "string") {
			return this.execute(ReturnMethod.value, sqlOrSelection, rest);
		}
		else if (TableObject.isTable(sqlOrSelection)) {
			return this.__select(ReturnMethod.value, { select: sqlOrSelection });
		}
		else if (sqlOrSelection instanceof Column) {
			return this.__select(ReturnMethod.value, { select: [sqlOrSelection, ...rest as Column[]] });
		}
		else {
			return this.__select(ReturnMethod.value, sqlOrSelection);
		}
	}


	values: ValuesMethod = Object.assign(
		((sqlOrSelection: string | SelectClauses | Table | Column, ...rest: unknown[]): unknown[][] => {
			if (typeof sqlOrSelection === "string") {
				return this.execute(ReturnMethod.values, sqlOrSelection, rest) as any;
			}
			else if (TableObject.isTable(sqlOrSelection)) {
				return this.__select(ReturnMethod.values, { select: sqlOrSelection }) as any;
			}
			else if (sqlOrSelection instanceof Column) {
				return this.__select(ReturnMethod.values, { select: [sqlOrSelection, ...rest as Column[]] }) as any;
			}
			else {
				return this.__select(ReturnMethod.values, sqlOrSelection) as any;
			}
		}), {
			insert: (data: InsertData): undefined | unknown[][] =>
				this.__insert(ReturnMethod.values, data) as any,
	
			update: (data: UpdateData): undefined | unknown[][] =>
				this.__update(data, ReturnMethod.values) as any,
	
			delete: (data: DeleteData): undefined | unknown[][] =>
				this.__delete(data, ReturnMethod.values) as any
		}
	);


	scalar<V = unknown>(clauses: SingleRowClauses): V | undefined;
	scalar<V = unknown>(sql: string, ...params: unknown[]): V | undefined;
	scalar<V = unknown>(sqlOrSelection: string | SingleRowClauses, ...rest: unknown[]): V | undefined {
		if (typeof sqlOrSelection === "string") {
			return this.execute(ReturnMethod.scalar, sqlOrSelection, rest) as V | undefined;
		}
		else {
			return this.__select(ReturnMethod.scalar, sqlOrSelection) as V | undefined;
		}
	}


	scalars: ScalarsMethod = Object.assign(
		((sqlOrSelection: string | SelectClauses | Table, ...rest: unknown[]): unknown[] | Record<PropertyKey, unknown> => {
			if (typeof sqlOrSelection === "string") {
				return this.execute(ReturnMethod.scalars, sqlOrSelection, rest) as unknown[];
			}
			else if (TableObject.isTable(sqlOrSelection)) {
				return this.__select(ReturnMethod.scalars, { select: sqlOrSelection }) as unknown[];
			}
			else {
				return this.__select(ReturnMethod.scalars, sqlOrSelection) as unknown[] | Record<PropertyKey, unknown>;
			}
		}) as unknown as ScalarsMethod, {
			insert: (data: InsertData): undefined | unknown[] =>
				(this.__insert(ReturnMethod.values, data) as unknown[][] | undefined)?.map(row => row[0]),

			update: (data: UpdateData): undefined | unknown[] =>
				(this.__update(data, ReturnMethod.values) as unknown[][] | undefined)?.map(row => row[0]),

			delete: (data: DeleteData): undefined | unknown[] =>
				(this.__delete(data, ReturnMethod.values) as unknown[][] | undefined)?.map(row => row[0])
		}
	);


	// — MUTATION METHODS

	insert(data: InsertData): undefined | object[] {
		return this.__insert(ReturnMethod.all, data) as any;
	}

	update(data: UpdateData): undefined | object[] {
		return this.__update(data, ReturnMethod.all) as any;
	}

	delete(data: DeleteData): undefined | object[] {
		return this.__delete(data, ReturnMethod.all) as any;
	}


	run(sql: string, ...params: unknown[]): unknown {
		return this.#intercept(
			{ kind: OperationKind.raw, sql, params, debugging: this.#debugging },
			() => this.executeRaw(sql, params)
		);
	}


	// — INTERNAL IMPLEMENTATION

	protected __select(method: ReturnMethod, clauses: SelectClauses): unknown {
		const wantOne =
			   method === ReturnMethod.get
			|| method === ReturnMethod.value
			|| method === ReturnMethod.scalar;
		const nestBy = clauses.nestBy;
		const execMethod = nestBy && method === ReturnMethod.scalars ? ReturnMethod.values : method;
		const sql = buildSelection(wantOne ? { ...clauses, limit: 1 } : clauses);
		const intercept = clauses.intercept ?? this.#intercept;
	
		const result = intercept(
			{ kind: OperationKind.select, method: execMethod, sql, debugging: this.#debugging },
			() => this.execute(execMethod, sql)
		);
	
		if (!nestBy || wantOne) return result;
	
		const keys = resolveNestKeys(clauses.selectDistinct ?? clauses.select!, nestBy);
		const leaf = method === ReturnMethod.all ? "object" : method === ReturnMethod.values ? "array" : "scalar";
	
		return nestRows(result as unknown[], keys, leaf);
	}


	protected __insert(
		method: ReturnMethod.all | ReturnMethod.values,
		data: InsertData,
		modifier?: string
	): MutationResult {
		let table: typeof TableObject;
		let columns: Column[];

		const clauses: InsertClauses = data.constructor === Object && "values" in data
			? data as InsertClauses
			: { values: data as TableObject | TableObject[] };

		const [firstObj, objects] = clauses.values instanceof Object && !Array.isArray(clauses.values)
			? [clauses.values, [clauses.values]]
			: areObjects(clauses.values)
				? [clauses.values[0], clauses.values]
				: [null, null];

		if (clauses.into) {
			if (TableObject.isTable(clauses.into)) {
				table = clauses.into;
				columns = firstObj
					? table.columns.filter(col => firstObj[col.name as keyof typeof firstObj] !== undefined)
					: table.columns;
			}
			else if (areColumns(clauses.into)) {
				columns = clauses.into;
				table = clauses.into[0].table;
			}
			else {
				throw new Error(`insert — invalid \`into\` clause\n\ndata = ${JSON.stringify(data, undefined, 4)}`);
			}
		}
		else if (firstObj instanceof TableObject) {
			table = firstObj.constructor as typeof TableObject;
			columns = table.columns.filter(col => firstObj[col.name as keyof typeof firstObj] !== undefined);
		}
		else {
			throw new Error(`insert — cannot infer table, provide \`into\` clause\n\ndata = ${JSON.stringify(data, undefined, 4)}`);
		}

		const columnNames = columns.map(c => c.name);
		let rows: unknown[][];

		if (objects) {
			rows = objects.map((record, recordNr) => columnNames.map(name => {
				if (record[name as keyof typeof record] !== undefined) {
					return record[name as keyof typeof record];
				}
				else {
					const col = (table as any)[`$${name}`] as Column;
					if (col.knownDefault) {
						return col.knownDefault;
					}
					else if (col.nullable) {
						return null;
					}
					else {
						throw new Error(`insert — no value provided for column \`${name}\`\n\ndata[${recordNr}] = ${JSON.stringify(record, undefined, 4)}`);
					}
				}
			}));
		}
		else {
			rows = (clauses.values as unknown[][]).map((record, recordNr) => record.map((value, colNr) => {
				if (value !== undefined) {
					return value;
				}
				else if (columns[colNr].knownDefault) {
					return columns[colNr].knownDefault;
				}
				else if (columns[colNr].nullable) {
					return null;
				}
				else {
					throw new Error(`insert — no value provided for column \`${columnNames[colNr]}\`\n\ndata[${recordNr}] = ${JSON.stringify(record, undefined, 4)}`);
				}
			}));
		}

		if (!rows.every(row => row.length === columnNames.length)) {
			const badRow = rows.findIndex(row => row.length !== columnNames.length);
			throw new Error(
				`row ${badRow} has ${rows[badRow].length} values, expected ${columnNames.length} (${columnNames.join(", ")})\n\n` +
				`row[${badRow}] = ${JSON.stringify(rows[badRow])}`
			);
		}

		const mod = modifier ? ` ${modifier}` : "";
		const placeholders = columns.map((_, i) => this.placeholder(i + 1)).join(", ");
		let sql = `insert${mod} into ${table.physicalName} (${columns.map(c => c.physicalName).join(", ")}) values (${placeholders})`;

		if (clauses.onConflict !== undefined) sql += expandOnConflict(clauses.onConflict, columns);

		//
		const intercept = clauses.intercept ?? this.#intercept;

		if (clauses.returning) {
			sql += expandReturnClause(clauses.returning);
			const result = intercept(
				{ kind: OperationKind.insert, method: method, sql, data: clauses, debugging: this.#debugging },
				() => this.executeManyReturning(sql, rows, method)
			);
			return clauses.nestBy
				? nestRows(
					result,
					resolveNestKeys(clauses.returning, clauses.nestBy),
					method === ReturnMethod.all ? "object" : "array"
				)
				: result;
		}
		else {
			intercept(
				{ kind: OperationKind.insert, sql, data: clauses, debugging: this.#debugging },
				() => this.executeMany(sql, rows)
			);
			return undefined;
		}
	}


	protected __update(
		data: UpdateData,
		method: ReturnMethod.all | ReturnMethod.values
	): MutationResult {
		let clauses: UpdateClauses;

		if (data instanceof TableObject) {
			clauses = { table: data.table, set: data, where: data.uniqueCondition };
		}
		else if ((data as UpdateClauses).table) {
			clauses = data as UpdateClauses;
		}
		else if ((data as UpdateClauses).where instanceof TableObject) {
			clauses = { table: ((data as UpdateClauses).where as TableObject).table, ...(data as UpdateClauses) };
		}
		else {
			throw new Error("update — cannot infer table, provide `table` clause");
		}

		let sql = `update ${clauses.table!.physicalName} set ${Object.entries(clauses.set)
			.filter(([_, val]) => val !== undefined)
			.map(([col, val]) => `${clauses.table!.getPhysicalName(col)} = ${toSql(val)}`)
			.join(", ")}`;

		if (clauses.where) sql += expandWhereClause(clauses.table!, clauses.where);

		const intercept = clauses.intercept ?? this.#intercept;

		if (clauses.returning) {
			sql = expandPostClauses(sql, clauses);
			sql += expandReturnClause(clauses.returning);
			const result = intercept(
				{ kind: OperationKind.update, method: method, sql, data: clauses, debugging: this.#debugging },
				() => this.execute(method, sql) as unknown[]
			);
			return clauses.nestBy
				? nestRows(result, resolveNestKeys(clauses.returning, clauses.nestBy), method === ReturnMethod.all ? "object" : "array")
				: result;
		}
		else {
			sql = expandPostClauses(sql, clauses);
			intercept(
				{ kind: OperationKind.update, sql, data: clauses, debugging: this.#debugging },
				() => this.execute(method, sql)
			);
			return undefined;
		}
	}


	protected __delete(
		data: DeleteData,
		method: ReturnMethod.all | ReturnMethod.values
	): MutationResult {
		let table: typeof TableObject;

		const clauses = TableObject.isTable(data)
			? { from: data }
			: data instanceof TableObject
				? { where: data }
				: data as DeleteClauses;

		if (clauses.from) {
			table = clauses.from;
		}
		else if (clauses.where instanceof TableObject) {
			table = clauses.where.table;
		}
		else {
			throw new Error("delete — cannot infer table, provide `from` clause");
		}

		let sql = `delete from ${table.physicalName}`;

		if (clauses.where) sql += expandWhereClause(table, clauses.where);

		const intercept = clauses.intercept ?? this.#intercept;

		if (clauses.returning) {
			sql = expandPostClauses(sql, clauses);
			sql += expandReturnClause(clauses.returning);
			const result = intercept(
				{ kind: OperationKind.delete, method: method, sql, data: clauses, debugging: this.#debugging },
				() => this.execute(method, sql) as unknown[]
			);
			return clauses.nestBy
				? nestRows(result, resolveNestKeys(clauses.returning, clauses.nestBy), method === ReturnMethod.all ? "object" : "array")
				: result;
		}
		else {
			sql = expandPostClauses(sql, clauses);
			intercept(
				{ kind: OperationKind.delete, sql, data: clauses, debugging: this.#debugging },
				() => this.execute(method, sql)
			);
			return undefined;
		}
	}
}


//

type TransformEntry = { name: string; fn: (v: unknown) => unknown };


/** Mutates the row in place — deserializes JSON columns and applies transforms. */
function materialize(
	row: Record<string, unknown>,
	jsonCols: ReadonlySet<string>,
	transforms: TransformEntry[] | null
): void {
	if (jsonCols.size > 0) {
		for (const name of jsonCols) {
			if (typeof row[name] === "string") {
				row[name] = JSON.parse(row[name] as string);
			}
		}
	}
	if (transforms) {
		for (const { name, fn } of transforms) {
			if (name in row) row[name] = fn(row[name]);
		}
	}
}


/** Collects the names of JSON-typed columns in the given selection. */
function jsonColumnsOf(selection: Selection): Set<string> {
	const names = new Set<string>();

	if (TableObject.isTable(selection)) {
		for (const col of selection.columns)
			if (col.isJson) names.add(col.name);
	}
	else {
		for (const item of selection as (Column | Sql)[])
			if (item instanceof Column && item.isJson) names.add(item.name);
	}

	return names;
}


/** Resolves a nestBy specification into positional column indices within the given selection. */
function resolveNestKeys(selection: Selection | DerivedSelect, nestBy: NestByClause): number[] {
	const keys = Array.isArray(nestBy) ? nestBy : [nestBy];
	const names = selectionNames(selection);

	return keys.map(key => {
		const name = key instanceof Column ? key.name : key;
		const matches = names.reduce<number[]>((acc, n, i) => n === name ? [...acc, i] : acc, []);

		if (matches.length === 0) throw new Error(
			`nestBy — column \`${name}\` not found in select clause (available: ${names.join(", ")})`
		);
		if (matches.length > 1) throw new Error(
			`nestBy — column \`${name}\` is ambiguous, appears ${matches.length} times in select clause; use an explicit alias`
		);

		return matches[0];
	});
}


/** Groups flat rows into a nested Record structure using the given key positions. */
function nestRows(rows: unknown[], keyIndices: number[], leaf: "object" | "array" | "scalar"): Record<PropertyKey, unknown> {
	const result: Record<PropertyKey, unknown> = {};
	const keySet = new Set(keyIndices);

	for (const row of rows as any[]) {
		const isArrayRow = Array.isArray(row);
		const names = isArrayRow ? null : Object.keys(row);

		const keyValues = keyIndices.map(i => isArrayRow ? row[i] : row[names![i]]);

		let node = result;
		for (let i = 0; i < keyValues.length - 1; i++) {
			node = (node[keyValues[i] as PropertyKey] ??= {}) as Record<PropertyKey, unknown>;
		}

		const lastKey = keyValues[keyValues.length - 1] as PropertyKey;
		const restIndices = (isArrayRow ? row.map((_: unknown, i: number) => i) : names!.map((_, i) => i))
			.filter((i: number) => !keySet.has(i));

		if (leaf === "object") {
			const remainder: Record<string, unknown> = {};
			for (const i of restIndices) remainder[names![i]] = row[names![i]];
			node[lastKey] = remainder;
		}
		else if (leaf === "array") {
			node[lastKey] = restIndices.map((i: number) => row[i]);
		}
		else {
			node[lastKey] = row[restIndices[0]];
		}
	}

	return result;
}


//

export function areObjects(data: unknown): data is object[] | TableObject[] {
	return Array.isArray(data) && data.length > 0 && data[0] instanceof Object && !Array.isArray(data[0]);
}

export function areTableObjects(data: unknown): data is TableObject[] {
	return Array.isArray(data) && data.length > 0 && data[0] instanceof TableObject;
}

export function areColumns(data: unknown): data is Column[] {
	return Array.isArray(data) && data.length > 0 && data[0] instanceof Column;
}