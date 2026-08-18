import { describe, expect, it } from 'vitest';
import { resolveSourcePointerLine } from './source-pointer';

describe('resolveSourcePointerLine', () => {
  it('finds a JSON property line by its unescaped last segment', () => {
    const raw = '{\n  "paths": {\n    "/pets": {\n      "get": {}\n    }\n  }\n}';
    expect(resolveSourcePointerLine(raw, '/paths/~1pets/get')).toBe(4);
  });

  it('skips trailing array-index segments to find the containing key', () => {
    const raw = '{\n  "servers": [\n    { "url": "https://api.example.com" }\n  ]\n}';
    expect(resolveSourcePointerLine(raw, '/servers/0')).toBe(2);
  });

  it('matches YAML-style `key:` lines too', () => {
    const raw = 'paths:\n  /pets:\n    get:\n      summary: List pets\n';
    expect(resolveSourcePointerLine(raw, '/paths/~1pets/get')).toBe(3);
  });

  it('returns undefined when the pointer is empty', () => {
    expect(resolveSourcePointerLine('{}', '')).toBeUndefined();
  });

  it('returns undefined when no line matches', () => {
    expect(resolveSourcePointerLine('{}', '/nonexistent')).toBeUndefined();
  });
});
