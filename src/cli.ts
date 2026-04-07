import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";

import {
	ensureAzureCliAvailable,
	getWorkItemDetails,
	queryWorkItems,
} from "./azure.js";
import { CliError } from "./errors.js";
import { renderJson } from "./exporters/json.js";
import { renderMarkdown } from "./exporters/markdown.js";
import {
	confirmOverwrite,
	normalizeOutputFormat,
	promptForMissingInputs,
} from "./prompts.js";
import type {
	AzureFields,
	AzureWorkItem,
	ExportInputs,
	ExportResult,
	ExportWorkItem,
	OutputFormat,
} from "./types/index.js";

type CliDependencies = {
	access: typeof fs.access;
	azure: {
		ensureAzureCliAvailable: typeof ensureAzureCliAvailable;
		getWorkItemDetails: typeof getWorkItemDetails;
		queryWorkItems: typeof queryWorkItems;
	};
	confirmOverwrite: typeof confirmOverwrite;
	cwd: () => string;
	now: () => Date;
	promptForMissingInputs: typeof promptForMissingInputs;
	writeFile: typeof fs.writeFile;
};

const defaultDependencies: CliDependencies = {
	access: fs.access,
	azure: {
		ensureAzureCliAvailable,
		getWorkItemDetails,
		queryWorkItems,
	},
	confirmOverwrite,
	cwd: () => process.cwd(),
	now: () => new Date(),
	promptForMissingInputs,
	writeFile: fs.writeFile,
};

function getStringField(fields: AzureFields, key: string): string | null {
	const value = fields[key];
	return typeof value === "string" && value.trim() !== "" ? value : null;
}

function getAssignedTo(fields: AzureFields): string | null {
	const value = fields["System.AssignedTo"];

	if (typeof value === "string" && value.trim() !== "") {
		return value;
	}

	if (typeof value === "object" && value !== null) {
		const displayName =
			"displayName" in value && typeof value.displayName === "string"
				? value.displayName
				: null;
		if (displayName && displayName.trim() !== "") {
			return displayName;
		}

		const uniqueName =
			"uniqueName" in value && typeof value.uniqueName === "string"
				? value.uniqueName
				: null;
		if (uniqueName && uniqueName.trim() !== "") {
			return uniqueName;
		}
	}

	return null;
}

function getTags(fields: AzureFields): string[] {
	const value = fields["System.Tags"];

	if (typeof value !== "string" || value.trim() === "") {
		return [];
	}

	return value
		.split(";")
		.map((tag) => tag.trim())
		.filter(Boolean);
}

export function normalizeWorkItem(workItem: AzureWorkItem): ExportWorkItem {
	const rawFields = workItem.fields ?? {};

	return {
		areaPath: getStringField(rawFields, "System.AreaPath"),
		assignedTo: getAssignedTo(rawFields),
		description: getStringField(rawFields, "System.Description"),
		id: workItem.id,
		iterationPath: getStringField(rawFields, "System.IterationPath"),
		rawFields,
		state: getStringField(rawFields, "System.State") ?? "Unknown",
		tags: getTags(rawFields),
		title: getStringField(rawFields, "System.Title") ?? "Untitled",
		type: getStringField(rawFields, "System.WorkItemType") ?? "Unknown",
		url: typeof workItem.url === "string" ? workItem.url : null,
	};
}

function renderOutput(result: ExportResult, format: OutputFormat): string {
	return format === "json" ? renderJson(result) : renderMarkdown(result);
}

async function ensureWritableTarget(
	access: CliDependencies["access"],
	filePath: string,
	fileName: string,
	confirmOverwriteFn: CliDependencies["confirmOverwrite"],
): Promise<void> {
	try {
		await access(filePath);
		const shouldOverwrite = await confirmOverwriteFn(fileName);

		if (!shouldOverwrite) {
			throw new CliError(
				"Export cancelled. The existing file was not overwritten.",
			);
		}
	} catch (error) {
		if (error instanceof CliError) {
			throw error;
		}

		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw new CliError("Unable to access the selected output file.", [
				(error as Error).message,
			]);
		}
	}
}

export async function runExportWorkflow(
	inputs: ExportInputs,
	dependencies: CliDependencies = defaultDependencies,
): Promise<void> {
	const exportInputs = await dependencies.promptForMissingInputs(inputs);
	const queryId = exportInputs.queryId;

	await dependencies.azure.ensureAzureCliAvailable();

	const refs = await dependencies.azure.queryWorkItems(queryId);

	if (refs.length === 0) {
		console.log(chalk.yellow(`No work items were found for query ${queryId}.`));
		return;
	}

	const items: ExportWorkItem[] = [];

	for (const ref of refs) {
		const workItem = await dependencies.azure.getWorkItemDetails(ref.id);
		items.push(normalizeWorkItem(workItem));
	}

	const result: ExportResult = {
		exportedAt: dependencies.now().toISOString(),
		itemCount: items.length,
		items,
		queryId,
	};

	const renderedOutput = renderOutput(result, exportInputs.format);

	if (exportInputs.outputTarget === "inline") {
		console.log(renderedOutput);
		return;
	}

	if (!exportInputs.fileName) {
		throw new CliError(
			"A file name is required when writing output to a file.",
		);
	}

	const targetPath = path.join(dependencies.cwd(), exportInputs.fileName);

	await ensureWritableTarget(
		dependencies.access,
		targetPath,
		exportInputs.fileName,
		dependencies.confirmOverwrite,
	);

	await dependencies.writeFile(targetPath, renderedOutput, "utf8");

	console.log(
		chalk.green(`Exported ${items.length} work items to ${targetPath}`),
	);
}

export function createProgram(
	dependencies: CliDependencies = defaultDependencies,
): Command {
	return new Command()
		.name("azdo-work-items")
		.description("CLI tool for exporting Azure DevOps work items")
		.version("0.1.0")
		.argument("[queryId]", "Azure DevOps query ID")
		.option("--queryId <queryId>", "Azure DevOps query ID")
		.option("--format <format>", "Output format: json or md")
		.option(
			"--inline",
			"Print the export in the terminal instead of writing a file",
		)
		.option(
			"--fileName <fileName>",
			"Output file name in the current directory",
		)
		.action(async (queryId: string | undefined, options) => {
			await runExportWorkflow(
				{
					fileName: options.fileName,
					format: options.format
						? normalizeOutputFormat(options.format)
						: undefined,
					inline: options.inline,
					queryId: options.queryId ?? queryId,
				},
				dependencies,
			);
		});
}
