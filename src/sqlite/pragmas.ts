
export interface Pragmas {
	journal_mode?: "wal" | "delete" | "truncate" | "persist" | "memory" | "off";
	synchronous?: "off" | "normal" | "full" | "extra";
	busy_timeout?: number;
	temp_store?: "default" | "file" | "memory";
	cache_size?: number;
	foreign_keys?: boolean;
	wal_autocheckpoint?: number;
	mmap_size?: number;
	page_size?: number;
	locking_mode?: "normal" | "exclusive";
	automatic_index?: boolean;
}


export function buildPragmaSQL(pragmas: Pragmas): string {
	const lines: string[] = [];
	for (const [key, val] of Object.entries(pragmas)) {
		if (val != null) {
			const out = typeof val === "boolean"
				? val ? "1" : "0"
				: String(val);
			lines.push(`pragma ${key} = ${out};`);
		}
	}
	return lines.length > 0 ? lines.join("\n") : "";
}
