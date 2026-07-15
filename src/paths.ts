import path from 'node:path';

/** Repo root: works from CLI (cwd) or Next.js dev server (web/). */
export function getProjectRoot(): string {
  if (process.env.AGENT_ROOT) {
    return path.resolve(process.env.AGENT_ROOT);
  }

  const cwd = process.cwd();
  const base = path.basename(cwd);

  if (base === 'web') {
    return path.resolve(cwd, '..');
  }

  return cwd;
}

export const DOCUMENTS_DIR = path.join(getProjectRoot(), 'documents');
export const FORMS_DIR = path.join(getProjectRoot(), 'forms');
export const PDF_FORMS_DIR = path.join(getProjectRoot(), 'forms', 'pdf');
export const COMPLETED_DIR = path.join(getProjectRoot(), 'completed');
