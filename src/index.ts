#!/usr/bin/env node

import chalk from "chalk";
import { createProgram } from "./cli.js";
import { CliError, formatCliError } from "./errors.js";

const program = createProgram();

try {
	await program.parseAsync(process.argv);
} catch (error) {
	const { message, hints } = formatCliError(error);

	console.error(chalk.red(message));

	for (const hint of hints) {
		console.error(chalk.dim(hint));
	}

	process.exit(error instanceof CliError ? error.exitCode : 1);
}
