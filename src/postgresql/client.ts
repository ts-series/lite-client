
import { BaseClient } from "../standard/base-client.ts";
import { ReturnMethod } from "../standard/interception.ts";


//

export class PostgresClient extends BaseClient {

	protected override execute(method: ReturnMethod, sql: string, params?: unknown[]): unknown {
		throw new Error("Method not implemented.");
	}


	protected override executeMany(sql: string, rows: unknown[][]): void {
		throw new Error("Method not implemented.");
	}


	protected override executeManyReturning(
		sql: string,
		rows: unknown[][],
		method: ReturnMethod.all | ReturnMethod.values
	): unknown[] {
		throw new Error("Method not implemented.");
	}


	protected override executeRaw(sql: string, params?: unknown[]): unknown {
		throw new Error("Method not implemented.");
	}


	protected override placeholder(index: number): string {
		throw new Error("Method not implemented.");
	}

}
