// Copy the pdf.js runtime into public/ so the browser loads it as plain static
// files. Bundling pdf.js through webpack breaks it at runtime
// ("Object.defineProperty called on non-object"), so we keep it out of the
// bundle entirely and import it with webpackIgnore at runtime.
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(webDir, 'node_modules', 'pdfjs-dist', 'build');
const target = path.join(webDir, 'public', 'pdfjs');

await mkdir(target, { recursive: true });
for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  await copyFile(path.join(source, file), path.join(target, file));
}
console.log('pdf.js runtime copied to public/pdfjs/');
