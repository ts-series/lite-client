
import { defaultInterceptor, Interceptor } from "../standard/interception.ts";

import { LiteClient, LiteClientOptions, SQLiteAdapter, SQLiteDatabase } from "./client.ts";
import { Pragmas } from "./pragmas.ts";


//

export type CacheOf<T> = {
	[K in keyof T as K extends `$${infer N}` ? N : never]: T[K]
};


export class LiteCache<DB extends SQLiteDatabase> extends LiteClient<DB> {

	readonly #loaders: [string, () => unknown][];

	#cache: Record<string, unknown>;


	constructor(options: LiteClientOptions<DB>) {
		super(options);

		this.#loaders = Object.getOwnPropertyNames(Object.getPrototypeOf(this))
			.filter(k => k.startsWith("$"))
			.map(k => [k.slice(1), () => (this as any)[k]]);
				// Only scans direct prototype; subclass hierarchies require walking the chain

		this.#cache = this.load();

		for (const [key] of this.#loaders) {
			Object.defineProperty(this, key, {
				get: () => this.#cache[key as keyof Cache],
				configurable: true,
				enumerable: false
			});
		}
	}


	/** Evaluates all loaders and returns their results keyed by name. */
	protected load(): Record<string, unknown> {
		return Object.fromEntries(this.#loaders.map(([k, fn]) => [k, fn()]));
	}


	/** Reloads all cached values. */
	reload(): void {
		this.#cache = this.load();
	}


	/** Returns the cached values typed by the derived class. */
	get cache(): CacheOf<this> {
		return this.#cache as unknown as CacheOf<this>;
	}
}
