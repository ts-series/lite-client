
import { SelectClauses } from "./clauses.ts";
import { Sql } from "./sql.ts";


//

export interface SqlFunctions {
	cast(type: string): Sql;
	get asInteger(): Sql;
	get asReal(): Sql;
	get asText(): Sql;
	get asBlob(): Sql;
	get asNumeric(): Sql;

	get not(): Sql;
	and(value: unknown): Sql;
	or(value: unknown): Sql;
	
	plus(value: unknown): Sql;
	minus(value: unknown): Sql;
	get negative(): Sql;
	multiply(value: unknown): Sql;
	divide(value: unknown): Sql;
	modulo(value: unknown): Sql;
	
	equal(value: unknown): Sql;
	notEqual(value: unknown): Sql;
	unequal(value: unknown): Sql;
	greater(value: unknown): Sql;
	greaterOrEqual(value: unknown): Sql;
	less(value: unknown): Sql;
	lessOrEqual(value: unknown): Sql;
	
	between<T>(first: T, second: T): Sql;

	get isNull(): Sql;
	get isNotNull(): Sql;

	in(values: unknown[] | SelectClauses): Sql;
	notIn(values: unknown[] | SelectClauses): Sql;
	like(pattern: string): Sql;
	notLike(pattern: string): Sql;
	unlike(pattern: string): Sql;

	concat(value: unknown): Sql;

	avg(): Sql;
	count(): Sql;
	groupConcat(separator?: string): Sql;
	max(): Sql;
	min(): Sql;
	sum(): Sql;
	total(): Sql;
	median(): Sql;
	percentile(p: number): Sql;
	percentileCont(p: number): Sql;
	percentileDisc(p: number): Sql;

	coalesce(...fallbacks: unknown[]): Sql;
}
