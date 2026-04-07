import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractQueryWorkItemRefs } from "../src/azure.js";
import {
	createProgram,
	normalizeWorkItem,
	runExportWorkflow,
} from "../src/cli.js";
import { CliError } from "../src/errors.js";
import { renderJson } from "../src/exporters/json.js";
import { renderMarkdown } from "../src/exporters/markdown.js";
import { normalizeFileName } from "../src/prompts.js";
import type { AzureWorkItem } from "../src/types/index.js";

describe("extractQueryWorkItemRefs", () => {
	it("extracts work item references from a workItems response", () => {
		expect(
			extractQueryWorkItemRefs({
				workItems: [{ id: 101, url: "https://example/101" }, { id: "102" }],
			}),
		).toEqual([
			{ id: 101, url: "https://example/101" },
			{ id: 102, url: undefined },
		]);
	});

	it("extracts work item references from workItemRelations", () => {
		expect(
			extractQueryWorkItemRefs({
				workItemRelations: [
					{ source: { id: 12 }, target: { id: 42, url: "https://example/42" } },
				],
			}),
		).toEqual([
			{ id: 12, url: undefined },
			{ id: 42, url: "https://example/42" },
		]);
	});
});

describe("normalizeWorkItem", () => {
	it("maps curated fields from the Azure payload", () => {
		const workItem: AzureWorkItem = {
			fields: {
				"System.AreaPath": "Team A",
				"System.AssignedTo": {
					displayName: "Taylor",
					uniqueName: "taylor@example.com",
				},
				"System.Description": "<p>Hello</p>",
				"System.IterationPath": "Sprint 1",
				"System.State": "Active",
				"System.Tags": "foo; bar",
				"System.Title": "Fix bug",
				"System.WorkItemType": "Bug",
			},
			id: 99,
			url: "https://example/99",
		};

		expect(normalizeWorkItem(workItem)).toEqual({
			areaPath: "Team A",
			assignedTo: "Taylor",
			description: "<p>Hello</p>",
			id: 99,
			iterationPath: "Sprint 1",
			rawFields: workItem.fields,
			state: "Active",
			tags: ["foo", "bar"],
			title: "Fix bug",
			type: "Bug",
			url: "https://example/99",
		});
	});

	it("falls back gracefully when fields are missing", () => {
		expect(normalizeWorkItem({ id: 1 })).toEqual({
			areaPath: null,
			assignedTo: null,
			description: null,
			id: 1,
			iterationPath: null,
			rawFields: {},
			state: "Unknown",
			tags: [],
			title: "Untitled",
			type: "Unknown",
			url: null,
		});
	});
});

describe("renderers", () => {
	const result = {
		exportedAt: "2026-04-06T22:00:00.000Z",
		itemCount: 1,
		items: [
			{
				areaPath: "Area",
				assignedTo: "Taylor",
				description: "<p>Hello</p>",
				id: 15,
				iterationPath: "Sprint 2",
				rawFields: { "System.Title": "One" },
				state: "Closed",
				tags: ["alpha", "beta"],
				title: "Hello | there",
				type: "Task",
				url: "https://example/15",
			},
		],
		queryId: "query-1",
	} as const;

	it("renders pretty JSON", () => {
		expect(renderJson(result)).toContain('"queryId": "query-1"');
		expect(renderJson(result)).toContain('"itemCount": 1');
	});

	it("renders markdown table output", () => {
		const markdown = renderMarkdown(result);
		expect(markdown).toContain("# Azure DevOps Work Items Export");
		expect(markdown).toContain(
			"| ID | Title | Type | State | Assigned To | Area | Iteration | Tags |",
		);
		expect(markdown).toContain("Hello \\| there");
		expect(markdown).not.toContain("<p>Hello</p>");
	});
});

describe("normalizeFileName", () => {
	it("appends the expected extension when omitted", () => {
		expect(normalizeFileName("report", "json")).toBe("report.json");
	});

	it("rejects mismatched extensions", () => {
		expect(() => normalizeFileName("report.md", "json")).toThrow(CliError);
	});

	it("rejects path separators", () => {
		expect(() => normalizeFileName("nested/report", "md")).toThrow(CliError);
	});
});

describe("runExportWorkflow", () => {
	const access = vi.fn();
	const queryWorkItems = vi.fn();
	const getWorkItemDetails = vi.fn();
	const ensureAzureCliAvailable = vi.fn();
	const promptForExportOptions = vi.fn();
	const confirmOverwrite = vi.fn();
	const writeFile = vi.fn();
	const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

	const deps = {
		access,
		azure: {
			ensureAzureCliAvailable,
			getWorkItemDetails,
			queryWorkItems,
		},
		confirmOverwrite,
		cwd: () => "C:/workspace",
		now: () => new Date("2026-04-06T22:15:00.000Z"),
		promptForExportOptions,
		writeFile,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		access.mockRejectedValue(
			Object.assign(new Error("missing"), { code: "ENOENT" }),
		);
	});

	it("writes a JSON export after fetching all work items", async () => {
		queryWorkItems.mockResolvedValue([{ id: 1 }, { id: 2 }]);
		getWorkItemDetails
			.mockResolvedValueOnce({
				fields: {
					"System.State": "Active",
					"System.Title": "One",
					"System.WorkItemType": "Bug",
				},
				id: 1,
			})
			.mockResolvedValueOnce({
				fields: {
					"System.State": "Closed",
					"System.Title": "Two",
					"System.WorkItemType": "Task",
				},
				id: 2,
			});
		promptForExportOptions.mockResolvedValue({
			fileName: "out.json",
			format: "json",
		});

		await runExportWorkflow("abc", deps);

		expect(ensureAzureCliAvailable).toHaveBeenCalledOnce();
		expect(queryWorkItems).toHaveBeenCalledWith("abc");
		expect(getWorkItemDetails).toHaveBeenNthCalledWith(1, 1);
		expect(getWorkItemDetails).toHaveBeenNthCalledWith(2, 2);
		expect(writeFile).toHaveBeenCalledOnce();
		expect(writeFile.mock.calls[0]?.[0]).toBe("C:\\workspace\\out.json");
		expect(writeFile.mock.calls[0]?.[2]).toBe("utf8");
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("Exported 2 work items"),
		);
	});

	it("returns early when the query has no work items", async () => {
		queryWorkItems.mockResolvedValue([]);

		await runExportWorkflow("empty-query", deps);

		expect(promptForExportOptions).not.toHaveBeenCalled();
		expect(writeFile).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("No work items were found"),
		);
	});

	it("fails the whole export when a work item fetch fails", async () => {
		queryWorkItems.mockResolvedValue([{ id: 1 }, { id: 2 }]);
		getWorkItemDetails
			.mockResolvedValueOnce({ id: 1 })
			.mockRejectedValueOnce(new CliError("boom"));

		await expect(runExportWorkflow("abc", deps)).rejects.toThrow("boom");
		expect(promptForExportOptions).not.toHaveBeenCalled();
	});

	it("rejects overwrite refusal", async () => {
		queryWorkItems.mockResolvedValue([{ id: 1 }]);
		getWorkItemDetails.mockResolvedValue({ id: 1 });
		promptForExportOptions.mockResolvedValue({
			fileName: "out.json",
			format: "json",
		});
		access.mockResolvedValue(undefined);
		confirmOverwrite.mockResolvedValue(false);

		await expect(runExportWorkflow("abc", deps)).rejects.toThrow(
			"Export cancelled",
		);
		expect(writeFile).not.toHaveBeenCalled();
	});
});

describe("createProgram", () => {
	it("parses the positional query id and runs the workflow action", async () => {
		const ensureAzureCliAvailable = vi.fn().mockResolvedValue(undefined);
		const queryWorkItems = vi.fn().mockResolvedValue([]);
		const program = createProgram({
			access: vi
				.fn()
				.mockRejectedValue(
					Object.assign(new Error("missing"), { code: "ENOENT" }),
				),
			azure: {
				ensureAzureCliAvailable,
				getWorkItemDetails: vi.fn(),
				queryWorkItems,
			},
			confirmOverwrite: vi.fn(),
			cwd: () => process.cwd(),
			now: () => new Date(),
			promptForExportOptions: vi.fn(),
			writeFile: vi.fn(),
		});

		await program.parseAsync(["node", "azdo-work-items", "query-123"], {
			from: "node",
		});

		expect(ensureAzureCliAvailable).toHaveBeenCalledOnce();
		expect(queryWorkItems).toHaveBeenCalledWith("query-123");
	});
});
