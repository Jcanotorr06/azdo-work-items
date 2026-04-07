import path from "node:path";
import { confirm, input, select } from "@inquirer/prompts";

import { CliError } from "./errors.js";
import type { ExportOptions, OutputFormat } from "./types/index.js";

function getExpectedExtension(format: OutputFormat): ".json" | ".md" {
	return format === "json" ? ".json" : ".md";
}

export function normalizeFileName(value: string, format: OutputFormat): string {
	const trimmed = value.trim();

	if (!trimmed) {
		throw new CliError("File name cannot be empty.");
	}

	if (
		trimmed.includes("/") ||
		trimmed.includes("\\") ||
		path.basename(trimmed) !== trimmed
	) {
		throw new CliError(
			"Output file must be created in the current directory.",
			["Enter a file name only, without any path segments."],
		);
	}

	const expectedExtension = getExpectedExtension(format);
	const extension = path.extname(trimmed);

	if (!extension) {
		return `${trimmed}${expectedExtension}`;
	}

	if (extension.toLowerCase() !== expectedExtension) {
		throw new CliError(
			`File name must use the ${expectedExtension} extension for ${format.toUpperCase()} export.`,
		);
	}

	return trimmed;
}

export async function promptForExportOptions(): Promise<ExportOptions> {
	const format = await select<OutputFormat>({
		choices: [
			{ name: "JSON", value: "json" },
			{ name: "Markdown", value: "md" },
		],
		message: "Choose an output format",
	});

	const defaultFileName =
		format === "json" ? "work-items.json" : "work-items.md";

	const fileName = await input({
		default: defaultFileName,
		message: "Enter an output file name",
		validate: (value) => {
			try {
				normalizeFileName(value, format);
				return true;
			} catch (error) {
				return error instanceof Error ? error.message : "Invalid file name.";
			}
		},
	});

	return {
		fileName: normalizeFileName(fileName, format),
		format,
	};
}

export async function confirmOverwrite(fileName: string): Promise<boolean> {
	return confirm({
		default: false,
		message: `${fileName} already exists. Overwrite it?`,
	});
}
