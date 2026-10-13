# Universal Git Repository Manager

Browse and edit selected Git repositories from a dedicated Activity Bar view without changing the current workspace. Selected repositories are also registered with VS Code's built-in Git extension, so they appear in Source Control for normal branch, staging, commit, push, and pull workflows.

## Install locally

From this directory run `pnpm install` and `pnpm package`, then install the generated `.vsix` with **Extensions: Install from VSIX…**. In Remote WSL, install it into the WSL extension host.

## Usage

Open **Git Repositories**. On first use, the extension asks for the folder that contains your Git repositories, then discovers repositories below that folder. If a root is already configured, it is shown as the starting value and can be changed. Use the gear button in the Available Repositories title bar to change the folder later; discovery runs again after you save it. You can also run **Universal Git Manager: Configure Repository Root** from the Command Palette.

Discovery is local-only and never performs Git network operations. `Git Fetch` and `Git Pull` are explicit, confirmed commands. The normal workspace is untouched unless **Add Repository to Workspace** is chosen.

## WSL

When running in Remote WSL, Windows paths such as `C:\Repositories` are converted to `/mnt/c/Repositories/`. Set `universalGitManager.wslRootPath` when your mount differs. Settings and selections are stored globally in the extension host.
