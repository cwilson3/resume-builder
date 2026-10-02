import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { BUILDER_DIR, CONFIG_FILE, ENV_VAR, REPO_ROOT, resolveMaster } from './resolve-master';

describe('resolveMaster', () => {
  let dir: string;
  let masterFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rezoom-master-'));
    masterFile = join(dir, 'someone.md');
    writeFileSync(masterFile, '# Someone\n\nsomewhere\n\n## Summary\n\nHi.\n');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const configWith = (body: string): string => {
    const file = join(dir, 'rezoom.config.json');
    writeFileSync(file, body);
    return file;
  };

  describe('from rezoom.config.json', () => {
    it('resolves the real config to an existing file with a repo-relative label', () => {
      const master = resolveMaster({}, CONFIG_FILE);
      expect(master.origin).toBe('config');
      expect(isAbsolute(master.file)).toBe(true);
      expect(existsSync(master.file)).toBe(true);
      expect(master.file.endsWith('.md')).toBe(true);
      expect(master.label).toBe(relative(REPO_ROOT, master.file));
    });

    it('resolves the "master" path relative to the builder directory', () => {
      const config = configWith(JSON.stringify({ master: relative(BUILDER_DIR, masterFile) }));
      const master = resolveMaster({}, config);
      expect(master.file).toBe(masterFile);
      expect(master.origin).toBe('config');
    });

    it('trims surrounding whitespace from the path', () => {
      const config = configWith(JSON.stringify({ master: `  ${masterFile}  ` }));
      expect(resolveMaster({}, config).file).toBe(masterFile);
    });

    it.each([
      ['missing', '{}'],
      ['empty', '{ "master": "" }'],
      ['blank', '{ "master": "   " }'],
      ['not a string', '{ "master": 42 }'],
      ['not an object', 'null'],
    ])('rejects a config whose "master" is %s', (_label, body) => {
      const config = configWith(body);
      expect(() => resolveMaster({}, config)).toThrow(/"master" must be a non-empty path/);
    });

    it('reports a config file that cannot be read or parsed', () => {
      expect(() => resolveMaster({}, join(dir, 'nope.json'))).toThrow(/Cannot read .*nope\.json/);
      expect(() => resolveMaster({}, configWith('{ not json'))).toThrow(/Cannot read/);
    });

    it('names the config file when the master it points at does not exist', () => {
      const config = configWith(JSON.stringify({ master: join(dir, 'missing.md') }));
      expect(() => resolveMaster({}, config)).toThrow(/Master resume not found: .*missing\.md \(from .*rezoom\.config\.json\)/);
    });
  });

  describe(`from the ${ENV_VAR} environment variable`, () => {
    it('wins over the config file', () => {
      const config = configWith(JSON.stringify({ master: 'does-not-matter.md' }));
      const master = resolveMaster({ [ENV_VAR]: masterFile }, config);
      expect(master.file).toBe(masterFile);
      expect(master.origin).toBe('env');
      expect(master.label).toBe(relative(REPO_ROOT, masterFile));
    });

    it('resolves a relative path against the builder directory, like the config does', () => {
      const master = resolveMaster({ [ENV_VAR]: relative(BUILDER_DIR, masterFile) }, join(dir, 'unused.json'));
      expect(master.file).toBe(masterFile);
    });

    it('falls back to the config when the variable is blank', () => {
      const config = configWith(JSON.stringify({ master: masterFile }));
      const master = resolveMaster({ [ENV_VAR]: '   ' }, config);
      expect(master.file).toBe(masterFile);
      expect(master.origin).toBe('config');
    });

    it('names the variable when the file it points at does not exist', () => {
      expect(() => resolveMaster({ [ENV_VAR]: join(dir, 'missing.md') }, CONFIG_FILE)).toThrow(
        new RegExp(`Master resume not found: .*missing\\.md \\(from ${ENV_VAR}\\)`),
      );
    });
  });
});
