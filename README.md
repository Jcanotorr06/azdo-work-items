# azdo-work-items

`azdo-work-items` is a TypeScript CLI for exporting Azure DevOps work items from an existing Boards query. It is designed to stay lightweight and reduce security risk by reusing the Azure CLI already installed and configured on the user's machine instead of managing credentials itself.

The CLI can:

- Run an Azure DevOps Boards query by query ID
- Fetch full details for each returned work item
- Export results as `json` or `md`
- Write output to a file in the current directory
- Print output directly in the terminal with `--inline`
- Prompt only for values you did not pass on the command line

## Disclaimer

This is a personal project and is not officially supported by Microsoft or Azure DevOps. This CLI requires the Azure CLI and Azure DevOps extension to be installed and authenticated. It shells out to the Azure CLI on your local machine and does not manage or store Azure DevOps credentials itself. It does not transmit data anywhere other than the Azure CLI commands you explicitly run through your local environment. Use at your own risk.

## Requirements

- Node.js 20 or newer
- Azure CLI installed as `az`
  - https://learn.microsoft.com/cli/azure/install-azure-cli
- Azure DevOps extension installed
  - `az extension add --name azure-devops`
- Authenticated Azure CLI / Azure DevOps session
  - `az login`
  - `az devops login`
- Azure DevOps defaults configured, or equivalent CLI context already available
  - `az devops configure --defaults organization=<org-url> project=<project-name>`

## Installation

Install globally from npm:

```bash
npm install --global azdo-work-items
# OR
yarn global add azdo-work-items
# OR
pnpm add -g azdo-work-items
```

After installation, the command will be available as:

```bash
azdo-work-items
```

You can also run it without installing globally by using `npx`:

```bash
npx azdo-work-items
```

For local development of this repository, install dependencies and build as usual:

```bash
pnpm install
pnpm build
```

## Usage

Basic usage:

```bash
azdo-work-items [queryId]
```

Supported arguments:

- `queryId`
  - Optional positional Azure DevOps query ID
- `--queryId <queryId>`
  - Named query ID option
- `--format <format>`
  - Output format: `json` or `md`
- `--fileName <fileName>`
  - Output file name in the current directory
- `--inline`
  - Print the export in the terminal instead of writing a file

The CLI will prompt only for missing values. For example:

- If you omit `queryId`, it will ask for one
- If you omit `format`, it will ask you to choose `json` or `md`
- If you do not pass `--inline` or `--fileName`, it will ask whether to write to a file or print in the terminal
- If file output is selected, it will ask for a file name only if one was not already provided

Examples:

```bash
azdo-work-items
azdo-work-items 12345678-aaaa-bbbb-cccc-1234567890ab
azdo-work-items --queryId 12345678-aaaa-bbbb-cccc-1234567890ab
azdo-work-items 12345678-aaaa-bbbb-cccc-1234567890ab --format json --fileName work-items.json
azdo-work-items --queryId 12345678-aaaa-bbbb-cccc-1234567890ab --format md --fileName work-items.md
azdo-work-items --queryId 12345678-aaaa-bbbb-cccc-1234567890ab --inline
azdo-work-items 12345678-aaaa-bbbb-cccc-1234567890ab --format md --inline
```

## How It Works

The CLI delegates Azure DevOps access to the Azure CLI.

It performs these steps:

1. Verifies that `az` is available
2. Runs `az boards query --id <queryId> --output json`
3. Extracts the work item IDs from the query results
4. Fetches each item with `az boards work-item show --id <id> --expand all --output json`
5. Normalizes a curated set of useful fields
6. Renders the export as JSON or Markdown
7. Either writes the result to the current directory or prints it inline

## Output

### JSON

JSON output is the more detailed export format. It includes:

- Query ID
- Export timestamp
- Total item count
- One normalized entry per work item
- The raw Azure DevOps `fields` payload for each item

Each normalized work item includes:

- `id`
- `title`
- `type`
- `state`
- `assignedTo`
- `areaPath`
- `iterationPath`
- `tags`
- `description`
- `url`
- `rawFields`

### Markdown

Markdown output is intended as a readable summary. It includes:

- A heading
- Query ID
- Export timestamp
- Item count
- A single table with these columns:
  - `ID`
  - `Title`
  - `Type`
  - `State`
  - `Assigned To`
  - `Area`
  - `Iteration`
  - `Tags`

Long fields such as `description` are intentionally omitted from Markdown to keep the output scan-friendly.

### Inline Output

When `--inline` is used, the rendered export is printed to stdout and no file is created. In this mode:

- `--fileName` is not needed
- The CLI will not prompt for a file name
- No overwrite confirmation is required

## Notes

- File output is restricted to the current directory
- If you omit a file extension, the CLI appends `.json` or `.md` automatically
- If you provide a mismatched extension, the CLI rejects it
- Existing files require overwrite confirmation
- If a query returns zero work items, the CLI exits with a friendly message and does not prompt for output
- If any individual work item fetch fails, the export fails rather than generating a partial result

## Troubleshooting

### `az` is not recognized

The Azure CLI is either not installed or not available on your `PATH`.

Install it from:

- https://learn.microsoft.com/cli/azure/install-azure-cli

### Azure DevOps extension is missing

Install the extension:

```bash
az extension add --name azure-devops
```

### Not authenticated

Sign in again:

```bash
az login
az devops login
```

### Organization or project context is missing

Configure Azure DevOps defaults:

```bash
az devops configure --defaults organization=<org-url> project=<project-name>
```

The CLI does not set these values for you.

### Query not found or query fails

Verify that:

- The query ID is correct
- The query exists in the target Azure DevOps project
- Your current Azure CLI identity has access to it

### File name is rejected

The CLI only allows file names in the current directory. Do not pass nested paths such as:

```bash
reports/work-items.json
```

Use a plain file name instead:

```bash
work-items.json
```
