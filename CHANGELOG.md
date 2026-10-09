# Changelog

## 2.0: First Public Release

The main goal of this release is a driver-agnostic SQLite client. An adapter interface lets any driver that exposes a `prepare`/`iterate`/`run`/`finalize`-shaped statement be plugged in, with optional method renaming or a custom `prepare` function. This decouples the query-building core from driver specifics, so any Deno or Node SQLite driver can be used. The driver instance stays accessible as `db.connection`.

Furthermore, the codebase was restructured in preparation for future PostgreSQL support.

### Querying

- New `scalar`/`scalars` methods return single values or flat arrays of values instead of row objects, while `value`/`values` always return positional arrays.
- All query methods accept a table class, one or more columns, a clauses object or a raw SQL string with bind parameters.
- A `nestBy` clause groups or keys the results of `all`/`values`/`scalars` into a nested object, referencing one or more selected columns directly or by alias. When every key is an actual column and no `groupBy` is given, `GROUP BY` is derived automatically. It also works together with `returning` on mutations. The single-row methods `get`/`value`/`scalar` do not support it.
- `select` accepts plain objects (`{ alias: column | expression }`) and raw literals with positional fallback aliases (`_0`, `_1`, …). `selectDistinct` is available as an alternative.
- `where` accepts an expression, an array of expressions combined with `and`, or a plain object of column-equals pairs.
- `offset` and `orderBy` with `nullsFirst`/`nullsLast` were added.
- `db.run` executes raw statements that return no rows.

### Mutations

- A dialect-neutral `onConflict` clause compiles to `ON CONFLICT ... DO UPDATE`/`DO NOTHING`:
  - `excluded.$column` references the incoming row and composes like any column expression.
  - Omitting `set` updates all non-target columns, and `null` performs `DO NOTHING`.
- `insertOrIgnore`/`insertOrFail`/`insertOrRollback`/`insertOrReplace` remain available as SQLite-specific methods, also as `db.values.*` and `db.scalars.*` variants.
- `insert` accepts objects, table instances, or arrays of arrays together with a column list in `into`.
- `insert`, `update` and `delete` support `returning`, and `db.values.*` and `db.scalars.*` offer positional and scalar result forms.
- `update` and `delete` support `orderBy`, `limit` and `offset`.

### SQL building

- `Sql.derive(...)` builds derived tables with named columns, accessed through `$name` like generated table classes.
- Any comparison accepts a `SelectClauses` object as operand, compiling to a parenthesized scalar subquery. `Sql.exists` and `Sql.notExists` wrap subqueries in `EXISTS` conditions.
- `sql(...)` and `Sql.row(...)` build row values for multi-column `in`/`notIn`.
- `alias.$name` references a select alias from `groupBy`, `orderBy` or `having`.
- `Table.alias(name)` enables self-joins and repeated joins of the same table.
- `Sql.raw(...)` inserts literal SQL text for cases the builder does not cover.
- `Sql` is now a namespace of static functions (`max`, `min`, `coalesce`, `concat`, `strftime`, `greatest`, `least`, `derive`, …), so no bound expression instance is needed.
- Additional functions and aggregates cover more of SQLite's built-ins, such as `median`, `percentile`, `percentileCont`, `percentileDisc`, `total` and `groupConcat` (with an optional separator). The `cast` shorthands `asInteger`, `asReal`, `asText`, `asBlob` and `asNumeric` and the aliases `unequal` and `unlike` were added as well.

### Table classes

Generated table classes expose `columns`, `metadata`, `uniqueConstraints` and a `schema` validator with `parse`/`safeParse`. Instances provide a `uniqueCondition`, which `update` and `delete` use to derive their `WHERE` clause.

### Interception

Interceptors can be set globally or per call as a meta-clause. The passed `info` discriminates by `kind`: mutations carry the original clauses object as `data`, and `raw` calls carry `params`. Typical uses are error handling and logging, retries on `SQLITE_BUSY`, slow-query monitoring, read-only guards, query counting in tests, and debug output, which now runs through this mechanism as well. The helpers `defaultInterceptor`, `isMootMutation` and `emptyResultFor` simplify common interceptors, such as skipping inserts and updates that carry no data.

### Client and caching

- The client constructor takes a single options object (`adapt`, `paths`, `pragmas`, `debug`, `intercept`, `attachmentParams`) instead of positional arguments. `pragmas` is a typed `Pragmas` interface.
- Additional schema files can be attached through `paths`, read-only by default.
- `LiteCache` extends the client with an in-memory cache, filled from `$`-prefixed getters, typed through `db.cache` and refreshed through `reload()`.


## 1.0: Internal Version

Internal-use version, providing only a SQL builder for the Deno FFI driver.
