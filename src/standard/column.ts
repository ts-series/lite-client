
import {
	SqlAggregate,
	SqlOperator,
	SqlScalar,
} from "./symbols.ts";

import { TableObject } from "./table.ts";
import { Sql } from "./sql.ts";
import { SelectClauses } from "./clauses.ts";
import { SqlFunctions } from "./sql-functions.ts";
import { RawSql } from "./sql-expression.ts";


//

abstract class ColumnFunctions {

	cast(type: string): Sql {
		return new Sql(this, new RawSql(type), SqlScalar.Cast);
	}
	
	get asInteger(): Sql {
		return this.cast("integer");
	}
	
	get asReal(): Sql {
		return this.cast("real");
	}
	
	get asText(): Sql {
		return this.cast("text");
	}
	
	get asBlob(): Sql {
		return this.cast("blob");
	}
	
	get asNumeric(): Sql {
		return this.cast("numeric");
	}


	// OPERATOR CALLS

	get not(): Sql {
		return new Sql(this, SqlOperator.Not);
	}

	and(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.And);
	}

	or(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.Or);
	}


	plus(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.Plus);
	}

	minus(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.Minus);
	}

	get negative(): Sql {
		return new Sql(this, SqlOperator.Negative);
	}

	multiply(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.Multiply);
	}

	divide(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.Divide);
	}

	modulo(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.Modulo);
	}


	equal(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.Equal);
	}

	notEqual(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.NotEqual);
	}

	unequal(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.NotEqual);
	}

	greater(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.Greater);
	}

	greaterOrEqual(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.GreaterOrEqual);
	}

	less(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.Less);
	}

	lessOrEqual(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.LessOrEqual);
	}


	between<T>(first: T, second: T): Sql {
		return new Sql(this, first, second, SqlOperator.Between);
	}


	get isNull(): Sql {
		return new Sql(this, SqlOperator.IsNull);
	}

	get isNotNull(): Sql {
		return new Sql(this, SqlOperator.IsNotNull);
	}


	in(values: unknown[] | SelectClauses): Sql {
		return new Sql(this, values, SqlOperator.In);
	}

	notIn(values: unknown[] | SelectClauses): Sql {
		return new Sql(this, values, SqlOperator.NotIn);
	}

	like(pattern: string): Sql {
		return new Sql(this, pattern, SqlOperator.Like);
	}

	notLike(pattern: string): Sql {
		return new Sql(this, pattern, SqlOperator.NotLike);
	}

	unlike(pattern: string): Sql {
		return new Sql(this, pattern, SqlOperator.NotLike);
	}


	concat(value: unknown): Sql {
		return new Sql(this, value, SqlOperator.Concat);
	}


	// SCALAR FUNCTIONS

	coalesce(...fallbacks: unknown[]): Sql {
		const sql = new Sql(this);
		sql._append(...fallbacks);
		sql._push(1 + fallbacks.length, SqlScalar.Coalesce);
		return sql;
	}
}


export type ColumnConstructor =
	  NumberConstructor
	| StringConstructor
	| Uint8ArrayConstructor
	| BigIntConstructor;


export class Column<
	Name extends string = string,
	T = unknown
> extends ColumnFunctions implements SqlFunctions {

	transformer?: (value: unknown) => unknown;

	constructor(
		public name: string,
		public physicalName: string,
		public table: typeof TableObject,
		public type: ColumnConstructor,
		public generated: boolean,
		public nullable: boolean,
		public optional: boolean,
		public knownDefault?: number | bigint | string | null,
		public isJson: boolean = false
	) {
		super();
	}


	as<A extends string>(alias: A): Column<A, T> {
		const col = Object.create(this) as Column<A, T>;
		col.name = alias;
		return col;
	}


	transform(fn: (value: unknown) => unknown): Sql {
		const sql = new Sql(this);
		sql.transformer = fn;
		return sql;
	}


	// AGGREGATE FUNCTIONS

	avg(): Sql {
		return new Sql(this, SqlAggregate.Avg);
	}

	count(): Sql {
		return new Sql(this, SqlAggregate.Count);
	}

	groupConcat(separator?: string): Sql {
		return separator == undefined
			? new Sql(this, SqlAggregate.GroupConcat)
			: new Sql(this, separator, SqlAggregate.StringAgg);
	}

	max(): Sql {
		return new Sql(this, SqlAggregate.Max);
	}

	min(): Sql {
		return new Sql(this, SqlAggregate.Min);
	}

	sum(): Sql {
		return new Sql(this, SqlAggregate.Sum);
	}

	total(): Sql {
		return new Sql(this, SqlAggregate.Total);
	}

	median(): Sql {
		return new Sql(this, SqlAggregate.Median);
	}

	percentile(p: number): Sql {
		return new Sql(this, p, SqlAggregate.Percentile);
	}

	percentileCont(p: number): Sql {
		return new Sql(this, p, SqlAggregate.PercentileCont);
	}

	percentileDisc(p: number): Sql {
		return new Sql(this, p, SqlAggregate.PercentileDisc);
	}


	// COLUMN SORTING

	get asc(): ColumnOrder {
		return new ColumnOrder(this, SqlOrder.Asc);
	}

	get desc(): ColumnOrder {
		return new ColumnOrder(this, SqlOrder.Desc);
	}
}


// COLUMN ORDER

export enum SqlOrder {
	Asc,
	Asc_NullsFirst,
	Asc_NullsLast,
	Desc,
	Desc_NullsFirst,
	Desc_NullsLast
}

export class ColumnOrder {

	constructor(
		public term: Column,
		public order: SqlOrder
	) {}


	get nullsFirst(): this {
		this.order = this.order === SqlOrder.Desc
			? SqlOrder.Desc_NullsFirst
			: SqlOrder.Asc_NullsFirst
		return this;
	}

	get nullsLast(): this {
		this.order = this.order === SqlOrder.Desc
			? SqlOrder.Desc_NullsLast
			: SqlOrder.Asc_NullsLast
		return this;
	}
}


// EXCLUDED COLUMNS FOR CONFLICTING INSERTS

export class ExcludedColumn<Name extends string = string> extends ColumnFunctions {
	constructor(public name: Name) {
		super();
	}
}

export const excluded = new Proxy({}, {
	get(_target, prop) {
		return typeof prop === "string" && prop.startsWith("$")
			? new ExcludedColumn(prop.slice(1))
			: undefined;
	}
}) as { [key: `$${string}`]: ExcludedColumn };
