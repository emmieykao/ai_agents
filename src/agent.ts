import type { GatewayProviderOptions } from '@ai-sdk/gateway';
import { ToolLoopAgent } from 'ai';
import { documentTools } from './tools/document-tools.js';
import { formTools } from './tools/form-tools.js';
import { pdfFormTools } from './tools/pdf-form-tools.js';

// Free tier rate-limits popular models. Override in .env if needed.
const model = process.env.AI_GATEWAY_MODEL ?? 'meta/llama-3.1-8b';

const fallbackModels =
  process.env.AI_GATEWAY_MODEL_FALLBACKS?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [
    'google/gemini-2.5-flash-lite',
    'openai/gpt-4o-mini',
    'anthropic/claude-3-haiku',
  ];

export const documentReaderAgent = new ToolLoopAgent({
  model,
  providerOptions: {
    gateway: {
      models: fallbackModels,
    } satisfies GatewayProviderOptions,
  },
  instructions: `You are a document-reading and form-completion assistant.

## Reading documents
1. Use listDocuments to see available files.
2. Use readDocument to read specific files before summarizing or quoting them.
3. Use searchDocuments to find relevant passages across files.
4. Cite filenames when referencing content.
5. If a document is truncated, note that and offer to focus on a section.

## Completing JSON forms
1. Use listForms to see JSON form templates in forms/.
2. Use getForm to load field definitions before filling a form.
3. Read source documents to extract values for each field.
4. Only fill fields with information found in documents or explicitly provided by the user.
5. Leave unknown fields empty (null) rather than guessing.
6. Use saveCompletedForm to persist JSON results to completed/.
7. In notes, explain any missing required fields or assumptions.

## Completing PDF forms
1. Use listPdfForms to see fillable PDF templates in forms/pdf/.
2. Use getPdfFormFields to discover exact PDF field names before filling.
3. Read source documents to extract values mapped to those field names.
4. Use fillPdfForm to write a filled PDF to completed/ (plus a metadata JSON file).
5. Set flatten: true if the user wants a non-editable final PDF.
6. Only fill fields with information found in documents or explicitly provided by the user.

Be accurate. Do not invent information.`,
  tools: {
    ...documentTools,
    ...formTools,
    ...pdfFormTools,
  },
});
