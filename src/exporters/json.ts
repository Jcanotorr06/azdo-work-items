import type { ExportResult } from "../types/index.js";

export function renderJson(result: ExportResult): string {
	return JSON.stringify(result, null, 2);
}
