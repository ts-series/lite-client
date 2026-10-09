# LiteClient.ts — Reference

## Table of Contents

1. [Setup](#1-setup)
   1. [Generating table classes](#11-generating-table-classes)
   2. [Adapters](#12-adapters)
   3. [Attached databases](#13-attached-databases)
   4. [Pragmas](#14-pragmas)
2. [Querying](#2-querying)
   1. [Clauses](#21-clauses)
   2. [Ordering](#22-ordering)
   3. [Scalars](#23-scalars)
   4. [Raw SQL](#24-raw-sql)
   5. [Nesting results](#25-nesting-results)
3. [Subqueries and Derived Tables](#3-subqueries-and-derived-tables)
   1. [Derived tables](#31-derived-tables)
   2. [Subqueries in conditions](#32-subqueries-in-conditions)
   3. [Subqueries as scalar values](#33-subqueries-as-scalar-values)
4. [Mutations](#4-mutations)
   1. [Insert](#41-insert)
   2. [Handling conflicts](#42-handling-conflicts)
   3. [SQLite-specific conflict handling](#43-sqlite-specific-conflict-handling)
   4. [Update](#44-update)
   5. [Delete](#45-delete)
5. [Expressions and Conditions](#5-expressions-and-conditions)
   1. [Aggregates](#51-aggregates)
   2. [Scalar functions](#52-scalar-functions)
   3. [Aliasing in selections](#53-aliasing-in-selections)
   4. [Casting](#54-casting)
   5. [Row values](#55-row-values)
   6. [Raw SQL](#56-raw-sql)
   7. [Date and time](#57-date-and-time)
   8. [Referencing select aliases](#58-referencing-select-aliases)
6. [Joins and Table Aliases](#6-joins-and-table-aliases)
   1. [Table aliases](#61-table-aliases)
7. [Interception](#7-interception)
   1. [Helpers](#71-helpers)
8. [Table Classes](#8-table-classes)
   1. [Instances](#81-instances)
   2. [Static members](#82-static-members)
   3. [Columns](#83-columns)
9. [Subclassing and Caching](#9-subclassing-and-caching)
   1. [Caching](#91-caching)


## 1 Setup

Open a database by passing a single options object:

```ts
import { Database } from "jsr:@db/sqlite";
import { LiteClient } from "jsr:@ts-series/lite-client";

const db = new LiteClient({
	adapt: path => ({ db: new Database(path) }),
	paths: "trading.db",
	pragmas: {
		journal_mode: "wal",
		synchronous: "normal",
		foreign_keys: true,
		busy_timeout: 5000
	}
});
```

The options are:

- `adapt`  
  required function that receives the main database path and returns an adapter object
- `paths`  
  required, either a single path or an object with a `main` path and further schema names
- `pragmas`  
  optional, see [Pragmas](#14-pragmas)
- `debug`  
  optional, prints every generated SQL statement to stdout when `true`
- `intercept`  
  optional global interceptor, see [Interception](#7-interception)
- `attachmentParams`  
  optional URI parameters for attached databases, defaults to `{ mode: "ro" }`

The driver instance stays accessible as `db.connection`, for example to call driver-specific methods.

### 1.1 Generating table classes

LiteClient.ts works with table classes, which [SMake](https://github.com/ts-series/smake) generates from the schema of a SQLite database. An existing database is enough for this: SMake opens it in read-only mode and reads all metadata regarding tables and views to create corresponding classes in a TypeScript module.

Install SMake once, for example with Deno:

```sh
deno install -A -g jsr:@ts-series/smake
```

#### Direct mode

Pass the database path and the target directory:

```sh
smake orm ./example.db ./orm/
```

This creates `./orm/example.ts`. The module name is the file name of the database without extension. Optional arguments:

- `--lib <import>`  
  import path or alias for the ORM base library
- `--indent <n|string>`  
  a number from 1 to 8 or a literal string, where 1 stands for a tab

```sh
smake orm ./example.db ./orm/ --lib jsr:@ts-series/lite-client --indent 4
```

All other settings use their defaults: class names in PascalCase, property names in camelCase, views included. An existing module with the same name is overwritten.

#### With a `smake.json`

A configuration file is only needed for non-default settings. List the database with an empty `scripts` array:

```json
{
	"orm": {
		"directory": "./orm/",
		"columnNaming": "snake_case",
		"includingViews": false
	},
	"databases": {
		"example.db": {
			"scripts": []
		}
	}
}
```

Then run, in the directory of the file:

```sh
smake orm
```

Never run plain `smake` or `smake build` for this purpose. A build deletes the database file, including its `-wal`, `-shm` and `-journal` files, before executing the scripts, and with an empty list the result is an empty database.

#### Domain types

SQLite does not store which custom type a column was declared with. Without further information, columns are typed by their plain SQLite affinity (`number`, `string`, `Uint8Array`) and no enums or domain types are generated. To get them, SMake needs the type definitions and the link between columns and types:

- `types`  
  path to the JSON file that defines the domain types
- the cache file `example.json` next to the database, which SMake writes on every build and reads again in `smake orm`
- `ormTypes` per database, if no cache file exists or columns should be assigned a type afterwards. These entries take precedence over the cache.

```json
{
	"types": "./custom-types.json",
	"orm": {
		"directory": "./orm/",
		"validatorImport": "zod"
	},
	"databases": {
		"example.db": {
			"scripts": [],
			"ormTypes": {
				"Entity": {
					"risk": "Risk"
				}
			}
		}
	}
}
```

With `types` set, SMake also writes a `definitions.ts` module into the target directory and imports it in the generated module. The direct mode does not read a types file, so domain types always require the `smake.json` mode.

#### Result

For every table and, by default, every view the module contains an `Entry` interface and a class derived from `TableObject`, with static column objects (`Entity.$risk`), `columns`, `metadata`, `uniqueConstraints` and, if `validatorImport` is set, a Zod `schema`. All members are described in [Table Classes](#8-table-classes). The schema name for [attached databases](#13-attached-databases) is derived from the file name in PascalCase (`example.db` becomes `Example`), unless `schemaName` is set in `smake.json`.

The generated classes are used directly in queries:

```ts
import { LiteClient } from "jsr:@ts-series/lite-client";
import { Database } from "jsr:@db/sqlite";

import { Entity } from "./orm/example.ts";

const db = new LiteClient({
	adapt: path => ({ db: new Database(path) }),
	paths: "example.db"
});

const rows = db.all({
	select: Entity,
	where: Entity.$country.equal("DE")
});
```

Re-run `smake orm` whenever the database schema changes.

### 1.2 Adapters

The adapter object returned by `adapt` contains the driver's database object. The database object must provide `prepare(sql)`, `exec(sql)` and `transaction(fn)`.

Some SQLite drivers use different method names internally. Map them with `renames`. The renamable statement methods are `iterate`, `run`, `finalize` and `source`:

```ts
const adapt = path => ({
	db: new Database(path),
	renames: { iterate: "iter", source: "sql" }
});
```

If renaming is not enough, supply your own `prepare` function. It must return an object with `iterate`, `run`, `finalize` and optionally `source`:

```ts
const adapt = path => ({
	db: new Database(path),
	prepare: sql => createStatement(sql)
});
```

### 1.3 Attached databases

To attach additional schema files, pass an object instead of a plain path:

```ts
const db = new LiteClient({ adapt, paths: { main: "app.db", archive: "archive.db" } });
```

Attached databases open read-only by default. Pass a different `attachmentParams` object to override this:

```ts
const db = new LiteClient({
	adapt,
	paths: { main: "app.db", archive: "archive.db" },
	attachmentParams: { mode: "rw" }
});
```

### 1.4 Pragmas

All pragmas are optional and applied once when the client is created:

- `journal_mode`: `"wal"`, `"delete"`, `"truncate"`, `"persist"`, `"memory"` or `"off"`
- `synchronous`: `"off"`, `"normal"`, `"full"` or `"extra"`
- `busy_timeout`: number
- `temp_store`: `"default"`, `"file"` or `"memory"`
- `cache_size`: number
- `foreign_keys`: boolean
- `wal_autocheckpoint`: number
- `mmap_size`: number
- `page_size`: number
- `locking_mode`: `"normal"` or `"exclusive"`
- `automatic_index`: boolean

Pass `debug: true` to print every generated SQL statement. This is the behavior of the default interceptor, see [Interception](#7-interception) for full control.


## 2 Querying

The query methods differ in what they return:

- `get`  
  first row as a named record (object), or `undefined`
- `all`  
  all rows as an array of named records (objects)
- `value`  
  first row as a positional array, or `undefined`
- `values`  
  all rows as an array of positional arrays
- `scalar`  
  the single value of the first row's first column, or `undefined`
- `scalars`  
  the first column's value from every row, as a flat array

`get`, `value` and `scalar` always add `limit 1` and do not support `nestBy`.

Every method accepts the following argument forms (`scalar` accepts only the clauses and raw SQL forms):

- a table class, which selects all its columns
- one or more columns, which selects exactly those columns
- a clauses object
- a raw SQL string followed by bind parameters

```ts
const products = db.all(Product);
const first = db.get(Product);
const ids = db.values(Product.$id, Product.$title);
const row = db.value(Product);
```

### 2.1 Clauses

A clauses object maps directly to SQL clauses:

- `select` or `selectDistinct`  
  the selection, either a table, a column, an `Sql` expression, an array of these, or an object that maps aliases to columns or expressions
- `from`  
  a table, a [join chain](#6-joins-and-table-aliases) or a [derived table](#3-subqueries-and-derived-tables). It is inferred from the selection when omitted and only needed for joins, derived tables, or selections without columns.
- `where`  
  an expression, an array of expressions combined with `and`, or a plain object of column-equals pairs
- `groupBy`  
  a column or an array of columns and expressions
- `having`  
  an expression
- `orderBy`  
  a column or an array of columns and orderings
- `limit` and `offset`  
  numbers
- `nestBy`  
  see [Nesting results](#25-nesting-results)
- `intercept`  
  per-call interceptor, see [Interception](#7-interception)

```ts
const recent = db.all({
	select: Product,
	where: Product.$category.equal("books"),
	orderBy: Product.$createdAt.desc,
	limit: 20,
	offset: 40
});
```

Select specific columns by listing them. The row type is inferred automatically:

```ts
const rows = db.all({
	select: [Product.$id, Product.$title, Product.$price] as const,
	where: Product.$price.less(50)
});
```

The type of `rows` is `{ id: number; title: string; price: number }[]`.

Selections can also be given as a plain object, mapping each alias to a column or expression. This guarantees that every selected field has an explicit name, which [derived tables](#3-subqueries-and-derived-tables) require:

```ts
const rows = db.all({
	select: { id: Product.$id, effectivePrice: Sql.coalesce(Product.$salePrice, Product.$price) }
});
```

Use `selectDistinct` in place of `select` to remove duplicate rows:

```ts
const categories = db.scalars({ selectDistinct: Product.$category });
```

`where` accepts three forms:

```ts
db.all({ select: Product, where: Product.$category.equal("books") });

db.all({ select: Product, where: { category: "books", stock: 0 } });

db.all({
	select: Product,
	where: [
		Product.$category.equal("books"),
		Product.$price.less(50)
	]
});
```

### 2.2 Ordering

`orderBy` takes columns, which sort ascending, or the `.asc` and `.desc` properties. Chain `.nullsFirst` or `.nullsLast` to control the position of null values:

```ts
orderBy: [Product.$category.asc, Product.$price.desc.nullsLast]
```

### 2.3 Scalars

`scalar` and `scalars` avoid unwrapping rows or arrays by hand, since the driver only produces the values you asked for:

```ts
const total = db.scalar({
	select: Sql.sum(Order.$total),
	from: Order,
	where: Order.$status.equal("open")
});

const titles = db.scalars({ select: Product.$title, where: Product.$category.equal("books") });
```

`total` has the type `number | undefined` and `titles` has the type `string[]`.

### 2.4 Raw SQL

For anything not expressible through clauses, fall back to raw SQL with bind parameters:

```ts
const rows = db.all("select * from products where price > ?", 100);
```

Statements that return no rows, such as DDL, run through `db.run`:

```ts
db.run("create index if not exists idxPrice on products (price)");
```

### 2.5 Nesting results

Add a `nestBy` clause to group rows into a nested object instead of a flat array, keyed by one or more selected columns:

```ts
const byCustomer = db.all({
	select: [Order.$customerId, Order.$id, Order.$total] as const,
	nestBy: Order.$customerId
});
```

The type of `byCustomer` is `Record<number, { id: number; total: number }[]>`.

What a nested leaf contains depends on the method:

- `all` stores an object with the remaining columns
- `values` stores an array with the remaining values
- `scalars` stores the first remaining column's value

For fast lookups by key, nest with `scalars` or `all` instead of reshaping rows by hand:

```ts
const titlesById = db.scalars({ select: [Product.$id, Product.$title] as const, nestBy: Product.$id });

const byId = db.all({ select: Product, nestBy: Product.$id });
```

The types are `Record<number, string>` and `Record<number, { id, title, price, ... }>`.

Multiple keys nest multiple levels deep:

```ts
const byCustomerAndStatus = db.all({
	select: [Order.$customerId, Order.$status, Order.$id, Order.$total] as const,
	nestBy: [Order.$customerId, Order.$status]
});
```

Each `nestBy` entry references a selected column, either directly or by its alias (set through `.as(...)`):

```ts
db.all({
	select: [Candle.$asset, Sql.max(Candle.$openTime).as("latestOpenTime")] as const,
	from: Candle,
	nestBy: "latestOpenTime"
});
```

A key that does not appear in the selection, or appears more than once, throws an error. Use an explicit alias to resolve ambiguities.

When every `nestBy` entry is an actual column object and no `groupBy` is given, the `GROUP BY` clause is derived automatically, which is useful together with aggregates:

```ts
const latestPerAsset = db.all({
	select: [Candle.$asset, Sql.max(Candle.$openTime).as("latestOpenTime")] as const,
	from: Candle,
	nestBy: Candle.$asset
});
```

This is equivalent to adding `groupBy: Candle.$asset` explicitly. Give `groupBy` explicitly whenever it needs to differ from `nestBy`, for example when grouping by more columns than are nested.

`nestBy` also works together with `returning` on [mutations](#4-mutations).


## 3 Subqueries and Derived Tables

### 3.1 Derived tables

`Sql.derive` builds a derived table, which is a subquery used in a `FROM` clause, with named, referenceable columns, just like a generated table class. Its `select` must be given as an object, so that every result column has an explicit name:

```ts
const LastDay = Sql.derive({
	select: { currency: FXRate.$currency, day: Sql.max(FXRate.$day) },
	from: FXRate,
	groupBy: FXRate.$currency
}, "LastDay");

const rows = db.all({
	select: { day: Sql.min(LastDay.$day) },
	from: LastDay
});
```

Columns of a derived table are accessed the same way as on generated tables, through `$name`. Use a derived table whenever a select alias must be filtered in a `where` clause.

### 3.2 Subqueries in conditions

A clauses object can be passed to `in` and `notIn`:

```ts
Customer.$id.in({
	select: Order.$customerId,
	where: Order.$status.equal("open")
})
```

`Sql.exists` and `Sql.notExists` wrap a subquery in an `EXISTS` condition:

```ts
db.all({
	select: Customer,
	where: Sql.exists({
		select: Order.$id,
		where: Order.$customerId.equal(Customer.$id)
	})
});
```

### 3.3 Subqueries as scalar values

A clauses object used anywhere an expression is expected compiles to a parenthesized subquery. This allows scalar subquery comparisons:

```ts
Grouped.$day.notEqual({
	select: MonitoredAsset.$listingTime.minus(MonitoredAsset.$listingTime.modulo(86400)),
	from: MonitoredAsset,
	where: MonitoredAsset.$symbol.equal(Grouped.$asset)
})
```


## 4 Mutations

All mutation methods return `undefined` unless `returning` is set. With `returning`, `insert`, `update` and `delete` return an array of objects. The same operations are available as `db.values.insert`, `db.values.update` and `db.values.delete`, which return positional arrays, and as `db.scalars.insert`, `db.scalars.update` and `db.scalars.delete`, which return the first returned column of every row.

### 4.1 Insert

Pass a table instance to insert it. Multiple instances can be passed as an array:

```ts
db.insert(new Product({ title: "Dune", price: 14.99 }));

db.insert([
	new Product({ title: "Foundation", price: 12.99 }),
	new Product({ title: "Neuromancer", price: 11.49 })
]);
```

Use a clauses object for more control. `values` accepts a single object, an array of objects, or an array of arrays:

```ts
const created = db.insert({
	into: Product,
	values: [{ title: "Dune", price: 14.99 }],
	returning: Product
});
```

The inserted columns are taken from the properties of the first object that are not `undefined`. A missing value falls back to the column's known default, then to `null` for nullable columns, and otherwise throws an error.

With an array of arrays, name the columns in `into`. Each inner array must contain one value per column:

```ts
db.insert({
	into: [Product.$title, Product.$price],
	values: [["Dune", 14.99], ["Foundation", 12.99]]
});
```

Multiple rows are inserted within a single transaction.

### 4.2 Handling conflicts

Pass an `onConflict` clause to upsert on a uniqueness-constraint violation. It compiles to `ON CONFLICT ... DO UPDATE` or `DO NOTHING`, portable between SQLite and PostgreSQL:

```ts
db.insert({
	into: Asset,
	values: [{ symbol: "ETH", price: 3200 }],
	onConflict: {
		target: [Asset.$symbol],
		set: { price: excluded.$price }
	}
});
```

`excluded.$column` refers to the row that was about to be inserted. It is the standard way to reference the incoming value inside the update, and composable like any column expression:

```ts
onConflict: {
	target: [Asset.$symbol],
	set: { quantity: Asset.$quantity.plus(excluded.$quantity) }
}
```

If `set` is omitted, every non-target column is set to its incoming value automatically:

```ts
onConflict: { target: [Asset.$symbol] }
```

To do nothing on conflict instead of updating, pass `null`:

```ts
onConflict: null
```

The remaining options are:

- `target`  
  optional on SQLite, where it falls back to any uniqueness-constraint violation, but required by PostgreSQL when using `set`
- `targetWhere`  
  narrows a partial-index target
- `where`  
  filters which conflicting rows actually get updated

### 4.3 SQLite-specific conflict handling

Beyond the portable `onConflict` clause, SQLite's own `INSERT OR ...` variants are available as separate methods. They have no PostgreSQL equivalent, so prefer `onConflict` for anything that should also run there:

```ts
db.insertOrIgnore(new Product({ title: "Dune", price: 14.99 }));
```

`insertOrIgnore`, `insertOrFail`, `insertOrRollback` and `insertOrReplace` each mirror SQLite's respective `INSERT OR action` variant. They are also available as `db.values.insertOrIgnore` and `db.scalars.insertOrIgnore`, and likewise for the other variants.

### 4.4 Update

Update by passing an instance. The `WHERE` clause is derived from its unique constraints, and properties that are `undefined` are skipped:

```ts
product.price = 9.99;
db.update(product);
```

Or specify the target explicitly:

```ts
db.update({
	table: Product,
	set: { price: 9.99 },
	where: Product.$id.equal(42)
});
```

An update clauses object also accepts `returning`, `nestBy`, `orderBy`, `limit`, `offset` and `intercept`.

### 4.5 Delete

Pass an instance, a table class, or a clauses object. Passing a table class without conditions deletes every row:

```ts
db.delete(product);

db.delete({
	from: Product,
	where: Product.$category.equal("discontinued"),
	returning: Product.$id
});
```

A delete clauses object also accepts `nestBy`, `orderBy`, `limit`, `offset` and `intercept`.


## 5 Expressions and Conditions

Column objects expose operator methods that build composable SQL expressions:

```ts
Product.$price.greater(10)
Product.$title.like("Dune%")
Product.$stock.between(1, 100)
Product.$deletedAt.isNull
Product.$category.in(["fiction", "science"])
```

Available methods on columns and expressions:

- Comparison: `equal`, `notEqual` (alias `unequal`), `greater`, `greaterOrEqual`, `less`, `lessOrEqual`, `between`
- Null checks: `isNull`, `isNotNull`
- Sets: `in`, `notIn`, each taking an array or a subquery
- Patterns: `like`, `notLike` (alias `unlike`)
- Logic: `and`, `or`, `not`
- Arithmetic: `plus`, `minus`, `multiply`, `divide`, `modulo`, `negative`
- Text: `concat`

Combine expressions with `and` and `or`:

```ts
Product.$price.less(20).and(Product.$stock.greater(0))
```

Expressions of type `Sql` are mutable: every method appends to the expression and returns it. Build a fresh expression for each use instead of storing one in a variable and extending it in several places. Methods on columns always create a new expression.

### 5.1 Aggregates

Aggregates are methods on columns and expressions. Each returns an expression that can be aliased:

- `avg()`, `count()`, `sum()`, `total()`, `max()`, `min()`
- `groupConcat(separator?)`, which compiles to `group_concat`, or to `string_agg` when a separator is given
- `median()`
- `percentile(p)`, `percentileCont(p)`, `percentileDisc(p)`

```ts
db.scalar({ select: Order.$total.avg(), from: Order });
```

The `Sql` namespace offers the same aggregates in function style, for example `Sql.sum(Order.$total)` and `Sql.max(Candle.$openTime)`.

### 5.2 Scalar functions

`Sql` provides static helpers for multi-argument functions:

```ts
Sql.coalesce(Product.$salePrice, Product.$price)
Sql.concat(Product.$firstName, " ", Product.$lastName)
Sql.max(Product.$basePrice, Sql.coalesce(Product.$salePrice, 0))
Sql.min(Product.$basePrice, Product.$salePrice)
```

Note the difference between `Sql.max(a, b)`, the scalar function that returns the larger of its arguments, and `column.max()`, the aggregate over all rows. On SQLite both compile to `max(...)`, and SQLite decides by the number of arguments. PostgreSQL has no scalar `max`, so use `Sql.greatest(...)` and `Sql.least(...)` there. These two are not available on SQLite.

Instances also provide `coalesce`:

```ts
Product.$salePrice.coalesce(Product.$price, 0)
```

### 5.3 Aliasing in selections

Expressions can be aliased for use in a selection. Columns can be aliased the same way:

```ts
{
	select: [
		Product.$id,
		Product.$title.as("name"),
		Sql.coalesce(Product.$salePrice, Product.$price).as("effectivePrice")
	] as const
}
```

### 5.4 Casting

`.cast(type)` wraps an expression in `CAST(... AS type)`. Shorthand getters cover the common SQLite types `asInteger`, `asReal`, `asText`, `asBlob` and `asNumeric`:

```ts
Order.$total.cast("real")
Order.$total.asReal
FXRate.$day.asInteger
```

### 5.5 Row values

`sql(...)` combines several values or expressions into a row value. With more than one argument it compiles to `(a, b, c)`, matching what `in()` expects for a subquery returning multiple columns. `Sql.row(...)` does the same, even for a single argument:

```ts
sql(Candle.$asset, Candle.$interval, dayExpr).in({
	select: { asset: Grouped.$asset, interval: Grouped.$interval, day: Grouped.$day },
	from: Grouped
})
```

With a single argument, `sql(x)` is equivalent to `x` itself, unwrapped.

### 5.6 Raw SQL

`Sql.raw(text)` inserts unquoted SQL text verbatim, for anything the expression builder does not cover:

```ts
Sql.raw("cast(strftime('%s', 'now', 'start of day') as integer)")
```

Prefer the typed helpers where available and reach for `Sql.raw` only as a fallback.

### 5.7 Date and time

`Sql.strftime(...)` maps to SQLite's `strftime(...)`, and composes with `.cast` and `.asInteger` like any other expression:

```ts
Sql.strftime("%s", "now", "start of day").asInteger
```

### 5.8 Referencing select aliases

`alias.$name` refers to a name introduced through `.as(...)` in the current selection, for use in `groupBy`, `orderBy` or `having`, anywhere SQLite itself allows referencing a select-list alias. It does not work in `where`, since SQLite evaluates `where` before the select list. Use a [derived table](#3-subqueries-and-derived-tables) in that case:

```ts
{
	select: { day: dayExpr, cnt: Candle.$openTime.count() },
	from: Candle,
	groupBy: alias.$day,
	having: alias.$cnt.greater(10)
}
```

`alias.$name` refers to a select alias within one query, whereas `Table.alias(name)` creates a second name for a whole table, see [Table aliases](#61-table-aliases).


## 6 Joins and Table Aliases

Start a join chain from any table class:

```ts
const rows = db.all({
	select: [Order.$id, Customer.$name, Product.$title] as const,
	from: Order
		.innerJoin(Order.$customerId, Customer.$id)
		.leftJoin(OrderLine.$orderId, Order.$id)
		.leftJoin(OrderLine.$productId, Product.$id),
	where: Customer.$country.equal("DE")
});
```

For more complex ON clauses, pass a full `Sql` expression instead of a column pair:

```ts
Order.leftJoin(
	Order.$customerId.equal(Customer.$id).and(Customer.$active.equal(1))
)
```

Every ON clause must reference a table that is not yet part of the chain, which becomes the joined table. Otherwise an error is thrown.

Available join types:

- `innerJoin`, `leftJoin`, `leftOuterJoin` and `crossJoin`, which take either a column pair or an expression
- `naturalJoin`, `naturalLeftJoin`, `naturalLeftOuterJoin`, `naturalInnerJoin` and `naturalCrossJoin`, which take the table to join and no ON clause

```ts
Order.naturalLeftJoin(Customer)
```

### 6.1 Table aliases

`Table.alias(name)` returns a copy of a table class under a new name, with all columns rebound to it. This enables self-joins and repeated joins of the same table:

```ts
const Parent = Category.alias("Parent");

const rows = db.all({
	select: [Category.$name, Parent.$name.as("parentName")] as const,
	from: Category.leftJoin(Category.$parentId, Parent.$id)
});
```

The alias is rendered as `"Category" as "Parent"` in the generated SQL.


## 7 Interception

Every query and mutation runs through an interceptor, a function that wraps its actual execution. Set one globally on the client:

```ts
const db = new LiteClient({
	adapt,
	paths: "app.db",
	intercept: (info, run) => {
		try {
			return run();
		}
		catch (error) {
			logError({ kind: info.kind, sql: info.sql, error });
			throw error;
		}
	}
});
```

`info` describes the operation:

- `kind`  
  an `OperationKind` value: `select`, `insert`, `update`, `delete` or `raw`
- `sql`  
  the compiled statement
- `method`  
  a `ReturnMethod` value (`all`, `get`, `values`, `value`, `scalars` or `scalar`). It is always set for `select`, and for `insert`, `update` and `delete` only when `returning` is used.
- `debugging`  
  whether debugging is on

What else is available depends on `kind`:

- for `raw` calls, `info.params` holds the bind parameters passed to `run(sql, ...params)`
- for `insert`, `update` and `delete`, `info.data` holds the original clauses object passed to the call, so an interceptor can inspect what was actually being inserted, updated or deleted, not just the compiled SQL

`run()` executes the operation and returns its result. An interceptor can retry, log, measure timing, enforce guards, skip the call entirely, or just call `run()` straight through:

```ts
intercept: (info, run) => {
	if (info.kind === OperationKind.insert && Array.isArray(info.data.values) && info.data.values.length === 0) {
		return undefined;
	}
	else {
		return run();
	}
}
```

An interceptor can also be set per call, as an additional field on the clauses object, overriding the client's global one for that call only:

```ts
db.all({
	select: Product,
	intercept: (info, run) => {
		console.log(`running: ${info.sql}`);
		return run();
	}
});
```

### 7.1 Helpers

- `defaultInterceptor`  
  the built-in interceptor, which prints the SQL when debugging is on and then runs the operation
- `isMootMutation(info)`  
  true if an insert has no values or an update sets only `undefined` values, which makes the database call pointless
- `emptyResultFor(info.method)`  
  returns the matching empty fallback, which is `[]` for `all`, `values` and `scalars`, and `undefined` otherwise

Together they make a guard for skipping pointless mutations:

```ts
intercept: (info, run) => {
	if (isMootMutation(info)) {
		return emptyResultFor(info.method);
	}
	else {
		return run();
	}
}
```


## 8 Table Classes

`smake` generates one class per table. The class describes the table, and instances represent rows.

### 8.1 Instances

The constructor takes an object of column values. Missing columns are filled with the column's known default, or `null` for nullable columns, or stay `undefined`:

```ts
const product = new Product({ title: "Dune", price: 14.99 });
```

Instances can be passed directly to `db.insert`, `db.update` and `db.delete`. Their `uniqueCondition` getter builds a `WHERE` condition from the first unique constraint whose columns are all defined. If none qualifies, the condition is empty.

### 8.2 Static members

- `Product.$title` and the other `$column` properties  
  column objects for building queries
- `Product.columns`  
  all column objects
- `Product.metadata`  
  columns by logical name
- `Product.uniqueConstraints`  
  the columns of each unique constraint
- `Product.physicalName`, `Product.schemaName` and `Product.fullName`  
  names as they appear in the database
- `Product.schema`  
  a validator with `parse(data)` and `safeParse(data)`, where `safeParse` returns either `{ success: true, data }` or `{ success: false, error }`
- `Product.equal(object)`  
  builds a condition from column-equals pairs, which is also what the object form of `where` uses
- `Product.alias(name)`  
  see [Table aliases](#61-table-aliases)

The row type of a table is available as `Product["entry"]`, or through the `EntryOf<typeof Product>` helper type.

### 8.3 Columns

A column object carries `name`, `physicalName`, `table`, `type`, `generated`, `nullable`, `optional` and `knownDefault`. It provides every expression method from [Expressions and Conditions](#5-expressions-and-conditions), plus `.asc` and `.desc` for ordering and `.as(alias)` for renaming.


## 9 Subclassing and Caching

For applications with a fixed database schema, subclassing `LiteClient` keeps all query logic in one place:

```ts
import { LiteClient, Pragmas } from "jsr:@ts-series/lite-client";
import { Database } from "jsr:@db/sqlite";

export class AppDb extends LiteClient<Database> {

	constructor(pragmas: Pragmas, debug = false) {
		super({ adapt: path => ({ db: new Database(path) }), paths: "app.db", pragmas, debug });
	}

	allActiveOrders() {
		return this.all({
			select: Order,
			where: Order.$status.equal("open"),
			orderBy: Order.$createdAt.desc
		});
	}

	ordersByCustomer(customerId: number) {
		return this.all({
			select: [Order.$id, Order.$total, Order.$status] as const,
			where: Order.$customerId.equal(customerId),
			nestBy: Order.$id
		});
	}
}
```

### 9.1 Caching

`LiteCache` extends `LiteClient` with an in-memory layer. It takes the same options as `LiteClient`:

```ts
import { LiteCache, Pragmas } from "jsr:@ts-series/lite-client";

export class ShopDb extends LiteCache<Database> {

	constructor(pragmas: Pragmas, debug = false) {
		super({ adapt: path => ({ db: new Database(path) }), paths: "shop.db", pragmas, debug });
	}

	get $categories() {
		return this.all({ select: Category, nestBy: Category.$id });
	}

	get $taxRates() {
		return this.scalars({ select: [TaxRate.$country, TaxRate.$rate] as const, nestBy: TaxRate.$country });
	}
}

const db = new ShopDb({ journal_mode: "wal", foreign_keys: true });

db.cache.categories;
db.cache.taxRates;

db.reload();
```

Each `$`-prefixed getter performs a database query and is called once on construction. The results are stored under the unprefixed name and typed through `db.cache`, which is a `CacheOf<this>`. Afterwards, `db.cache.categories` returns the cached value directly, until `reload()` re-runs all getters and replaces the cache.

The unprefixed names are also defined as properties on the instance at runtime, so `db.categories` works as well. TypeScript only knows about them when they are declared:

```ts
declare categories: Record<number, object>;
declare taxRates: Record<string, number>;
```

Only getters defined directly on the subclass are loaded. Getters inherited from further base classes are ignored, so keep all `$`-prefixed getters in the class that extends `LiteCache`.