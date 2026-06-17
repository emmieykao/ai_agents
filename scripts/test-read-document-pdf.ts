import { readFile } from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';

const buffer = await readFile('documents/resume-sample.pdf');
const pdf = await getDocumentProxy(new Uint8Array(buffer));
const { text } = await extractText(pdf, { mergePages: true });
const content = typeof text === 'string' ? text : text.join('\n');

console.log('--- extracted text from resume-sample.pdf ---');
console.log(content.trim());
