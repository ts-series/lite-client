
export abstract class SqlExpression {

	_terms: unknown[] = [];


	_push(...items: unknown[]): void {
		for (const item of items) this._terms.push(item);
	}


	_append(...items: unknown[]): void {
		for (const item of items) {
			if (item instanceof SqlExpression) {
				this._terms.push(...item._terms);
			}
			else {
				this._terms.push(item);
			}
		}
	}
}


export class RawSql {
	constructor(public text: string) {}
}


// IMPLEMENTING HELPER FUNCTIONS

export function toSql(value: unknown): string {
	if (typeof value === "string") {
		return `'${value.replace(/'/g, "''")}'`;
	}
	else if (typeof value === "number") {
		return value.toString();
	}
	else if (value === null) {
		return "null";
	}
	else if (Array.isArray(value)) {
		return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
	}
	else if (typeof value === "object") {
		return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
	}
	else {
		return String(value);
	}
}
