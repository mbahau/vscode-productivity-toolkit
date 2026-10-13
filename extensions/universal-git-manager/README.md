# Universal Git Repository Manager

Browse and edit selected Git repositories from a dedicated Activity Bar view without changing the current workspace. Selected repositories are also registered with VS Code's built-in Git extension, so they appear in Source Control for normal branch, staging, commit, push, and pull workflows.

## Install locally

From this directory run `pnpm install` and `pnpm package`, then install the generated `.vsix` with **Extensions: Install from VSIX…**. In Remote WSL, install it into the WSL extension host.

## Usage

Open **Git Repositories**, click **Fetch Repositories**, and configure `C:\o9Git\`. The default repositories `DemandPlanningPlugins` and `o9ReferencePackage` are selected when found. Selecting or deselecting a repository synchronizes it with the built-in Source Control view.

Discovery is local-only and never performs Git network operations. `Git Fetch` and `Git Pull` are explicit, confirmed commands. The normal workspace is untouched unless **Add Repository to Workspace** is chosen.

## WSL

When running in Remote WSL, `C:\o9Git\` is converted to `/mnt/c/o9Git/`. Set `universalGitManager.wslRootPath` when your mount differs. Settings and selections are stored globally in the extension host.
