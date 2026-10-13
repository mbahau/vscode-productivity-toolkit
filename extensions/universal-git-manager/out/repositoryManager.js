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
exports.isGitRepository = isGitRepository;
exports.discoverRepositories = discoverRepositories;
exports.enrichGitInfo = enrichGitInfo;
exports.runGit = runGit;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const pathUtils_1 = require("./pathUtils");
const run = (0, node_util_1.promisify)(node_child_process_1.execFile);
async function isGitRepository(folder) {
    try {
        const entry = await fs.lstat(path.join(folder, '.git'));
        return entry.isDirectory() || entry.isFile();
    }
    catch {
        return false;
    }
}
async function discoverRepositories(root, depth = 1) {
    const found = [];
    const seen = new Set();
    async function visit(folder, current) {
        let entries;
        try {
            entries = await fs.readdir(folder, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.isSymbolicLink() || ['.git', 'node_modules', '.venv', '.venv', 'dist', 'build'].includes(entry.name))
                continue;
            const child = path.join(folder, entry.name);
            if (await isGitRepository(child)) {
                const absolute = (0, pathUtils_1.canonicalPath)(child);
                if (!seen.has(absolute)) {
                    seen.add(absolute);
                    found.push({ path: absolute, name: entry.name });
                }
            }
            else if (current < depth)
                await visit(child, current + 1);
        }
    }
    await visit(root, 1);
    return found.sort((a, b) => a.name.localeCompare(b.name));
}
async function enrichGitInfo(repository) {
    try {
        const { stdout } = await run('git', ['-C', repository.path, 'status', '--porcelain=v1', '-b'], { windowsHide: true, timeout: 5000 });
        const [header, ...rows] = stdout.split(/\r?\n/);
        const branch = header?.replace(/^##\s*/, '').split('...')[0] || undefined;
        return { ...repository, branch, dirty: rows.some(Boolean) };
    }
    catch {
        return repository;
    }
}
async function runGit(repository, args) { const { stdout, stderr } = await run('git', ['-C', repository.path, ...args], { windowsHide: true, timeout: 120000 }); return stdout || stderr || 'Completed.'; }
//# sourceMappingURL=repositoryManager.js.map