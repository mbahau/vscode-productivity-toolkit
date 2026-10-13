# AGENTS.md

## Repository purpose

This repository contains multiple Visual Studio Code extensions focused on debugging, data analysis, and developer productivity.

## General rules

- Keep each extension self-contained inside `extensions/<extension-name>/`.
- Do not modify another extension unless the task requires it.
- Keep README and CHANGELOG files updated for user-facing changes.
- Use clear command names and descriptive menu labels.
- Support VS Code Remote WSL where practical.
- Avoid storing user data, credentials, or debug values permanently.

## Extension development

- Each extension must have its own `package.json`.
- Use a unique extension command prefix.
- Run syntax checks before packaging.
- Package extensions as `.vsix` files for manual testing.
- Test commands in a real VS Code Extension Development Host.

## Testing checklist

Before completing a change:

- Verify the extension activates.
- Verify contributed commands appear in the correct context menu.
- Test with a normal local workspace.
- Test with VS Code WSL when applicable.
- Test failure cases and user-facing error messages.
- Confirm older extension versions are not accidentally included.

## Documentation

Every extension should contain:

- `README.md`
- `CHANGELOG.md`
- Installation instructions
- Usage examples
- Known limitations
