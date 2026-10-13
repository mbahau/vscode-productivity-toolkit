import * as path from 'node:path';

export function isWindowsPath(value: string): boolean { return /^[a-zA-Z]:[\\/]/.test(value); }
export function windowsToWsl(value: string): string | undefined {
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(value.trim());
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`.replace(/\/+$/, '') : undefined;
}
export function normalizeRoot(configured: string, wslOverride: string, isWsl: boolean): string {
  const input = (isWsl && wslOverride.trim()) ? wslOverride.trim() : configured.trim();
  const converted = isWsl && isWindowsPath(input) ? windowsToWsl(input) : input;
  return converted ? path.normalize(converted) : '';
}
export function canonicalPath(value: string): string { return path.resolve(value); }
