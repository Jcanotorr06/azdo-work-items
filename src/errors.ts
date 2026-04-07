export class CliError extends Error {
	readonly exitCode: number;
	readonly hints: string[];

	constructor(message: string, hints: string[] = [], exitCode = 1) {
		super(message);
		this.name = "CliError";
		this.exitCode = exitCode;
		this.hints = hints;
	}
}

export function formatCliError(error: unknown): {
	message: string;
	hints: string[];
} {
	if (error instanceof CliError) {
		return { message: error.message, hints: error.hints };
	}

	if (error instanceof Error) {
		return { message: error.message, hints: [] };
	}

	return {
		message: "An unexpected error occurred.",
		hints: ["Run the command again with a valid Azure DevOps query ID."],
	};
}
