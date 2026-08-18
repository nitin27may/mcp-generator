import { join } from 'node:path';
import { getEnv } from './env';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidIdError extends Error {
  constructor(id: string) {
    super(`Not a valid id: "${id}"`);
    this.name = 'InvalidIdError';
  }
}

/**
 * The path-traversal boundary (TIP §51/§53): every path built from a
 * client-supplied id goes through this first. A project/staging id IS its
 * directory name, so anything other than a real UUID must never reach
 * `join()` — that's how `../../etc/passwd`-style ids get refused before a
 * path even exists to traverse.
 */
export function assertValidId(id: string): string {
  if (!UUID_RE.test(id)) throw new InvalidIdError(id);
  return id;
}

export function workspaceRoot(): string {
  return getEnv().MCPGEN_WORKSPACE_ROOT;
}

export function projectDir(projectId: string): string {
  return join(getEnv().MCPGEN_WORKSPACE_ROOT, assertValidId(projectId));
}

export function stagingRoot(): string {
  return join(getEnv().MCPGEN_WORKSPACE_ROOT, '_staging');
}

export function stagingDir(importId: string): string {
  return join(stagingRoot(), assertValidId(importId));
}
