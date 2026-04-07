import type { ExportResult } from "../types/index.js";

function escapeMarkdownCell(value: string): string {
	return value.replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ");
}

function toCell(value: string | null): string {
	return value ? escapeMarkdownCell(value) : "";
}

export function renderMarkdown(result: ExportResult): string {
	const lines = [
		"# Azure DevOps Work Items Export",
		"",
		`- Query ID: \`${result.queryId}\``,
		`- Exported At: \`${result.exportedAt}\``,
		`- Item Count: \`${result.itemCount}\``,
		"",
		"| ID | Title | Type | State | Assigned To | Area | Iteration | Tags |",
		"| --- | --- | --- | --- | --- | --- | --- | --- |",
	];

	for (const item of result.items) {
		lines.push(
			`| ${item.id} | ${toCell(item.title)} | ${toCell(item.type)} | ${toCell(item.state)} | ${toCell(item.assignedTo)} | ${toCell(item.areaPath)} | ${toCell(item.iterationPath)} | ${toCell(item.tags.join(", "))} |`,
		);
	}

	return lines.join("\n");
}
