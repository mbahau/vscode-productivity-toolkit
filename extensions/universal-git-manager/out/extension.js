"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const repositoryManager_1 = require("./repositoryManager");
const pathUtils_1 = require("./pathUtils");
const views_1 = require("./views");
const STATE_SELECTIONS = 'selectedRepositoryPaths';
const STATE_INITIALIZED = 'defaultsInitialized';
let repositories = [];
let selected = new Set();
async function activate(context) {
    selected = vscode.workspace.getConfiguration('universalGitManager').get('restoreSelections', true) ? new Set(context.globalState.get(STATE_SELECTIONS, [])) : new Set();
    const repoProvider = new views_1.RepositoriesProvider(() => repositories, () => selected);
    const fileProvider = new views_1.FilesProvider(() => repositories, () => selected);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('universalGitManager.repositories', repoProvider), vscode.window.registerTreeDataProvider('universalGitManager.files', fileProvider));
    const refreshViews = () => { repoProvider.refresh(); fileProvider.refresh(); };
    const gitApi = () => {
        const extension = vscode.extensions.getExtension('vscode.git');
        try {
            return extension?.exports?.getAPI?.(1);
        }
        catch {
            return undefined;
        }
    };
    const enableSourceControl = async (items) => {
        const api = gitApi();
        if (!api) {
            vscode.window.showWarningMessage('VS Code built-in Git extension is unavailable in this window.');
            return;
        }
        for (const repo of items) {
            if (!api.repositories.some(existing => existing.rootUri.fsPath === repo.path))
                api.openRepository(vscode.Uri.file(repo.path));
        }
        vscode.window.showInformationMessage(`Enabled ${items.length} selected repositor${items.length === 1 ? 'y' : 'ies'} in Source Control.`);
    };
    const disableSourceControl = async (items) => {
        const api = gitApi();
        if (!api)
            return;
        for (const repo of items) {
            const match = api.repositories.find(existing => existing.rootUri.fsPath === repo.path);
            if (match)
                api.close(match);
        }
    };
    const save = async () => context.globalState.update(STATE_SELECTIONS, [...selected]);
    const getRoot = () => { const c = vscode.workspace.getConfiguration('universalGitManager'); return (0, pathUtils_1.normalizeRoot)(c.get('rootPath', ''), c.get('wslRootPath', ''), vscode.env.remoteName === 'wsl'); };
    const ensureRoot = async () => {
        let root = getRoot();
        if (!root) {
            await configureRoot();
            root = getRoot();
        }
        if (!root)
            return undefined;
        try {
            if (!(await fs.stat(root)).isDirectory())
                throw new Error('Not a directory');
        }
        catch {
            vscode.window.showErrorMessage(`Universal Git Manager: repository root is unavailable: ${root}`);
            return undefined;
        }
        return root;
    };
    const configureRoot = async () => {
        const config = vscode.workspace.getConfiguration('universalGitManager');
        const input = await vscode.window.showInputBox({ title: 'Universal Git Manager: Repository Root', prompt: 'Enter a Git repository root (for example C:\\o9Git or /mnt/c/o9Git)', value: config.get('rootPath', '') || 'C:\\o9Git', ignoreFocusOut: true });
        if (input === undefined)
            return;
        await config.update('rootPath', input.trim(), vscode.ConfigurationTarget.Global);
        if (vscode.env.remoteName === 'wsl' && /^[a-z]:[\\/]/i.test(input.trim()))
            vscode.window.showInformationMessage('Windows root will be mapped to /mnt/<drive>/ automatically. Set universalGitManager.wslRootPath if your mount differs.');
    };
    const fetchRepositories = async () => {
        const root = await ensureRoot();
        if (!root)
            return;
        const config = vscode.workspace.getConfiguration('universalGitManager');
        const discovered = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Discovering Git repositories…' }, async () => Promise.all((await (0, repositoryManager_1.discoverRepositories)(root, config.get('scanDepth', 1))).map(repositoryManager_1.enrichGitInfo)));
        repositories = discovered;
        if (!context.globalState.get(STATE_INITIALIZED, false)) {
            const defaults = new Set(config.get('defaultRepositories', []));
            const matched = discovered.filter(r => defaults.has(r.name));
            matched.forEach(r => selected.add(r.path));
            const missing = [...defaults].filter(name => !discovered.some(r => r.name === name));
            if (missing.length)
                vscode.window.showWarningMessage(`Default repositories not found: ${missing.join(', ')}`);
            await context.globalState.update(STATE_INITIALIZED, true);
            await save();
        }
        await enableSourceControl(discovered.filter(r => selected.has(r.path)));
        refreshViews();
        vscode.window.showInformationMessage(`Universal Git Manager: found ${discovered.length} repository${discovered.length === 1 ? '' : 'ies'}. No Git network commands were run.`);
    };
    const repoFrom = (value) => value instanceof views_1.RepoItem ? value.repository : value instanceof views_1.FileItem ? value.repository : value;
    const selection = async (value, add) => { const repo = repoFrom(value); if (!repo)
        return; add ? selected.add(repo.path) : selected.delete(repo.path); await save(); refreshViews(); };
    const confirmGit = async (repo, args, label) => { if (await vscode.window.showWarningMessage(`${label} in ${repo.name}? This explicitly contacts/remotely changes Git state as Git permits.`, { modal: true }, label) !== label)
        return; try {
        vscode.window.showInformationMessage(await (0, repositoryManager_1.runGit)(repo, args));
        await fetchRepositories();
    }
    catch (e) {
        vscode.window.showErrorMessage(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } };
    const register = (command, fn) => context.subscriptions.push(vscode.commands.registerCommand(command, fn));
    register('universalGitManager.setup', configureRoot);
    register('universalGitManager.configureRoot', configureRoot);
    register('universalGitManager.fetch', fetchRepositories);
    register('universalGitManager.refresh', fetchRepositories);
    register('universalGitManager.enableSourceControl', () => enableSourceControl(repositories.filter(r => selected.has(r.path))));
    register('universalGitManager.disableSourceControl', () => disableSourceControl(repositories.filter(r => selected.has(r.path))));
    register('universalGitManager.select', async (item) => { await selection(item, true); await enableSourceControl([item.repository]); });
    register('universalGitManager.deselect', async (item) => { await selection(item, false); await disableSourceControl([item.repository]); });
    register('universalGitManager.selectAll', async () => { repositories.forEach(r => selected.add(r.path)); await save(); await enableSourceControl(repositories); refreshViews(); });
    register('universalGitManager.deselectAll', async () => { const previous = repositories.filter(r => selected.has(r.path)); selected.clear(); await save(); await disableSourceControl(previous); refreshViews(); });
    register('universalGitManager.restoreDefaults', async () => { const names = new Set(vscode.workspace.getConfiguration('universalGitManager').get('defaultRepositories', [])); repositories.filter(r => names.has(r.name)).forEach(r => selected.add(r.path)); await save(); refreshViews(); });
    register('universalGitManager.openRepositoryFiles', async (item) => { await selection(item, true); await vscode.commands.executeCommand('universalGitManager.files.focus'); });
    register('universalGitManager.openFile', async (item) => { const doc = await vscode.workspace.openTextDocument(item.uri); await vscode.window.showTextDocument(doc); });
    register('universalGitManager.copyPath', async (item) => vscode.env.clipboard.writeText(item instanceof views_1.RepoItem ? item.repository.path : item.uri.fsPath));
    register('universalGitManager.copyRelativePath', async (item) => { if (item.repository)
        await vscode.env.clipboard.writeText(path.relative(item.repository.path, item.uri.fsPath)); });
    register('universalGitManager.openContainingFolder', (item) => vscode.commands.executeCommand('revealFileInOS', item.uri));
    register('universalGitManager.openTerminal', (item) => vscode.window.createTerminal({ name: item.repository.name, cwd: item.repository.path }).show());
    register('universalGitManager.addWorkspace', async (item) => { const exists = vscode.workspace.workspaceFolders?.some(f => f.uri.fsPath === item.repository.path) ?? false; if (!exists)
        await vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, 0, { uri: vscode.Uri.file(item.repository.path), name: item.repository.name }); });
    register('universalGitManager.openNewWindow', (item) => vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(item.repository.path), true));
    register('universalGitManager.status', async (item) => { try {
        const output = await (0, repositoryManager_1.runGit)(item.repository, ['status', '--short', '--branch']);
        const channel = vscode.window.createOutputChannel(`Git Status: ${item.repository.name}`);
        channel.clear();
        channel.appendLine(output || 'Clean working tree.');
        channel.show();
    }
    catch (e) {
        vscode.window.showErrorMessage(String(e));
    } });
    register('universalGitManager.gitFetch', (item) => confirmGit(item.repository, ['fetch'], 'Git Fetch'));
    register('universalGitManager.gitPull', (item) => confirmGit(item.repository, ['pull'], 'Git Pull'));
    if (vscode.workspace.getConfiguration('universalGitManager').get('autoDiscoverOnStartup', false))
        await fetchRepositories();
    else
        refreshViews();
}
function deactivate() { }
//# sourceMappingURL=extension.js.map