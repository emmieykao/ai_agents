import { readFile } from 'node:fs/promises';
import { extractContactHints } from '../src/lib/contact-extract.js';
import {
  listDocumentFiles,
  resolveDocumentName,
} from '../src/lib/documents.js';

const files = await listDocumentFiles();
console.log('Documents:', files.map((file) => file.name));

const resumeResolve = await resolveDocumentName({ hint: 'resume' });
console.log('resolve resume:', resumeResolve);

const latestResolve = await resolveDocumentName({
  useLatest: true,
  keywords: ['resume', 'cv'],
});
console.log('resolve latest for contact:', latestResolve);

const resumeText = await readFile('documents/resume-sample.txt', 'utf-8');
console.log('contact hints from resume-sample.txt:', extractContactHints(resumeText));

const lecture = files.find((file) => file.name.includes('Lecture'));
if (lecture) {
  console.log(
    'lecture notes has contact info:',
    extractContactHints('no email here').hasContactInfo,
  );
}
