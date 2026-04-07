# azdo-work-items

Interactive CLI that extracts work items from Azure Devops and exports them to `./work-items.json` or `./work-items.md`

## Disclaimer

This is a personal project and is not officially supported by Microsoft or Azure DevOps. This CLI requires the Azure CLI and Azure DevOps extension to be installed and authenticated. It reads the release definition and environment variables via the Azure DevOps REST API. It does not store or transmit any data outside of your local machine. Use at your own risk.

## Requirements

- Node.js
- Azure CLI installed (`az`)
  - https://learn.microsoft.com/cli/azure/install-azure-cli
- Azure DevOps extension installed
  - `az extension add --name azure-devops`
- Authenticated to Azure DevOps
  - `az devops login`
- Azure DevOps defaults (`organization` and `project`)
  - If missing, the CLI will prompt and set them via `az devops configure -d ...`.
