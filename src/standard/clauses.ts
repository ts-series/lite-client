
import { Column, ColumnOrder, ExcludedColumn, SqlOrder } from "./column.ts";
import { Sql } from "./sql.ts";
import { SqlExpression, toSql } from "./sql-expression.ts";
import { SqlOperator } from "./symbols.ts";
import { Table, TableObject, Joins } from "./table.ts";
import { Interceptor } from "./interception.ts";


// CLAUSE TYPES AND ASSOCIATED HELPER TYPES

export type SelectionItem = Column | Sql | number | string;
export type Selection = Table | SelectionItem | readonly SelectionItem[];
export type DerivedSelect = Record<string, Column | Sql>;

export type WhereClause = object | Sql | Sql[]

export type GroupByClause = Column | (Column | Sql)[]

export type NestByClause = Column | string | readonly (Column | string)[];

export type OrderByClause = Column | ColumnOrder | (Column | ColumnOrder)[];


interface Metaclauses {
	intercept?: Interceptor;
	nestBy?: NestByClause;
}


export type AnySelection = Selection | DerivedSelect;

export interface SelectClauses<
	S extends AnySelection = AnySelection
> extends Metaclauses {
	select?: S;
	selectDistinct?: S;
	from?: Table | DerivedTable | Joins;
	where?: WhereClause;
	groupBy?: GroupByClause;
	having?: Sql;
	orderBy?: OrderByClause;
	limit?: number;
	offset?: number;
}

export type SingleRowClauses<S extends AnySelection = AnySelection> = Omit<SelectClauses<S>, "nestBy">;


export type OnConflictClause = null | {
	target?: Column[];
	targetWhere?: Sql;
	set?: Record<string, unknown>;
	where?: Sql;
};


export interface InsertClauses extends Metaclauses {
	into?: Table | Column[];
	values: object | object[] | unknown[][];
	onConflict?: OnConflictClause;
	returning?: Selection;
}


export interface UpdateClauses extends Metaclauses {
	table?: Table;
	set: object;
	where?: object | Sql;
	returning?: Selection;
	orderBy?: OrderByClause;
	limit?: number;
	offset?: number;
}


export interface DeleteClauses extends Metaclauses {
	from?: Table;
	where?: object | Sql;
	returning?: Selection;
	orderBy?: OrderByClause;
	limit?: number;
	offset?: number;
}


export type Selectables = readonly (Column<string, unknown> | Sql<string>)[];


export type RowFromColumns<Cols extends Selectables> = {
	[C in Cols[number] as
		C extends Column<infer N, any> ? N :
		C extends Sql<infer N> ? N :
		never
	]:
		C extends Column<any, infer T> ? T :
		C extends Sql<infer N> ? string :
		never
}


export type RowFromDerivedSelect<S extends DerivedSelect> = {
	[K in keyof S]: S[K] extends Column<any, infer T> ? T : S[K] extends Sql<any> ? string : never
}


export type KeyName<K> = K extends Column<infer N, any> ? N : K;

export type KeyNames<Keys extends NestByClause> = Keys extends readonly unknown[]
	? { [I in keyof Keys]: KeyName<Keys[I]> }
	: [KeyName<Keys>];


export type NestedByObject<
	Row,
	AllKeys extends readonly PropertyKey[],
	Remaining extends readonly PropertyKey[] = AllKeys
> =
	Remaining extends readonly [infer K extends keyof Row, ...infer Rest extends readonly PropertyKey[]]
		? Record<Extract<Row[K], PropertyKey>,
			Rest extends readonly [] ? Omit<Row, AllKeys[number]> : NestedByObject<Row, AllKeys, Rest>>
		: never;


export type EntryOf<T extends Table> = T["entry"];


// DERIVED CLASSES

export type DerivedClauses<S extends DerivedSelect = DerivedSelect> = SelectClauses<S> & { select: S };

/** Represents a subquery used as a table in a FROM clause, with named, referenceable columns. */
export class DerivedTable<S extends DerivedSelect = DerivedSelect> extends SqlExpression {

	physicalName: string;
	#columns = new Map<string, Column>();

	constructor(clauses: DerivedClauses<S>, alias: string) {
		super();
		this.physicalName = alias;
		this._push(clauses as SelectClauses<S>);
	}

	/** Returns a Column pointing at a named field of this derived table's result set. */
	column<T = unknown>(name: string): Column<string, T> {
		if (!this.#columns.has(name)) {
			this.#columns.set(name, new Column(name, name, this as unknown as Table, Number, false, true, true));
		}
		return this.#columns.get(name)! as Column<string, T>;
	}

	/** Compiles this derived table into a FROM-clause fragment. */
	expand(): string {
		return ` from (${buildSelection(this._terms[0] as SelectClauses)}) as "${this.physicalName}"`;
	}
}


// IMPLEMENTATION OF CLAUSES

export function inferTableFromSelection(selection: Selection): Table {
	if (TableObject.isTable(selection)) {
		return selection;
	}
	else if (Array.isArray(selection)) {
		if (selection.length === 0) throw new Error("unable to infer table from empty selection");

		let table: Table | null = null;

		for (const item of selection as SelectionItem[]) {
			const currentTable = item instanceof Column
				? item.table
				: item instanceof Sql
					? item.inferTable()
					: null;

			if (currentTable) {
				if (!table) {
					table = currentTable;
				}
				else if (table !== currentTable) {
					throw new Error("selection contains columns from different tables");
				}
			}
		}

		if (table === null) throw new Error(
			"cannot infer table, provide `from` clause");

		return table;
	}
	else if (selection instanceof Column) {
		return selection.table;
	}
	else if (selection instanceof Sql) {
		const table = selection.inferTable();
		if (table === null) throw new Error("cannot infer table, provide `from` clause");
		return table;
	}
	else {
		throw new Error("cannot infer table, provide `from` clause");
	}
}


export function expandSelection(selection: AnySelection): string {
	if (TableObject.isTable(selection)) {
		return selection.columns.map(col =>
			`"${col.table.physicalName}"."${col.physicalName}" as "${col.name}"`
		).join(", ");
	}
	else if (selection instanceof Column || selection instanceof Sql) {
		return expandSelectionItem(selection, 0);
	}
	else if (Array.isArray(selection)) {
		return (selection as SelectionItem[]).map((item, i) => expandSelectionItem(item, i)).filter(s => s !== "").join(", ");
	}
	else if (typeof selection === "number" || typeof selection === "string") {
		return toSql(selection);
	}
	else {
		return Object.entries(selection as DerivedSelect).map(([alias, term]) =>
			term instanceof Column
				? `"${term.table.physicalName}"."${term.physicalName}" as "${alias}"`
				: `${term.expand()} as "${alias}"`
		).join(", ");
	}
}


function expandSelectionItem(item: SelectionItem, index: number): string {
	if (item instanceof Column) {
		return `"${item.table.physicalName}"."${item.physicalName}" as "${item.name}"`;
	}
	else if (item instanceof Sql) {
		return item.alias ? item.expand() : `${item.expand()} as "_${index}"`;
	}
	else {
		return toSql(item);
	}
}


/** Returns the result-set field names of a selection, in select order (positional fallback: "_0", "_1", …). */
export function selectionNames(selection: AnySelection): string[] {
	if (TableObject.isTable(selection)) {
		return selection.columns.map(col => col.name);
	}
	else if (selection instanceof Column) {
		return [selection.name];
	}
	else if (selection instanceof Sql) {
		return [selection.alias ?? "_0"];
	}
	else if (Array.isArray(selection)) {
		return (selection as SelectionItem[]).map((item, i) =>
			item instanceof Column ? item.name :
			item instanceof Sql ? (item.alias ?? `_${i}`) :
			`_${i}`
		);
	}
	else {
		return Object.keys(selection as DerivedSelect);
	}
}


export function expandWhereClause(table: Table, data: object | Sql | Sql[]): string {
	let conditions: Sql;

	if (Array.isArray(data)) {
		conditions = new Sql();
		for (let i = 0; i < data.length; i++) {
			conditions._append(data[i]);
			if (i > 0) conditions._push(SqlOperator.And);
		}
	}
	else if (data instanceof Sql) {
		conditions = data;
	}
	else if (data instanceof TableObject) {
		conditions = data.uniqueCondition;
	}
	else {
		conditions = table.equal(data);
	}

	return conditions._terms.length === 0 ? "" : ` where ${conditions.expand()}`;
}


export function expandReturnClause(selection: Selection): string {
	return ` returning ${expandSelection(selection)}`;
}


export function expandGroupByClause(groupBy: GroupByClause): string {
	const terms = (Array.isArray(groupBy) ? groupBy : [groupBy]).map(term => {
		if (term instanceof Column) {
			return `"${term.table.physicalName}"."${term.physicalName}"`;
		}
		else if (term instanceof Sql) {
			return term.expand();
		}
		return "";
	}).filter(s => s !== "");

	return terms.length > 0 ? ` group by ${terms.join(", ")}` : "";
}


/** Derives a groupBy clause from nestBy, when nestBy consists entirely of actual Column objects. */
function deriveGroupByFromNestBy(nestBy?: NestByClause): GroupByClause | undefined {
	const keys = nestBy === undefined ? [] : Array.isArray(nestBy) ? nestBy : [nestBy];
	return keys.length > 0 && keys.every((key): key is Column => key instanceof Column)
		? keys
		: undefined;
}


export function expandPostClauses(
	sql: string, clauses: SelectClauses | UpdateClauses | SelectClauses
): string {
	if (clauses.orderBy) {
		const orderStrings = (Array.isArray(clauses.orderBy) ? clauses.orderBy : [clauses.orderBy]).map(item => {
			if (item instanceof Column) {
				return `${item.physicalName} asc`;
			}
			else if (item instanceof ColumnOrder) {
				const col = item.term.physicalName;
				switch (item.order) {
					case SqlOrder.Asc:             return `${col} asc`;
					case SqlOrder.Asc_NullsFirst:  return `${col} asc nulls first`;
					case SqlOrder.Asc_NullsLast:   return `${col} asc nulls last`;
					case SqlOrder.Desc:            return `${col} desc`;
					case SqlOrder.Desc_NullsFirst: return `${col} desc nulls first`;
					case SqlOrder.Desc_NullsLast:  return `${col} desc nulls last`;
				}
			}
			return "";
		});

		sql += ` order by ${orderStrings.join(", ")}`;
	}

	if (clauses.limit !== undefined) {
		sql += ` limit ${clauses.limit}`;
	}

	if (clauses.offset !== undefined) {
		sql += ` offset ${clauses.offset}`;
	}

	return sql;
}


/** Compiles a SelectClauses object into a SELECT statement string. */
export function buildSelection(clauses: SelectClauses): string {
	const distinct = "selectDistinct" in clauses;
	const selection = clauses.selectDistinct ?? clauses.select;

	if (!selection) throw new Error("select — no valid SELECT clause specified");

	let table: Table;
	let sql = `select ${distinct ? "distinct " : ""}${expandSelection(selection)}`;

	if (clauses.from) {
		if (TableObject.isTable(clauses.from)) {
			table = clauses.from;
			sql += ` from ${clauses.from.physicalName}`;
		}
		else if (clauses.from instanceof DerivedTable) {
			table = clauses.from as unknown as Table;
			sql += clauses.from.expand();
		}
		else {
			table = clauses.from._terms[0] as Table;
			sql += clauses.from.expand();
		}
	}
	else {
		table = inferTableFromSelection(selection as Selection);
		sql += ` from ${table.physicalName}`;
	}

	if (clauses.where) sql += expandWhereClause(table, clauses.where);

	const groupBy = clauses.groupBy ?? deriveGroupByFromNestBy(clauses.nestBy);
	if (groupBy) sql += expandGroupByClause(groupBy);

	if (clauses.having) sql += ` having ${clauses.having.expand()}`;

	return expandPostClauses(sql, clauses);
}


// clauses.ts

function expandConflictValue(val: unknown, resolveExcluded: (name: string) => string): string {
	if (val instanceof ExcludedColumn) {
		return `excluded."${resolveExcluded(val.name)}"`;
	}
	else if (val instanceof Sql) {
		return val.expand(resolveExcluded);
	}
	else {
		return toSql(val);
	}
}


export function expandOnConflict(onConflict: OnConflictClause, columns: readonly Column[]): string {
	if (onConflict === null) {
		return " on conflict do nothing";
	}
	else {
		const targetNames = new Set((onConflict.target ?? []).map(c => c.physicalName));

		let sql = onConflict.target
			? ` on conflict (${onConflict.target.map(c => c.physicalName).join(", ")})`
			: " on conflict";

		if (onConflict.targetWhere) sql += ` where ${onConflict.targetWhere.expand()}`;

		const resolveExcluded = (name: string): string => {
			const col = columns.find(c => c.name === name);
			if (!col) throw new Error(`onConflict — unknown column \`${name}\` in \`excluded\``);
			return col.physicalName;
		};

		const setSql = onConflict.set
			? Object.entries(onConflict.set).map(([col, val]) =>
				`${col} = ${expandConflictValue(val, resolveExcluded)}`).join(", ")
			: columns.filter(c => !targetNames.has(c.physicalName)).map(c =>
				`${c.physicalName} = excluded.${c.physicalName}`).join(", ");

		if (setSql === "") throw new Error("onConflict — no columns left to update, provide `set` explicitly");

		sql += ` do update set ${setSql}`;

		if (onConflict.where) sql += ` where ${onConflict.where.expand()}`;

		return sql;
	}
}
