import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFCheckBox, PDFDocument, PDFTextField } from 'pdf-lib';

const PDF_PATH = 'forms/pdf/contact-info.pdf';
const OUT_PATH = 'completed/test-manual-fill.pdf';

const values = {
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '555-0100',
  organization: 'Acme Corp',
  job_title: 'Engineer',
  consent: true,
};

const bytes = await readFile(PDF_PATH);
const pdfDoc = await PDFDocument.load(bytes);
const form = pdfDoc.getForm();

for (const [name, value] of Object.entries(values)) {
  const field = form.getFieldMaybe(name);
  if (!field) {
    console.log(`skip missing field: ${name}`);
    continue;
  }

  if (field instanceof PDFTextField) {
    field.setText(String(value));
  } else if (field instanceof PDFCheckBox) {
    if (value) field.check();
    else field.uncheck();
  }
}

await mkdir(path.dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, await pdfDoc.save());
console.log(`Wrote ${OUT_PATH}`);

const check = await PDFDocument.load(await readFile(OUT_PATH));
for (const field of check.getForm().getFields()) {
  const name = field.getName();
  if (field instanceof PDFTextField) {
    console.log(`${name}: ${field.getText()}`);
  }
  if (field instanceof PDFCheckBox) {
    console.log(`${name}: ${field.isChecked()}`);
  }
}
