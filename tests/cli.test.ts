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
import {
	normalizeFileName,
	normalizeOutputFormat,
	normalizeQueryId,
} from "../src/prompts.js";
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

describe("normalizeQueryId", () => {
	it("trims the query id", () => {
		expect(normalizeQueryId("  abc-123  ")).toBe("abc-123");
	});

	it("rejects an empty query id", () => {
		expect(() => normalizeQueryId("   ")).toThrow(CliError);
	});
});

describe("normalizeOutputFormat", () => {
	it("accepts json and md", () => {
		expect(normalizeOutputFormat("json")).toBe("json");
		expect(normalizeOutputFormat("MD")).toBe("md");
	});

	it("rejects unsupported output formats", () => {
		expect(() => normalizeOutputFormat("csv")).toThrow(CliError);
	});
});

describe("runExportWorkflow", () => {
	const access = vi.fn();
	const queryWorkItems = vi.fn();
	const getWorkItemDetails = vi.fn();
	const ensureAzureCliAvailable = vi.fn();
	const promptForMissingInputs = vi.fn();
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
		promptForMissingInputs,
		writeFile,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		access.mockRejectedValue(
			Object.assign(new Error("missing"), { code: "ENOENT" }),
		);
	});

	it("writes a JSON export after fetching all work items", async () => {
		promptForMissingInputs.mockResolvedValue({
			fileName: "out.json",
			format: "json",
			outputTarget: "file",
			queryId: "abc",
		});
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
		await runExportWorkflow({ queryId: "abc" }, deps);

		expect(promptForMissingInputs).toHaveBeenCalledWith({ queryId: "abc" });
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
		promptForMissingInputs.mockResolvedValue({
			fileName: "out.json",
			format: "json",
			outputTarget: "file",
			queryId: "empty-query",
		});
		queryWorkItems.mockResolvedValue([]);

		await runExportWorkflow({ queryId: "empty-query" }, deps);

		expect(promptForMissingInputs).toHaveBeenCalledOnce();
		expect(writeFile).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining("No work items were found"),
		);
	});

	it("fails the whole export when a work item fetch fails", async () => {
		promptForMissingInputs.mockResolvedValue({
			fileName: "out.json",
			format: "json",
			outputTarget: "file",
			queryId: "abc",
		});
		queryWorkItems.mockResolvedValue([{ id: 1 }, { id: 2 }]);
		getWorkItemDetails
			.mockResolvedValueOnce({ id: 1 })
			.mockRejectedValueOnce(new CliError("boom"));

		await expect(runExportWorkflow({ queryId: "abc" }, deps)).rejects.toThrow(
			"boom",
		);
	});

	it("rejects overwrite refusal", async () => {
		promptForMissingInputs.mockResolvedValue({
			fileName: "out.json",
			format: "json",
			outputTarget: "file",
			queryId: "abc",
		});
		queryWorkItems.mockResolvedValue([{ id: 1 }]);
		getWorkItemDetails.mockResolvedValue({ id: 1 });
		access.mockResolvedValue(undefined);
		confirmOverwrite.mockResolvedValue(false);

		await expect(runExportWorkflow({ queryId: "abc" }, deps)).rejects.toThrow(
			"Export cancelled",
		);
		expect(writeFile).not.toHaveBeenCalled();
	});

	it("prints inline output without writing a file", async () => {
		promptForMissingInputs.mockResolvedValue({
			format: "json",
			outputTarget: "inline",
			queryId: "abc",
		});
		queryWorkItems.mockResolvedValue([{ id: 1 }]);
		getWorkItemDetails.mockResolvedValue({
			fields: {
				"System.State": "Active",
				"System.Title": "One",
				"System.WorkItemType": "Bug",
			},
			id: 1,
		});

		await runExportWorkflow({ queryId: "abc", inline: true }, deps);

		expect(access).not.toHaveBeenCalled();
		expect(confirmOverwrite).not.toHaveBeenCalled();
		expect(writeFile).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith(
			expect.stringContaining('"queryId": "abc"'),
		);
	});
});

describe("createProgram", () => {
	it("parses the positional query id and runs the workflow action", async () => {
		const ensureAzureCliAvailable = vi.fn().mockResolvedValue(undefined);
		const queryWorkItems = vi.fn().mockResolvedValue([]);
		const promptForMissingInputs = vi.fn().mockResolvedValue({
			fileName: "work-items.json",
			format: "json",
			outputTarget: "file",
			queryId: "query-123",
		});
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
			promptForMissingInputs,
			writeFile: vi.fn(),
		});

		await program.parseAsync(["node", "azdo-work-items", "query-123"], {
			from: "node",
		});

		expect(ensureAzureCliAvailable).toHaveBeenCalledOnce();
		expect(queryWorkItems).toHaveBeenCalledWith("query-123");
		expect(promptForMissingInputs).toHaveBeenCalledWith({
			fileName: undefined,
			format: undefined,
			inline: undefined,
			queryId: "query-123",
		});
	});

	it("prefers flags and allows omitting the positional query id", async () => {
		const ensureAzureCliAvailable = vi.fn().mockResolvedValue(undefined);
		const queryWorkItems = vi.fn().mockResolvedValue([]);
		const promptForMissingInputs = vi.fn().mockResolvedValue({
			fileName: "export.md",
			format: "md",
			outputTarget: "file",
			queryId: "flag-query",
		});
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
			promptForMissingInputs,
			writeFile: vi.fn(),
		});

		await program.parseAsync(
			[
				"node",
				"azdo-work-items",
				"--queryId",
				"flag-query",
				"--format",
				"md",
				"--fileName",
				"export.md",
			],
			{
				from: "node",
			},
		);

		expect(promptForMissingInputs).toHaveBeenCalledWith({
			fileName: "export.md",
			format: "md",
			inline: undefined,
			queryId: "flag-query",
		});
		expect(queryWorkItems).toHaveBeenCalledWith("flag-query");
	});

	it("supports inline output from flags", async () => {
		const ensureAzureCliAvailable = vi.fn().mockResolvedValue(undefined);
		const queryWorkItems = vi.fn().mockResolvedValue([]);
		const promptForMissingInputs = vi.fn().mockResolvedValue({
			format: "json",
			outputTarget: "inline",
			queryId: "flag-query",
		});
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
			promptForMissingInputs,
			writeFile: vi.fn(),
		});

		await program.parseAsync(
			["node", "azdo-work-items", "--queryId", "flag-query", "--inline"],
			{
				from: "node",
			},
		);

		expect(promptForMissingInputs).toHaveBeenCalledWith({
			fileName: undefined,
			format: undefined,
			inline: true,
			queryId: "flag-query",
		});
	});
});
