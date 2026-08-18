import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyEnvFiles } from './env-file.js';

const KEY = 'MCPGEN_ENV_FILE_TEST_VAR';
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mcpgen-env-file-test-'));
  delete process.env[KEY];
});

afterEach(() => {
  delete process.env[KEY];
  rmSync(dir, { recursive: true, force: true });
});

describe('applyEnvFiles', () => {
  it('sets a variable from the file when it is not already present in the environment', () => {
    const path = join(dir, '.env');
    writeFileSync(path, `${KEY}=from-file\n`);

    expect(applyEnvFiles([path])).toBeUndefined();
    expect(process.env[KEY]).toBe('from-file');
  });

  it('never overwrites a variable already set in the real environment', () => {
    process.env[KEY] = 'from-real-env';
    const path = join(dir, '.env');
    writeFileSync(path, `${KEY}=from-file\n`);

    expect(applyEnvFiles([path])).toBeUndefined();
    expect(process.env[KEY]).toBe('from-real-env');
  });

  it('applies multiple files in order, first-write-wins across files too', () => {
    const first = join(dir, 'first.env');
    const second = join(dir, 'second.env');
    writeFileSync(first, `${KEY}=from-first\n`);
    writeFileSync(second, `${KEY}=from-second\n`);

    expect(applyEnvFiles([first, second])).toBeUndefined();
    expect(process.env[KEY]).toBe('from-first');
  });

  it('reports the path and message of the first unreadable file, without throwing', () => {
    const missing = join(dir, 'does-not-exist.env');
    const error = applyEnvFiles([missing]);
    expect(error?.path).toBe(missing);
    expect(error?.message).toBeTruthy();
  });
});
