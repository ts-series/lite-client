
import { Column } from "./column.ts";
import { SqlExpression } from "./sql-expression.ts";
import { Sql } from "./sql.ts";
import { Join, SqlOperator } from "./symbols.ts";


//

export type Table = typeof TableObject;


export abstract class TableObject<Entry = any> {
	declare static readonly entry: any;

	static readonly schemaName: string;
	static readonly physicalName: string;
	declare static readonly sourceName: string | undefined;
	static readonly fullName: string;
	static readonly physicalColumnNames: string[];
	static readonly metadata: Record<string, Column>;
	static readonly columns: Column[];
	static readonly uniqueConstraints: Column[][];

	static readonly schema: {
		parse(data: unknown): any;
		safeParse(data: unknown): { success: true; data: any } | { success: false; error: unknown };
	};


	constructor(data: Record<string, unknown> = {}) {
		const table = this.constructor as typeof TableObject;
		for (const col of table.columns) {
			(this as any)[col.name] = col.name in data
				? data[col.name]
				: col.knownDefault !== undefined
					? col.knownDefault
					: col.nullable ? null : undefined;
		}
	}


	get table(): Table {
		return this.constructor as typeof TableObject;
	}


	/** Returns a proxy of this table under a new name, with all columns rebound to it. */
	static alias<T extends Table>(this: T, name: string): T {
		const bound = new Map<Column, Column>();
	
		/** Returns a cached copy of the column that points at the aliased table. */
		const bind = (col: Column): Column => {
			if (!bound.has(col)) {
				const copy = Object.create(col) as Column;
				copy.table = proxy;
				bound.set(col, copy);
			}
			return bound.get(col)!;
		};
	
		const proxy: T = new Proxy(this, {
			get(target, prop) {
				const value = (target as any)[prop];
	
				if (prop === "physicalName") {
					return name;
				}
				else if (prop === "sourceName") {
					return target.sourceName ?? target.physicalName;
				}
				else if (prop === "fullName") {
					return `${target.schemaName}.${name}`;
				}
				else if (prop === "columns") {
					return target.columns.map(bind);
				}
				else if (value instanceof Column) {
					return bind(value);
				}
				else {
					return value;
				}
			}
		});
	
		return proxy;
	}


	static getPhysicalName(logicalName: string): string {
		return this.metadata[logicalName].physicalName;
	}


	static equal(values: object): Sql {
		const sql = new Sql();
		const entries = Object.entries(values);
	
		for (let i = 0; i < entries.length; i++) {
			const [columnName, value] = entries[i];
			sql._push((this as any)[`$${columnName}`], value, SqlOperator.Equal);
			
			if (i > 0) sql._push(SqlOperator.And);
		}
	
		return sql;
	}


	/** If there are not enough values given for any unique constraints, an empty array is returned. */
		get uniqueCondition(): Sql {
			const table = this.table;
			const sql = new Sql();
		
			for (const constraint of table.uniqueConstraints) {
				let allDefined = true;
		
				for (const column of constraint) {
					if ((this as any)[column.name] === undefined) {
						allDefined = false;
						break;
					}
				}
		
				if (allDefined) {
					for (let i = 0; i < constraint.length; i++) {
						const column = constraint[i];
						const value = (this as any)[column.name];
						sql._push(column, value, SqlOperator.Equal);
						
						if (i > 0) sql._push(SqlOperator.And);
					}
					return sql;
				}
			}
		
			return sql;
		}


	static isTable(obj: unknown): obj is typeof TableObject {
		return typeof obj === "function" && obj.prototype instanceof TableObject;
	}


	// METHODS FOR UNRESTRICTED JOINS

	static innerJoin(on: Sql): Joins;
	static innerJoin(source: Column, target: Column): Joins;
	static innerJoin(arg: Sql | Column, target?: Column): Joins {
		const on = arg instanceof Column ? new Sql(arg, target!, SqlOperator.Equal) : arg;
		const joins = new Joins(this);
		joins._pushJoin(Join.Inner, on);
		return joins;
	}
	
	
	static leftJoin(on: Sql): Joins;
	static leftJoin(source: Column, target: Column): Joins;
	static leftJoin(arg: Sql | Column, target?: Column): Joins {
		const on = arg instanceof Column ? new Sql(arg, target!, SqlOperator.Equal) : arg;
		const joins = new Joins(this);
		joins._pushJoin(Join.Left, on);
		return joins;
	}
	

	static leftOuterJoin(on: Sql): Joins;
	static leftOuterJoin(source: Column, target: Column): Joins;
	static leftOuterJoin(arg: Sql | Column, target?: Column): Joins {
		const on = arg instanceof Column ? new Sql(arg, target!, SqlOperator.Equal) : arg;
		const joins = new Joins(this);
		joins._pushJoin(Join.LeftOuter, on);
		return joins;
	}
	

	static crossJoin(on: Sql): Joins;
	static crossJoin(source: Column, target: Column): Joins;
	static crossJoin(arg: Sql | Column, target?: Column): Joins {
		const on = arg instanceof Column ? new Sql(arg, target!, SqlOperator.Equal) : arg;
		const joins = new Joins(this);
		joins._pushJoin(Join.Cross, on);
		return joins;
	}
	

	static naturalJoin(table: Table): Joins {
		const joins = new Joins(this);
		joins.naturalJoin(table);
		return joins;
	}
	
	static naturalLeftJoin(table: Table): Joins {
		const joins = new Joins(this);
		joins.naturalLeftJoin(table);
		return joins;
	}
	
	static naturalLeftOuterJoin(table: Table): Joins {
		const joins = new Joins(this);
		joins.naturalLeftOuterJoin(table);
		return joins;
	}
	
	static naturalInnerJoin(table: Table): Joins {
		const joins = new Joins(this);
		joins.naturalInnerJoin(table);
		return joins;
	}
	
	static naturalCrossJoin(table: Table): Joins {
		const joins = new Joins(this);
		joins.naturalCrossJoin(table);
		return joins;
	}
}


/** Returns the FROM or JOIN source of a table, including the alias clause for aliased tables. */
export function tableSource(table: Table): string {
	return table.sourceName === undefined
		? `"${table.physicalName}"`
		: `"${table.sourceName}" as "${table.physicalName}"`;
}


//

export class Joins extends SqlExpression {

	constructor(from: Table) {
		super();
		this._push(from);
	}


	_pushJoin(join: Join, on: Sql | null): void {
		const table = on
			? (() => {
				const existing = new Set<Table>();
				existing.add(this._terms[0] as Table);
				for (let i = 1; i < this._terms.length; i += 3) existing.add(this._terms[i] as Table);
				for (const item of on._terms) {
					if (item instanceof Column && !existing.has(item.table)) return item.table;
				}
				throw new Error("join on-clause must reference a new table");
			})()
			: null;

		if (table) this._push(table, join, on);
	}


	innerJoin(on: Sql): this;
	innerJoin(source: Column, target: Column): this;
	innerJoin(arg: Sql | Column, target?: Column): this {
		const on = arg instanceof Column ? new Sql(arg, target!, SqlOperator.Equal) : arg;
		this._pushJoin(Join.Inner, on);
		return this;
	}

	leftJoin(on: Sql): this;
	leftJoin(source: Column, target: Column): this;
	leftJoin(arg: Sql | Column, target?: Column): this {
		const on = arg instanceof Column ? new Sql(arg, target!, SqlOperator.Equal) : arg;
		this._pushJoin(Join.Left, on);
		return this;
	}

	leftOuterJoin(on: Sql): this;
	leftOuterJoin(source: Column, target: Column): this;
	leftOuterJoin(arg: Sql | Column, target?: Column): this {
		const on = arg instanceof Column ? new Sql(arg, target!, SqlOperator.Equal) : arg;
		this._pushJoin(Join.LeftOuter, on);
		return this;
	}

	crossJoin(on: Sql): this;
	crossJoin(source: Column, target: Column): this;
	crossJoin(arg: Sql | Column, target?: Column): this {
		const on = arg instanceof Column ? new Sql(arg, target!, SqlOperator.Equal) : arg;
		this._pushJoin(Join.Cross, on);
		return this;
	}

	naturalJoin(table: Table): this {
		this._push(table, Join.Natural, null);
		return this;
	}

	naturalLeftJoin(table: Table): this {
		this._push(table, Join.NaturalLeft, null);
		return this;
	}

	naturalLeftOuterJoin(table: Table): this {
		this._push(table, Join.NaturalLeftOuter, null);
		return this;
	}

	naturalInnerJoin(table: Table): this {
		this._push(table, Join.NaturalInner, null);
		return this;
	}

	naturalCrossJoin(table: Table): this {
		this._push(table, Join.NaturalCross, null);
		return this;
	}


	// IMPLEMENTING METHODS

	expand(): string {
		if (this._terms.length === 0) return "";
	
		const fromTable = this._terms[0] as Table;
		let sql = ` from ${tableSource(fromTable)}`;
	
		for (let i = 1; i < this._terms.length; i += 3) {
			const table = this._terms[i] as Table;
			const join = this._terms[i + 1] as Join;
			const on = this._terms[i + 2] as Sql | null;
			sql += ` ${join.description!} ${tableSource(table)}`;
			if (on) sql += ` on ${on.expand()}`;
		}
	
		return sql;
	}
}
