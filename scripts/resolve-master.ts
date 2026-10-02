/**
 * Which Markdown file is the master resume.
 *
 * Read from `rezoom.config.json` in the builder directory (the `master` path is
 * relative to that directory). The REZOOM_MASTER environment variable, when set,
 * overrides the config and is resolved the same way. Shared by the Vite plugin
 * that ships the master beside the page and by the command-line build script, so
 * both always agree on the file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILDER_DIR = fileURLToPath(new URL('..', import.meta.url));
export const REPO_ROOT = BUILDER_DIR;
export const CONFIG_FILE = resolve(BUILDER_DIR, 'rezoom.config.json');
export const ENV_VAR = 'REZOOM_MASTER';

export interface MasterSource {
  /** Absolute path of the Markdown file. */
  file: string;
  /** Path shown in the page: relative to the repository root. */
  label: string;
  /** Where the path came from. */
  origin: 'env' | 'config';
}

export function resolveMaster(env: NodeJS.ProcessEnv = process.env, configFile = CONFIG_FILE): MasterSource {
  const override = env[ENV_VAR]?.trim();
  let file: string;
  let origin: MasterSource['origin'];

  if (override) {
    file = resolve(BUILDER_DIR, override);
    origin = 'env';
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(configFile, 'utf8'));
    } catch (err) {
      throw new Error(`Cannot read ${configFile}: ${(err as Error).message}`);
    }
    const master = (parsed as { master?: unknown })?.master;
    if (typeof master !== 'string' || master.trim() === '') {
      throw new Error(`${configFile}: "master" must be a non-empty path to a Markdown file`);
    }
    file = resolve(BUILDER_DIR, master.trim());
    origin = 'config';
  }

  if (!existsSync(file)) {
    const from = origin === 'env' ? ENV_VAR : configFile;
    throw new Error(`Master resume not found: ${file} (from ${from})`);
  }
  return { file, label: relative(REPO_ROOT, file), origin };
}
