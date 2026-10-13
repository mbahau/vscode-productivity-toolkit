import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { canonicalPath } from './pathUtils';
const run = promisify(execFile);
export interface Repository { path: string; name: string; branch?: string; dirty?: boolean; }
export async function isGitRepository(folder: string): Promise<boolean> {
  try { const entry = await fs.lstat(path.join(folder, '.git')); return entry.isDirectory() || entry.isFile(); } catch { return false; }
}
export async function discoverRepositories(root: string, depth = 1): Promise<Repository[]> {
  const found: Repository[] = []; const seen = new Set<string>();
  async function visit(folder: string, current: number): Promise<void> {
    let entries: import('node:fs').Dirent[]; try { entries = await fs.readdir(folder, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || ['.git', 'node_modules', '.venv', '.venv', 'dist', 'build'].includes(entry.name)) continue;
      const child = path.join(folder, entry.name);
      if (await isGitRepository(child)) { const absolute = canonicalPath(child); if (!seen.has(absolute)) { seen.add(absolute); found.push({ path: absolute, name: entry.name }); } }
      else if (current < depth) await visit(child, current + 1);
    }
  }
  await visit(root, 1); return found.sort((a, b) => a.name.localeCompare(b.name));
}
export async function enrichGitInfo(repository: Repository): Promise<Repository> {
  try { const { stdout } = await run('git', ['-C', repository.path, 'status', '--porcelain=v1', '-b'], { windowsHide: true, timeout: 5000 }); const [header, ...rows] = stdout.split(/\r?\n/); const branch = header?.replace(/^##\s*/, '').split('...')[0] || undefined; return { ...repository, branch, dirty: rows.some(Boolean) }; } catch { return repository; }
}
export async function runGit(repository: Repository, args: string[]): Promise<string> { const { stdout, stderr } = await run('git', ['-C', repository.path, ...args], { windowsHide: true, timeout: 120000 }); return stdout || stderr || 'Completed.'; }
