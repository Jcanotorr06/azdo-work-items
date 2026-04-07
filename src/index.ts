import { Command } from "commander";

const program = new Command();

program
  .name("azdo-work-items")
  .description("CLI tool for exporting Azure DevOps work items")
  .version("0.1.0");

program.parse(process.argv);
