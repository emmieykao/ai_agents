import { readFile } from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';
import { PDFDocument } from 'pdf-lib';
import {
  listDocumentFiles,
  matchDocumentFiles,
  resolveDocumentName,
} from '../src/lib/documents.js';

const files = await listDocumentFiles();
console.log(
  'Documents:',
  files.map((file) => file.name),
);

for (const query of [
  'application',
  'standard application',
  'Standard Application.pdf',
  'my application',
  'resume',
  'EmmieKao',
]) {
  const matches = matchDocumentFiles(files, query);
  const resolved = await resolveDocumentName({ hint: query });
  console.log('\n---', query);
  console.log('matches:', matches.map((file) => file.name));
  console.log('resolve:', resolved);
}

console.log('\n--- exact filename');
console.log(
  await resolveDocumentName({ filename: 'Standard Application.pdf' }),
);

console.log('\n--- forContactInfo without filename (simulated)');
console.log(
  await resolveDocumentName({
    hint: 'resume',
    keywords: ['resume', 'cv'],
  }),
);

for (const name of ['Standard Application.pdf', 'EmmieKao_Resume_College.pdf']) {
  const buffer = await readFile(`documents/${name}`);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  const content = Array.isArray(text) ? text.join('\n') : text;
  console.log(`\n--- text from ${name} (${content.length} chars)`);
  console.log(content.slice(0, 400));

  const pdfDoc = await PDFDocument.load(buffer);
  const formFields = pdfDoc.getForm().getFields().map((field) => field.getName());
  console.log('fillable fields:', formFields.length, formFields.slice(0, 10));
}
