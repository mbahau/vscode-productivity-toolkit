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
exports.FilesProvider = exports.FileItem = exports.RepositoriesProvider = exports.RepoItem = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
class RepoItem extends vscode.TreeItem {
    repository;
    selected;
    constructor(repository, selected) {
        super(repository.name, vscode.TreeItemCollapsibleState.None);
        this.repository = repository;
        this.selected = selected;
        this.contextValue = selected ? 'ugmRepoSelected' : 'ugmRepoUnselected';
        this.description = `${selected ? 'Selected' : 'Not selected'}${repository.branch ? ` · ${repository.branch}${repository.dirty ? ' •' : ''}` : ''}`;
        this.tooltip = `${selected ? 'Selected' : 'Not selected'}\n${repository.path}`;
        this.iconPath = selected
            ? new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'))
            : new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground'));
    }
}
exports.RepoItem = RepoItem;
class RepositoriesProvider {
    getRepos;
    selected;
    changed = new vscode.EventEmitter();
    onDidChangeTreeData = this.changed.event;
    constructor(getRepos, selected) {
        this.getRepos = getRepos;
        this.selected = selected;
    }
    refresh() { this.changed.fire(undefined); }
    getTreeItem(item) { return item; }
    getChildren() { const selected = this.selected(); return this.getRepos().map(r => new RepoItem(r, selected.has(r.path))); }
}
exports.RepositoriesProvider = RepositoriesProvider;
class FileItem extends vscode.TreeItem {
    uri;
    repository;
    constructor(uri, repository, directory = false, root = false) {
        super(path.basename(uri.fsPath), directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        this.uri = uri;
        this.repository = repository;
        this.resourceUri = uri;
        this.contextValue = root ? 'ugmRepoSelected' : directory ? 'ugmDirectory' : 'ugmFile';
        if (!directory)
            this.command = { command: 'universalGitManager.openFile', title: 'Open File', arguments: [this] };
        this.tooltip = uri.fsPath;
    }
}
exports.FileItem = FileItem;
class FilesProvider {
    repos;
    selected;
    changed = new vscode.EventEmitter();
    onDidChangeTreeData = this.changed.event;
    constructor(repos, selected) {
        this.repos = repos;
        this.selected = selected;
    }
    refresh() { this.changed.fire(undefined); }
    getTreeItem(item) { return item; }
    async getChildren(item) {
        if (!item)
            return this.repos().filter(r => this.selected().has(r.path)).map(r => new FileItem(vscode.Uri.file(r.path), r, true, true));
        if (item.repository)
            return this.readDirectory(item.uri, item.repository);
        return [];
    }
    async readDirectory(uri, repo) {
        try {
            const entries = await fs.readdir(uri.fsPath, { withFileTypes: true });
            return entries.filter(e => !['.git', 'node_modules', '.venv'].includes(e.name)).sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)).map(e => new FileItem(vscode.Uri.file(path.join(uri.fsPath, e.name)), repo, e.isDirectory()));
        }
        catch {
            return [];
        }
    }
}
exports.FilesProvider = FilesProvider;
//# sourceMappingURL=views.js.map