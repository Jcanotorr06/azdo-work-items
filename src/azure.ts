import { type ExecaError, execa } from "execa";

import { CliError } from "./errors.js";
import type { AzureWorkItem, QueryWorkItemRef } from "./types/index.js";

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null;
}

function getErrorOutput(error: ExecaError | Error): string {
	if (
		"stderr" in error &&
		typeof error.stderr === "string" &&
		error.stderr.trim()
	) {
		return error.stderr;
	}

	if (
		"stdout" in error &&
		typeof error.stdout === "string" &&
		error.stdout.trim()
	) {
		return error.stdout;
	}

	return error.message;
}

function classifyAzureError(
	error: ExecaError | Error,
	context: "availability" | "query" | "work-item",
): CliError {
	const output = getErrorOutput(error);
	const normalizedOutput = output.toLowerCase();

	if ("code" in error && error.code === "ENOENT") {
		return new CliError(
			"Azure CLI is required but was not found on your PATH.",
			[
				"Install Azure CLI: https://learn.microsoft.com/cli/azure/install-azure-cli",
				"Then add the Azure DevOps extension with `az extension add --name azure-devops` and authenticate with `az login` or `az devops login`.",
			],
		);
	}

	if (
		normalizedOutput.includes(
			"command group 'boards' is in preview and under development",
		)
	) {
		return new CliError(output.trim());
	}

	if (
		normalizedOutput.includes("azure-devops extension") ||
		normalizedOutput.includes("extension with name 'azure-devops'") ||
		normalizedOutput.includes("extension not installed")
	) {
		return new CliError(
			"Azure DevOps CLI extension is required but not installed.",
			["Install it with `az extension add --name azure-devops`."],
		);
	}

	if (
		normalizedOutput.includes("run 'az login'") ||
		normalizedOutput.includes("please run 'az login'") ||
		normalizedOutput.includes("not logged in") ||
		normalizedOutput.includes("before you can run azure devops commands")
	) {
		return new CliError("Azure CLI is not authenticated for Azure DevOps.", [
			"Sign in with `az login` or `az devops login`, then retry the export.",
		]);
	}

	if (
		normalizedOutput.includes("organization") &&
		(normalizedOutput.includes("required") ||
			normalizedOutput.includes("configure") ||
			normalizedOutput.includes("could not determine"))
	) {
		return new CliError(
			"Azure DevOps organization or project context is missing.",
			[
				"Configure defaults with `az devops configure --defaults organization=<url> project=<name>`, or ensure your Azure CLI context is already set.",
			],
		);
	}

	if (
		context === "query" &&
		(normalizedOutput.includes("query") ||
			normalizedOutput.includes("not found"))
	) {
		return new CliError(
			"The Azure DevOps query could not be found or could not be executed.",
			["Verify the query ID and confirm you have access to that query."],
		);
	}

	if (context === "work-item") {
		return new CliError(
			"Failed to fetch one or more Azure DevOps work items.",
			[output.trim()],
		);
	}

	if (context === "availability") {
		return new CliError(
			"Azure CLI is installed but could not be executed successfully.",
			[output.trim()],
		);
	}

	return new CliError("Azure DevOps CLI command failed.", [output.trim()]);
}

function parseJson<T>(value: string, failureMessage: string): T {
	try {
		return JSON.parse(value) as T;
	} catch {
		throw new CliError(failureMessage, [
			"The Azure CLI returned output that was not valid JSON.",
		]);
	}
}

function extractId(value: unknown): number | null {
	if (typeof value === "number" && Number.isInteger(value)) {
		return value;
	}

	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number.parseInt(value, 10);
		return Number.isNaN(parsed) ? null : parsed;
	}

	return null;
}

function extractQueryRefsFromArray(value: unknown[]): QueryWorkItemRef[] {
	const refs = new Map<number, QueryWorkItemRef>();

	for (const item of value) {
		if (!isRecord(item)) {
			continue;
		}

		const directId = extractId(item.id);
		if (directId !== null) {
			refs.set(directId, {
				id: directId,
				url: typeof item.url === "string" ? item.url : undefined,
			});
		}

		for (const relationKey of ["source", "target"]) {
			const relation = item[relationKey];

			if (!isRecord(relation)) {
				continue;
			}

			const relationId = extractId(relation.id);
			if (relationId !== null) {
				refs.set(relationId, {
					id: relationId,
					url: typeof relation.url === "string" ? relation.url : undefined,
				});
			}
		}
	}

	return [...refs.values()];
}

export function extractQueryWorkItemRefs(payload: unknown): QueryWorkItemRef[] {
	if (Array.isArray(payload)) {
		return extractQueryRefsFromArray(payload);
	}

	if (!isRecord(payload)) {
		throw new CliError("Azure DevOps query returned an unexpected payload.", [
			"Expected a JSON object or array containing work item references.",
		]);
	}

	const candidates = [
		payload.workItems,
		payload.workItemRelations,
		payload.value,
	];

	for (const candidate of candidates) {
		if (Array.isArray(candidate)) {
			return extractQueryRefsFromArray(candidate);
		}
	}

	throw new CliError("Azure DevOps query returned an unexpected payload.", [
		"Expected `workItems`, `workItemRelations`, or `value` in the query response.",
	]);
}

export async function ensureAzureCliAvailable(): Promise<void> {
	try {
		await execa("az", ["--version"]);
	} catch (error) {
		throw classifyAzureError(error as ExecaError | Error, "availability");
	}
}

export async function queryWorkItems(
	queryId: string,
): Promise<QueryWorkItemRef[]> {
	try {
		const { stdout } = await execa("az", [
			"boards",
			"query",
			"--id",
			queryId,
			"--output",
			"json",
		]);
		const payload = parseJson<unknown>(
			stdout,
			"Azure DevOps query returned invalid JSON.",
		);

		return extractQueryWorkItemRefs(payload);
	} catch (error) {
		if (error instanceof CliError) {
			throw error;
		}

		throw classifyAzureError(error as ExecaError | Error, "query");
	}
}

export async function getWorkItemDetails(
	workItemId: number,
): Promise<AzureWorkItem> {
	try {
		const { stdout } = await execa("az", [
			"boards",
			"work-item",
			"show",
			"--id",
			String(workItemId),
			"--expand",
			"all",
			"--output",
			"json",
		]);

		return parseJson<AzureWorkItem>(
			stdout,
			`Work item ${workItemId} returned invalid JSON.`,
		);
	} catch (error) {
		if (error instanceof CliError) {
			throw error;
		}

		throw classifyAzureError(error as ExecaError | Error, "work-item");
	}
}
