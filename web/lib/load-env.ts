import { config } from 'dotenv';
import path from 'node:path';

/** Load repo-root .env, then web/.env.local overrides. */
export function loadEnv(): void {
  const webDir = process.cwd();
  const repoRoot = path.basename(webDir) === 'web' ? path.resolve(webDir, '..') : webDir;

  config({ path: path.join(repoRoot, '.env') });
  config({ path: path.join(webDir, '.env.local'), override: true });
}

loadEnv();
