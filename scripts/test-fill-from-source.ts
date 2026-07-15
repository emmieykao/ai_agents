import { fillPdfFormFromSource } from '../src/tools/pdf-form-tools.js';

const result = await fillPdfFormFromSource.execute!(
  {
    pdfFormName: 'Standard Application',
    sourceDocument: 'EmmieKao_Resume_College.pdf',
  },
  { toolCallId: 'test', messages: [] },
);

console.log(JSON.stringify(result, null, 2));
