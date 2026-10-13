import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { discoverRepositories, enrichGitInfo, Repository, runGit } from './repositoryManager';
import { normalizeRoot } from './pathUtils';
import { FileItem, FilesProvider, RepoItem, RepositoriesProvider } from './views';

const STATE_SELECTIONS = 'selectedRepositoryPaths';
const STATE_INITIALIZED = 'defaultsInitialized';
const STATE_ROOT_PROMPTED = 'repositoryRootPrompted';
let repositories: Repository[] = [];
let selected = new Set<string>();
type GitApi = { repositories: Array<{ rootUri: vscode.Uri }>; openRepository(uri: vscode.Uri): unknown; close(repository: unknown): unknown };

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  selected = vscode.workspace.getConfiguration('universalGitManager').get<boolean>('restoreSelections', true) ? new Set(context.globalState.get<string[]>(STATE_SELECTIONS, [])) : new Set<string>();
  const repoProvider = new RepositoriesProvider(() => repositories, () => selected);
  const fileProvider = new FilesProvider(() => repositories, () => selected);
  context.subscriptions.push(vscode.window.registerTreeDataProvider('universalGitManager.repositories', repoProvider), vscode.window.registerTreeDataProvider('universalGitManager.files', fileProvider));
  const refreshViews = () => { repoProvider.refresh(); fileProvider.refresh(); };
  const gitApi = (): GitApi | undefined => {
    const extension = vscode.extensions.getExtension('vscode.git');
    try { return extension?.exports?.getAPI?.(1) as GitApi | undefined; } catch { return undefined; }
  };
  const enableSourceControl = async (items: Repository[]) => {
    const api = gitApi();
    if (!api) { vscode.window.showWarningMessage('VS Code built-in Git extension is unavailable in this window.'); return; }
    for (const repo of items) {
      if (!api.repositories.some(existing => existing.rootUri.fsPath === repo.path)) api.openRepository(vscode.Uri.file(repo.path));
    }
    vscode.window.showInformationMessage(`Enabled ${items.length} selected repositor${items.length === 1 ? 'y' : 'ies'} in Source Control.`);
  };
  const disableSourceControl = async (items: Repository[]) => {
    const api = gitApi(); if (!api) return;
    for (const repo of items) { const match = api.repositories.find(existing => existing.rootUri.fsPath === repo.path); if (match) api.close(match); }
  };
  const save = async () => context.globalState.update(STATE_SELECTIONS, [...selected]);
  const getRoot = () => { const c = vscode.workspace.getConfiguration('universalGitManager'); return normalizeRoot(c.get<string>('rootPath', ''), c.get<string>('wslRootPath', ''), vscode.env.remoteName === 'wsl'); };
  const ensureRoot = async (): Promise<string | undefined> => {
    let root = getRoot();
    if (!root) { await configureRoot(); root = getRoot(); }
    if (!root) return undefined;
    try { if (!(await fs.stat(root)).isDirectory()) throw new Error('Not a directory'); } catch { vscode.window.showErrorMessage(`Universal Git Manager: repository root is unavailable: ${root}`); return undefined; }
    return root;
  };
  const configureRoot = async (): Promise<boolean> => {
    const config = vscode.workspace.getConfiguration('universalGitManager');
    const input = await vscode.window.showInputBox({ title: 'Universal Git Manager: Repository Root', prompt: 'Enter the folder that contains your Git repositories', placeHolder: 'For example: C:\\Repositories or /home/you/projects', value: config.get<string>('rootPath', ''), ignoreFocusOut: true });
    if (input === undefined) return false;
    await config.update('rootPath', input.trim(), vscode.ConfigurationTarget.Global);
    if (vscode.env.remoteName === 'wsl' && /^[a-z]:[\\/]/i.test(input.trim())) vscode.window.showInformationMessage('Windows root will be mapped to /mnt/<drive>/ automatically. Set universalGitManager.wslRootPath if your mount differs.');
    return true;
  };
  const fetchRepositories = async () => {
    const root = await ensureRoot(); if (!root) return;
    const config = vscode.workspace.getConfiguration('universalGitManager');
    const discovered = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Discovering Git repositories…' }, async () => Promise.all((await discoverRepositories(root, config.get<number>('scanDepth', 1))).map(enrichGitInfo)));
    repositories = discovered;
    if (!context.globalState.get<boolean>(STATE_INITIALIZED, false)) {
      const defaults = new Set(config.get<string[]>('defaultRepositories', [])); const matched = discovered.filter(r => defaults.has(r.name)); matched.forEach(r => selected.add(r.path));
      const missing = [...defaults].filter(name => !discovered.some(r => r.name === name)); if (missing.length) vscode.window.showWarningMessage(`Default repositories not found: ${missing.join(', ')}`);
      await context.globalState.update(STATE_INITIALIZED, true); await save();
    }
    await enableSourceControl(discovered.filter(r => selected.has(r.path)));
    refreshViews(); vscode.window.showInformationMessage(`Universal Git Manager: found ${discovered.length} repository${discovered.length === 1 ? '' : 'ies'}. No Git network commands were run.`);
  };
  const configureRootAndFetch = async () => { if (await configureRoot()) await fetchRepositories(); };
  const repoFrom = (value: RepoItem | FileItem | Repository): Repository | undefined => value instanceof RepoItem ? value.repository : value instanceof FileItem ? value.repository : value;
  const selection = async (value: RepoItem | Repository, add: boolean) => { const repo = repoFrom(value); if (!repo) return; add ? selected.add(repo.path) : selected.delete(repo.path); await save(); refreshViews(); };
  const confirmGit = async (repo: Repository, args: string[], label: string) => { if (await vscode.window.showWarningMessage(`${label} in ${repo.name}? This explicitly contacts/remotely changes Git state as Git permits.`, { modal: true }, label) !== label) return; try { vscode.window.showInformationMessage(await runGit(repo, args)); await fetchRepositories(); } catch (e) { vscode.window.showErrorMessage(`${label} failed: ${e instanceof Error ? e.message : String(e)}`); } };
  const register = (command: string, fn: (...args: any[]) => any) => context.subscriptions.push(vscode.commands.registerCommand(command, fn));
  register('universalGitManager.setup', configureRootAndFetch); register('universalGitManager.configureRoot', configureRootAndFetch); register('universalGitManager.fetch', fetchRepositories); register('universalGitManager.refresh', fetchRepositories);
  register('universalGitManager.enableSourceControl', () => enableSourceControl(repositories.filter(r => selected.has(r.path)))); register('universalGitManager.disableSourceControl', () => disableSourceControl(repositories.filter(r => selected.has(r.path))));
  register('universalGitManager.select', async (item: RepoItem) => { await selection(item, true); await enableSourceControl([item.repository]); }); register('universalGitManager.deselect', async (item: RepoItem) => { await selection(item, false); await disableSourceControl([item.repository]); });
  register('universalGitManager.selectAll', async () => { repositories.forEach(r => selected.add(r.path)); await save(); await enableSourceControl(repositories); refreshViews(); }); register('universalGitManager.deselectAll', async () => { const previous = repositories.filter(r => selected.has(r.path)); selected.clear(); await save(); await disableSourceControl(previous); refreshViews(); });
  register('universalGitManager.restoreDefaults', async () => { const names = new Set(vscode.workspace.getConfiguration('universalGitManager').get<string[]>('defaultRepositories', [])); repositories.filter(r => names.has(r.name)).forEach(r => selected.add(r.path)); await save(); refreshViews(); });
  register('universalGitManager.openRepositoryFiles', async (item: RepoItem) => { await selection(item, true); await vscode.commands.executeCommand('universalGitManager.files.focus'); });
  register('universalGitManager.openFile', async (item: FileItem) => { const doc = await vscode.workspace.openTextDocument(item.uri); await vscode.window.showTextDocument(doc); });
  register('universalGitManager.copyPath', async (item: RepoItem | FileItem) => vscode.env.clipboard.writeText(item instanceof RepoItem ? item.repository.path : item.uri.fsPath));
  register('universalGitManager.copyRelativePath', async (item: FileItem) => { if (item.repository) await vscode.env.clipboard.writeText(path.relative(item.repository.path, item.uri.fsPath)); });
  register('universalGitManager.openContainingFolder', (item: FileItem) => vscode.commands.executeCommand('revealFileInOS', item.uri));
  register('universalGitManager.openTerminal', (item: RepoItem) => vscode.window.createTerminal({ name: item.repository.name, cwd: item.repository.path }).show());
  register('universalGitManager.addWorkspace', async (item: RepoItem) => { const exists = vscode.workspace.workspaceFolders?.some(f => f.uri.fsPath === item.repository.path) ?? false; if (!exists) await vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, 0, { uri: vscode.Uri.file(item.repository.path), name: item.repository.name }); });
  register('universalGitManager.openNewWindow', (item: RepoItem) => vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(item.repository.path), true));
  register('universalGitManager.status', async (item: RepoItem) => { try { const output = await runGit(item.repository, ['status', '--short', '--branch']); const channel = vscode.window.createOutputChannel(`Git Status: ${item.repository.name}`); channel.clear(); channel.appendLine(output || 'Clean working tree.'); channel.show(); } catch (e) { vscode.window.showErrorMessage(String(e)); } });
  register('universalGitManager.gitFetch', (item: RepoItem) => confirmGit(item.repository, ['fetch'], 'Git Fetch')); register('universalGitManager.gitPull', (item: RepoItem) => confirmGit(item.repository, ['pull'], 'Git Pull'));
  // A new installation has no root configured. Prompt when its view first activates so
  // discovery is based on the user's own repository folder rather than a hardcoded path.
  if (!context.globalState.get<boolean>(STATE_ROOT_PROMPTED, false)) {
    const configured = await configureRoot();
    if (configured) await context.globalState.update(STATE_ROOT_PROMPTED, true);
    if (configured && getRoot()) await fetchRepositories(); else refreshViews();
  } else if (!getRoot()) {
    if (await configureRoot()) await fetchRepositories(); else refreshViews();
  } else if (vscode.workspace.getConfiguration('universalGitManager').get<boolean>('autoDiscoverOnStartup', false)) await fetchRepositories(); else refreshViews();
}
export function deactivate(): void {}
