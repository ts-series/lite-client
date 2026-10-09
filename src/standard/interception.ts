
import { DeleteClauses, InsertClauses, UpdateClauses } from "./clauses.ts";
import { Table, TableObject } from "./table.ts";


//

export enum ReturnMethod { all, get, values, value, scalars, scalar }


export enum OperationKind {
	select = "select",
	insert = "insert",
	update = "update",
	delete = "delete",
	raw = "raw"
}


export type InsertData = TableObject | TableObject[] | InsertClauses;

export type UpdateData = TableObject | UpdateClauses;

export type DeleteData = Table | TableObject | DeleteClauses;


export type OperationInfo =
	| { kind: OperationKind.select; method: ReturnMethod; sql: string; debugging: boolean }
	| { kind: OperationKind.insert; method?: ReturnMethod.all | ReturnMethod.values; sql: string; data: InsertClauses; debugging: boolean }
	| { kind: OperationKind.update; method?: ReturnMethod.all | ReturnMethod.values; sql: string; data: UpdateClauses; debugging: boolean }
	| { kind: OperationKind.delete; method?: ReturnMethod.all | ReturnMethod.values; sql: string; data: DeleteClauses; debugging: boolean }
	| { kind: OperationKind.raw; method?: undefined; sql: string; params: unknown[]; debugging: boolean };


export type Interceptor = <T>(info: OperationInfo, run: () => T) => T;


export const defaultInterceptor: Interceptor = (info, run) => {
	if (info.debugging) console.log(`\n${info.sql}`);
	return run();
};


// VARIOUS HELPER FUNCTIONS FOR IMPLEMENTING CUSTOM INTERCEPTORS

/** True if the given insert/update clauses contain no actual data, making the DB action pointless. */
export function isMootMutation(info: OperationInfo): boolean {
	if (info.kind === OperationKind.insert) {
		return Array.isArray(info.data.values) && info.data.values.length === 0;
	}
	else if (info.kind === OperationKind.update) {
		return Object.values(info.data.set).every(val => val === undefined);
	}
	else {
		return false;
	}
}


/** Returns the appropriate empty/undefined fallback for a given ReturnMethod. */
export function emptyResultFor(method?: ReturnMethod): any {
	switch (method) {
		case ReturnMethod.all:
		case ReturnMethod.values:
		case ReturnMethod.scalars:
			return [];

		case ReturnMethod.get:
		case ReturnMethod.value:
		case ReturnMethod.scalar:
		default:
			return undefined;
	}
}
