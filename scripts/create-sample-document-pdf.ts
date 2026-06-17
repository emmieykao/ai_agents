import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const lines = [
  'RESUME',
  '',
  'Full Name: Jane Doe',
  'Email: jane.doe@example.com',
  'Phone: (555) 123-4567',
  '',
  'Current Organization: Acme Corporation',
  'Job Title: Software Engineer',
  '',
  'Mailing Address:',
  '123 Main Street',
  'San Francisco, CA 94102',
  '',
  'I consent to being contacted regarding opportunities.',
];

const pdfDoc = await PDFDocument.create();
const page = pdfDoc.addPage([612, 792]);
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

let y = 740;
for (const line of lines) {
  page.drawText(line, { x: 50, y, size: 12, font });
  y -= 22;
}

const outDir = path.resolve('documents');
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, 'resume-sample.pdf');
await writeFile(outPath, await pdfDoc.save());
console.log(`Created ${outPath}`);
