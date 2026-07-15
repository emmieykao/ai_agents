import { resolvePdfFormLocation, listAllPdfForms } from '../src/lib/pdf-form-resolve.js';

console.log('All PDF forms:', await listAllPdfForms());

for (const name of ['application', 'Standard Application', 'contact-info']) {
  console.log(`\nresolve "${name}":`, await resolvePdfFormLocation(name));
}
