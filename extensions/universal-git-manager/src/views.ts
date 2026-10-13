import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Repository } from './repositoryManager';

export class RepoItem extends vscode.TreeItem {
  constructor(public readonly repository: Repository, public selected: boolean) {
    super(repository.name, vscode.TreeItemCollapsibleState.None);
    this.contextValue = selected ? 'ugmRepoSelected' : 'ugmRepoUnselected';
    this.description = `${selected ? 'Selected' : 'Not selected'}${repository.branch ? ` · ${repository.branch}${repository.dirty ? ' •' : ''}` : ''}`;
    this.tooltip = `${selected ? 'Selected' : 'Not selected'}\n${repository.path}`;
    this.iconPath = selected
      ? new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'))
      : new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground'));
  }
}
export class RepositoriesProvider implements vscode.TreeDataProvider<RepoItem> {
  private readonly changed = new vscode.EventEmitter<RepoItem | undefined>(); readonly onDidChangeTreeData = this.changed.event;
  constructor(private readonly getRepos: () => Repository[], private readonly selected: () => Set<string>) {}
  refresh() { this.changed.fire(undefined); }
  getTreeItem(item: RepoItem) { return item; }
  getChildren(): RepoItem[] { const selected = this.selected(); return this.getRepos().map(r => new RepoItem(r, selected.has(r.path))); }
}
export class FileItem extends vscode.TreeItem {
  constructor(public readonly uri: vscode.Uri, public readonly repository?: Repository, directory = false, root = false) { super(path.basename(uri.fsPath), directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None); this.resourceUri = uri; this.contextValue = root ? 'ugmRepoSelected' : directory ? 'ugmDirectory' : 'ugmFile'; if (!directory) this.command = { command: 'universalGitManager.openFile', title: 'Open File', arguments: [this] }; this.tooltip = uri.fsPath; }
}
export class FilesProvider implements vscode.TreeDataProvider<FileItem> {
  private readonly changed = new vscode.EventEmitter<FileItem | undefined>(); readonly onDidChangeTreeData = this.changed.event;
  constructor(private readonly repos: () => Repository[], private readonly selected: () => Set<string>) {}
  refresh() { this.changed.fire(undefined); }
  getTreeItem(item: FileItem) { return item; }
  async getChildren(item?: FileItem): Promise<FileItem[]> {
    if (!item) return this.repos().filter(r => this.selected().has(r.path)).map(r => new FileItem(vscode.Uri.file(r.path), r, true, true));
    if (item.repository) return this.readDirectory(item.uri, item.repository);
    return [];
  }
  private async readDirectory(uri: vscode.Uri, repo: Repository): Promise<FileItem[]> {
    try { const entries = await fs.readdir(uri.fsPath, { withFileTypes: true }); return entries.filter(e => !['.git', 'node_modules', '.venv'].includes(e.name)).sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)).map(e => new FileItem(vscode.Uri.file(path.join(uri.fsPath, e.name)), repo, e.isDirectory())); } catch { return []; }
  }
}
