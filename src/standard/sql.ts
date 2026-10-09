
import {
	SqlAggregate,
	SqlAggregateArity,
	SqlArity,
	SqlOperator,
	SqlScalar,
	SqlScalarArity
} from "./symbols.ts";

import { Column, ExcludedColumn } from "./column.ts";
import { buildSelection, DerivedClauses, DerivedSelect, DerivedTable, SelectClauses } from "./clauses.ts";
import { RawSql, SqlExpression, toSql } from "./sql-expression.ts";
import { SqlFunctions } from "./sql-functions.ts";
import { Table } from "./table.ts";


//

export function sql(...items: unknown[]): Sql {
	const expr = new Sql();
	expr._append(...items);
	if (items.length > 1) expr._push(items.length, SqlScalar.Row);
	return expr;
}


export function strftime(...args: unknown[]): Sql {
	const expr = new Sql();
	expr._append(...args);
	expr._push(args.length, SqlScalar.Strftime);
	return expr;
}


export const alias = new Proxy({}, {
	get(_target, prop) {
		return typeof prop === "string" && prop.startsWith("$")
			? new Sql(new RawSql(`"${prop.slice(1)}"`))
			: undefined;
	}
}) as { [key: `$${string}`]: Sql };


//

type InferColumnType<T> = T extends Column<any, infer V> ? V : unknown;

type DerivedColumns<S extends DerivedSelect> = {
	[K in keyof S as `$${Extract<K, string>}`]: Column<Extract<K, string>, InferColumnType<S[K]>>;
};


export class Sql<Name extends string = string> extends SqlExpression implements SqlFunctions {

	alias?: Name;
	transformer?: (value: unknown) => unknown;


	constructor(...subexpr: unknown[]) {
		super();
		this._append(...subexpr);
	}


	static raw(text: string): Sql {
		return new Sql(new RawSql(text));
	}


	as<A extends string>(alias: A): Sql<A> {
		const sql = Object.create(this) as Sql<A>;
		sql.alias = alias;
		return sql;
	}


	transform(fn: (value: unknown) => unknown): this {
		this.transformer = fn;
		return this;
	}


	// CASTING
	
	cast(type: string): Sql {
		this._push(new RawSql(type), SqlScalar.Cast);
		return this;
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
		this._push(SqlOperator.Not);
		return this;
	}

	and(value: unknown): Sql {
		this._append(value, SqlOperator.And);
		return this
	}

	or(value: unknown): Sql {
		this._append(value, SqlOperator.Or);
		return this;
	}
	

	plus(value: unknown): Sql {
		this._append(value, SqlOperator.Plus);
		return this;
	}
	
	minus(value: unknown): Sql {
		this._append(value, SqlOperator.Minus);
		return this;
	}
	
	get negative(): Sql {
		this._push(SqlOperator.Negative);
		return this;
	}
	
	multiply(value: unknown): Sql {
		this._append(value, SqlOperator.Multiply);
		return this;
	}
	
	divide(value: unknown): Sql {
		this._append(value, SqlOperator.Divide);
		return this;
	}
	
	modulo(value: unknown): Sql {
		this._append(value, SqlOperator.Modulo);
		return this;
	}
	

	equal(value: unknown): Sql {
		this._append(value, SqlOperator.Equal);
		return this;
	}
	
	notEqual(value: unknown): Sql {
		this._append(value, SqlOperator.NotEqual);
		return this;
	}
	
	unequal(value: unknown): Sql {
		this._append(value, SqlOperator.NotEqual);
		return this;
	}
	
	greater(value: unknown): Sql {
		this._append(value, SqlOperator.Greater);
		return this;
	}
	
	greaterOrEqual(value: unknown): Sql {
		this._append(value, SqlOperator.GreaterOrEqual);
		return this;
	}
	
	less(value: unknown): Sql {
		this._append(value, SqlOperator.Less);
		return this;
	}
	
	lessOrEqual(value: unknown): Sql {
		this._append(value, SqlOperator.LessOrEqual);
		return this;
	}
	
	between<T>(first: T, second: T): Sql {
		this._append(first, second, SqlOperator.Between);
		return this;
	}


	get isNull(): Sql {
		this._push(SqlOperator.IsNull);
		return this;
	}

	get isNotNull(): Sql {
		this._push(SqlOperator.IsNotNull);
		return this;
	}


	in(values: unknown[] | SelectClauses): Sql {
		this._push(values, SqlOperator.In);
		return this;
	}
	
	notIn(values: unknown[] | SelectClauses): Sql {
		this._push(values, SqlOperator.NotIn);
		return this;
	}


	/** Builds an EXISTS condition around a subquery. */
	static exists(subquery: SelectClauses): Sql {
		const sql = new Sql();
		sql._push(subquery, SqlOperator.Exists);
		return sql;
	}
	
	/** Builds a NOT EXISTS condition around a subquery. */
	static notExists(subquery: SelectClauses): Sql {
		const sql = new Sql();
		sql._push(subquery, SqlOperator.NotExists);
		return sql;
	}


	like(pattern: string): Sql {
		this._append(pattern, SqlOperator.Like);
		return this;
	}
	
	notLike(pattern: string): Sql {
		this._append(pattern, SqlOperator.NotLike);
		return this;
	}
	
	unlike(pattern: string): Sql {
		this._append(pattern, SqlOperator.NotLike);
		return this;
	}
	

	concat(value: unknown): Sql {
		this._append(value, SqlOperator.Concat);
		return this;
	}


	static concat(...args: unknown[]): Sql {
		const sql = new Sql(args[0]);
		for (let i = 1; i < args.length; i++) {
			sql._append(args[i], SqlOperator.Concat);
		}
		return sql;
	}


	// AGGREGATE FUNCTIONS

	avg(): Sql {
		this._push(SqlAggregate.Avg);
		return this;
	}

	count(): Sql {
		this._push(SqlAggregate.Count);
		return this;
	}

	groupConcat(separator?: string): Sql {
		if (separator === undefined) {
			this._push(SqlAggregate.GroupConcat);
		}
		else {
			this._push(separator, SqlAggregate.StringAgg);
		}
		return this;
	}

	max(): Sql {
		this._push(SqlAggregate.Max);
		return this;
	}

	min(): Sql {
		this._push(SqlAggregate.Min);
		return this;
	}

	sum(): Sql {
		this._push(SqlAggregate.Sum);
		return this;
	}

	total(): Sql {
		this._push(SqlAggregate.Total);
		return this;
	}

	median(): Sql {
		this._push(SqlAggregate.Median);
		return this;
	}

	percentile(p: number): Sql {
		this._push(p, SqlAggregate.Percentile);
		return this;
	}

	percentileCont(p: number): Sql {
		this._push(p, SqlAggregate.PercentileCont);
		return this;
	}

	percentileDisc(p: number): Sql {
		this._push(p, SqlAggregate.PercentileDisc);
		return this;
	}


	// SCALAR FUNCTIONS

	static row(...items: unknown[]): Sql {
		const sql = new Sql();
		sql._append(...items);
		sql._push(items.length, SqlScalar.Row);
		return sql;
	}

	coalesce(...fallbacks: unknown[]): Sql {
		this._append(...fallbacks);
		this._push(1 + fallbacks.length, SqlScalar.Coalesce);
		return this;
	}


	static coalesce(...args: unknown[]): Sql {
		const sql = new Sql();
		sql._append(...args);
		sql._push(args.length, SqlScalar.Coalesce);
		return sql;
	}
	

	static strftime(...args: unknown[]): Sql {
		const expr = new Sql();
		expr._append(...args);
		expr._push(args.length, SqlScalar.Strftime);
		return expr;
	}


	// SCALAR FUNCTIONS: ONLY SQLITE

	static max(...args: unknown[]): Sql {
		const sql = new Sql();
		sql._append(...args);
		sql._push(args.length, SqlScalar.Max);
		return sql;
	}
	
	static min(...args: unknown[]): Sql {
		const sql = new Sql();
		sql._append(...args);
		sql._push(args.length, SqlScalar.Min);
		return sql;
	}


	// SCALAR FUNCTIONS: ONLY POSTGRESQL

	static greatest(...args: unknown[]): Sql {
		const sql = new Sql();
		sql._append(...args);
		sql._push(args.length, SqlScalar.Greatest);
		return sql;
	}
	
	static least(...args: unknown[]): Sql {
		const sql = new Sql();
		sql._append(...args);
		sql._push(args.length, SqlScalar.Least);
		return sql;
	}


	// DERIVED TABLES

	/** Builds a derived table (subquery in FROM) whose result columns are referenceable via $name. */
	static derive<S extends DerivedSelect>(
		clauses: DerivedClauses<S>,
		alias: string
	): DerivedTable<S> & DerivedColumns<S> {
		const table = new DerivedTable(clauses, alias);
	
		return new Proxy(table, {
			get(target, prop, receiver) {
				if (typeof prop === "string" && prop.startsWith("$")) {
					return target.column(prop.slice(1));
				}
				return Reflect.get(target, prop, receiver);
			}
		}) as DerivedTable<S> & DerivedColumns<S>;
	}


	// IMPLEMENTING METHODS

	inferTable(): Table | null {
		let result: Table | null = null;
		for (const item of this._terms) {
			if (item instanceof Column) result = item.table;
		}
		return result;
	}


	expand(resolveName?: (logicalName: string) => string): string {
		const stack: string[] = [];
	
		for (let i = 0; i < this._terms.length; i++) {
			const item = this._terms[i];
			const next = this._terms[i + 1];
			const isSetOperand =
				   next === SqlOperator.In
				|| next === SqlOperator.NotIn
				|| next === SqlOperator.Exists
				|| next === SqlOperator.NotExists;
	
			if (item instanceof Column) {
				stack.push(`"${item.table.physicalName}"."${item.physicalName}"`);
			}
			else if (item instanceof ExcludedColumn) {
				if (!resolveName) throw new Error(`\`excluded.$${item.name}\` used outside of onConflict`);
				stack.push(`excluded."${resolveName(item.name)}"`);
			}
			else if (item instanceof RawSql) {
				stack.push(item.text);
			}
			else if (isSetOperand && Array.isArray(item)) {
				stack.push(`(${item.map(toSql).join(", ")})`);
			}
			else if (item !== null && typeof item === "object" && !Array.isArray(item)) {
				stack.push(`(${buildSelection(item as SelectClauses)})`);
			}
			else if (typeof item === "symbol") {
				const opStr = item.description!;
				const aggregateArity = SqlAggregateArity[item];
				const operatorArity = SqlArity[item];
				const scalarArity = SqlScalarArity[item];
	
				if (item === SqlScalar.Cast) {
					const type = stack.pop()!;
					const expr = stack.pop()!;
					stack.push(`cast(${expr} as ${type})`);
				}
				else if (scalarArity === undefined && item in SqlScalarArity) {
					const count = parseInt(stack.pop()!, 10);
					const operands: string[] = [];
					for (let j = 0; j < count; j++) operands.unshift(stack.pop()!);
					stack.push(`${opStr}(${operands.join(", ")})`);
				}
				else if (scalarArity === 2) {
					const b = stack.pop()!;
					const a = stack.pop()!;
					stack.push(`${opStr}(${a}, ${b})`);
				}
				else if (operatorArity === -1) {
					const operand = stack.pop()!;
					stack.push(item === SqlOperator.Negative ? `-${operand}` : `(${opStr} ${operand})`);
				}
				else if (operatorArity === 1) {
					const arg = stack.pop()!;
					stack.push(`(${arg} ${opStr})`);
				}
				else if (aggregateArity === 1) {
					const arg = stack.pop()!;
					stack.push(`${opStr}(${arg})`);
				}
				else if (aggregateArity === 2) {
					const b = stack.pop()!;
					const a = stack.pop()!;
					stack.push(`${opStr}(${a}, ${b})`);
				}
				else if (operatorArity === 2) {
					const b = stack.pop()!;
					const a = stack.pop()!;
					stack.push(`(${a} ${opStr} ${b})`);
				}
				else if (operatorArity === 3) {
					const right = stack.pop()!;
					const middle = stack.pop()!;
					const left = stack.pop()!;
					stack.push(`(${left} ${opStr} ${middle} and ${right})`);
				}
			}
			else {
				stack.push(toSql(item));
			}
		}
	
		return stack[0] ? (this.alias ? `${stack[0]} as "${this.alias}"` : stack[0]) : "";
	}
}
