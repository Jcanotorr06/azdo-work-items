export type OutputFormat = "json" | "md";
export type OutputTarget = "file" | "inline";

export type QueryWorkItemRef = {
	id: number;
	url?: string;
};

export type AzureFields = Record<string, unknown>;

export type AzureWorkItem = {
	fields?: AzureFields;
	id: number;
	relations?: unknown[];
	url?: string;
};

export type ExportWorkItem = {
	areaPath: string | null;
	assignedTo: string | null;
	description: string | null;
	id: number;
	iterationPath: string | null;
	rawFields: AzureFields;
	state: string;
	tags: string[];
	title: string;
	type: string;
	url: string | null;
};

export type ExportResult = {
	exportedAt: string;
	itemCount: number;
	items: ExportWorkItem[];
	queryId: string;
};

export type ExportOptions = {
	format: OutputFormat;
	outputTarget: OutputTarget;
	fileName?: string;
};

export type ExportInputs = {
	fileName?: string;
	format?: OutputFormat;
	inline?: boolean;
	queryId?: string;
};
