/*

1  OPERATORS
2  AGGREGATE FUNCTIONS
3  SCALAR FUNCTIONS
4  JOIN TYPES

*/

// 1  OPERATORS

export const SqlOperator = {
	Not: Symbol("not"),
	And: Symbol("and"),
	Or: Symbol("or"),
	
	Plus: Symbol("+"),
	Minus: Symbol("-"),
	Negative: Symbol("-"),
	Multiply: Symbol("*"),
	Divide: Symbol("/"),
	Modulo: Symbol("%"),

	Equal: Symbol("="),
	NotEqual: Symbol("<>"),
	Greater: Symbol(">"),
	GreaterOrEqual: Symbol(">="),
	Less: Symbol("<"),
	LessOrEqual: Symbol("<="),

	Between: Symbol("between"),

	IsNull: Symbol("is null"),
	IsNotNull: Symbol("is not null"),

	In: Symbol("in"),
	NotIn: Symbol("not in"),

	Exists: Symbol("exists"),
	NotExists: Symbol("not exists"),

	Like: Symbol("like"),
	NotLike: Symbol("not like"),

	Concat: Symbol("||")
} as const;

export type SqlOperator = typeof SqlOperator[keyof typeof SqlOperator];


export const SqlArity = {
	[SqlOperator.Not]: -1,
		// The arity -1 denotes a prefix operator, while +1 stands for a unary postfix operator.
	[SqlOperator.And]: 2,
	[SqlOperator.Or]: 2,
	
	[SqlOperator.Plus]: 2,
	[SqlOperator.Minus]: 2,
	[SqlOperator.Negative]: -1,
	[SqlOperator.Multiply]: 2,
	[SqlOperator.Divide]: 2,
	[SqlOperator.Modulo]: 2,

	[SqlOperator.Equal]: 2,
	[SqlOperator.Greater]: 2,
	[SqlOperator.GreaterOrEqual]: 2,
	[SqlOperator.Less]: 2,
	[SqlOperator.LessOrEqual]: 2,
	[SqlOperator.NotEqual]: 2,

	[SqlOperator.Between]: 3,

	[SqlOperator.IsNull]: 1,
	[SqlOperator.IsNotNull]: 1,

	[SqlOperator.In]: 2,
	[SqlOperator.NotIn]: 2,

	[SqlOperator.Exists]: -1,
	[SqlOperator.NotExists]: -1,

	[SqlOperator.Like]: 2,
	[SqlOperator.NotLike]: 2,

	[SqlOperator.Concat]: 2
} as const;

export type SqlArity = typeof SqlArity[keyof typeof SqlArity];


// 2  AGGREGATE FUNCTIONS

export const SqlAggregate = {
	Avg: Symbol("avg"),
	Count: Symbol("count"),
	GroupConcat: Symbol("group_concat"),
	Max: Symbol("max"),
	Min: Symbol("min"),
	StringAgg: Symbol("string_agg"),
	Sum: Symbol("sum"),
	Total: Symbol("total"),
	Median: Symbol("median"),
	Percentile: Symbol("percentile"),
	PercentileCont: Symbol("percentile_cont"),
	PercentileDisc: Symbol("percentile_disc")
} as const;

export type SqlAggregate = typeof SqlAggregate[keyof typeof SqlAggregate];


export const SqlAggregateArity = {
	[SqlAggregate.Avg]: 1,
	[SqlAggregate.Count]: 1,
	[SqlAggregate.GroupConcat]: 1,
	[SqlAggregate.Max]: 1,
	[SqlAggregate.Min]: 1,
	[SqlAggregate.StringAgg]: 2,
	[SqlAggregate.Sum]: 1,
	[SqlAggregate.Total]: 1,
	[SqlAggregate.Median]: 1,
	[SqlAggregate.Percentile]: 2,
	[SqlAggregate.PercentileCont]: 2,
	[SqlAggregate.PercentileDisc]: 2
} as const;

export type SqlAggregateArity = typeof SqlAggregateArity[keyof typeof SqlAggregateArity];


// 3  SCALAR FUNCTIONS

export const SqlScalar = {
	Row: Symbol(""),
	
	Cast: Symbol("cast"),
	Coalesce: Symbol("coalesce"),
	NullIf: Symbol("nullif"),

	Strftime: Symbol("strftime"),

	// ONLY SQLITE
	Max: Symbol("max"),
	Min: Symbol("min"),

	// ONLY POSTGRESQL
	Greatest: Symbol("greatest"),
	Least: Symbol("least")
} as const;

export type SqlScalar = typeof SqlScalar[keyof typeof SqlScalar];


export const SqlScalarArity: Partial<Record<symbol, number>> = {
	[SqlScalar.Row]: undefined,

	[SqlScalar.Coalesce]: undefined,
	[SqlScalar.NullIf]: 2,

	[SqlScalar.Strftime]: undefined,

	[SqlScalar.Max]: undefined,
	[SqlScalar.Min]: undefined,

	[SqlScalar.Greatest]: undefined,
	[SqlScalar.Least]: undefined,
} as const;


// 4  JOIN TYPES

export const Join = {
	Inner: Symbol("inner join"),
	Left: Symbol("left join"),
	LeftOuter: Symbol("left outer join"),
	Cross: Symbol("cross join"),
	Natural: Symbol("natural join"),
	NaturalLeft: Symbol("natural left join"),
	NaturalLeftOuter: Symbol("natural left outer join"),
	NaturalInner: Symbol("natural inner join"),
	NaturalCross: Symbol("natural cross join")
} as const;

export type Join = typeof Join[keyof typeof Join];
