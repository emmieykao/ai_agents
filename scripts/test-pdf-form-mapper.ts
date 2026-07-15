import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { readDocumentTextByName } from '../src/lib/document-content.js';
import { mapPdfFieldsFromContent } from '../src/lib/pdf-form-mapper.js';
import { resolvePdfFormLocation } from '../src/lib/pdf-form-resolve.js';
import { parseResumeProfile } from '../src/lib/resume-parse.js';

const source = await readDocumentTextByName({
  filename: 'EmmieKao_Resume_College.pdf',
});
if ('error' in source) {
  console.error(source);
  process.exit(1);
}

console.log('profile:', parseResumeProfile(source.content));

const resolved = await resolvePdfFormLocation('Standard Application');
const bytes = await readFile(resolved.filePath);
const pdf = await PDFDocument.load(bytes);
const fieldNames = pdf.getForm().getFields().map((field) => field.getName());
const mapped = mapPdfFieldsFromContent(fieldNames, source.content);

console.log('\nMapped', Object.keys(mapped).length, 'fields:');
for (const [key, value] of Object.entries(mapped)) {
  console.log(`  ${key}: ${value}`);
}
