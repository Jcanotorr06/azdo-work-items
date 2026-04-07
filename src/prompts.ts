import path from "node:path";
import { confirm, input, select } from "@inquirer/prompts";

import { CliError } from "./errors.js";
import type {
	ExportInputs,
	ExportOptions,
	OutputFormat,
	OutputTarget,
} from "./types/index.js";

function getExpectedExtension(format: OutputFormat): ".json" | ".md" {
	return format === "json" ? ".json" : ".md";
}

export function normalizeOutputFormat(value: string): OutputFormat {
	const normalized = value.trim().toLowerCase();

	if (normalized === "json" || normalized === "md") {
		return normalized;
	}

	throw new CliError("Output format must be either `json` or `md`.");
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

export function normalizeQueryId(value: string): string {
	const trimmed = value.trim();

	if (!trimmed) {
		throw new CliError("Query ID cannot be empty.");
	}

	return trimmed;
}

function normalizeOutputTarget(inputs: ExportInputs): OutputTarget | undefined {
	if (inputs.inline === true) {
		if (inputs.fileName) {
			throw new CliError("`--inline` cannot be combined with `--fileName`.");
		}

		return "inline";
	}

	if (inputs.fileName) {
		return "file";
	}

	return undefined;
}

export async function promptForMissingInputs(
	inputs: ExportInputs,
): Promise<{ queryId: string } & ExportOptions> {
	const queryId = inputs.queryId
		? normalizeQueryId(inputs.queryId)
		: normalizeQueryId(
				await input({
					message: "Enter the Azure DevOps query ID",
					validate: (value) => {
						try {
							normalizeQueryId(value);
							return true;
						} catch (error) {
							return error instanceof Error
								? error.message
								: "Invalid query ID.";
						}
					},
				}),
			);

	const format =
		(inputs.format ? normalizeOutputFormat(inputs.format) : undefined) ??
		(await select<OutputFormat>({
			choices: [
				{ name: "JSON", value: "json" },
				{ name: "Markdown", value: "md" },
			],
			message: "Choose an output format",
		}));

	const outputTarget =
		normalizeOutputTarget(inputs) ??
		(await select<OutputTarget>({
			choices: [
				{ name: "Write to file", value: "file" },
				{ name: "Print in terminal", value: "inline" },
			],
			message: "Choose an output target",
		}));

	if (outputTarget === "inline") {
		return {
			format,
			outputTarget,
			queryId,
		};
	}

	const defaultFileName =
		format === "json" ? "work-items.json" : "work-items.md";

	const fileName = inputs.fileName
		? normalizeFileName(inputs.fileName, format)
		: normalizeFileName(
				await input({
					default: defaultFileName,
					message: "Enter an output file name",
					validate: (value) => {
						try {
							normalizeFileName(value, format);
							return true;
						} catch (error) {
							return error instanceof Error
								? error.message
								: "Invalid file name.";
						}
					},
				}),
				format,
			);

	return {
		fileName: normalizeFileName(fileName, format),
		format,
		outputTarget,
		queryId,
	};
}

export async function confirmOverwrite(fileName: string): Promise<boolean> {
	return confirm({
		default: false,
		message: `${fileName} already exists. Overwrite it?`,
	});
}
