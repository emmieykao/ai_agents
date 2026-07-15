import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { extractContactHints } from '../src/lib/contact-extract.js';
import { resolvePdfFormLocation } from '../src/lib/pdf-form-resolve.js';

const resolved = await resolvePdfFormLocation('Standard Application');
const bytes = await readFile(resolved.filePath);
const pdf = await PDFDocument.load(bytes);
const fields = pdf
  .getForm()
  .getFields()
  .map((field) => field.getName());

console.log('field count:', fields.length);
console.log(fields.join('\n'));

const resume = await readFile('documents/EmmieKao_Resume_College.pdf');
const { extractText, getDocumentProxy } = await import('unpdf');
const proxy = await getDocumentProxy(new Uint8Array(resume));
const { text } = await extractText(proxy, { mergePages: true });
const content = Array.isArray(text) ? text.join('\n') : text;
console.log('\ncontact hints:', extractContactHints(content));
