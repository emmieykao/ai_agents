# ai_agents

An AI agent that reads documents and fills structured forms from their content, built with the [Vercel AI SDK](https://ai-sdk.dev/).

## What it does

The agent uses `ToolLoopAgent` with document and form tools:

**Documents**
- **listDocuments** — lists `.txt`, `.md`, and `.pdf` files in `documents/`
- **readDocument** — reads a file's full text
- **searchDocuments** — searches for a phrase across all documents

**JSON forms**
- **listForms** — lists form templates in `forms/`
- **getForm** — loads field definitions (labels, types, required flags)
- **saveCompletedForm** — saves filled JSON forms to `completed/`
- **listCompletedForms** — lists previously saved outputs

**PDF forms**
- **listPdfForms** — lists fillable PDF templates in `forms/pdf/`
- **getPdfFormFields** — reads AcroForm field names from a PDF
- **fillPdfForm** — fills a PDF and saves it to `completed/`

Drop files into `documents/`, define forms in `forms/`, then ask things like:
- "Summarize sample.txt"
- "Fill out the contact-info JSON form using my resume"
- "Fill the contact-info PDF using resume-sample.pdf"
- "Create an intake summary from report.pdf"

## Setup

Requires **Node.js 18+**.

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure an API key**

   ```bash
   cp .env.example .env
   ```

   Set `AI_GATEWAY_API_KEY` from [Vercel AI Gateway](https://vercel.com/docs/ai-gateway).

   Optional: set `AI_GATEWAY_MODEL` in `.env` (default: `google/gemini-2.5-flash`). Free tier blocks many premium models — browse [available models](https://vercel.com/ai-gateway/models) if you get a restricted-model error.

3. **Add documents and forms**

   Put `.txt`, `.md`, or `.pdf` files in `documents/`. PDFs are text-extracted automatically (works best on digital PDFs, not scans).

   A sample source PDF is included. To regenerate it:

   ```bash
   npm run create-sample-document-pdf
   ```

   Form templates live in `forms/` as JSON files. Two examples are included:
   - `contact-info.json` — name, email, phone, etc.
   - `intake-summary.json` — document summary fields

   **PDF forms:** place fillable PDFs (with AcroForm fields) in `forms/pdf/`.
   A sample `contact-info.pdf` is included. To regenerate it:

   ```bash
   npm run create-sample-pdf
   ```

   You can also add your own PDFs exported from Adobe Acrobat, LibreOffice, etc.

4. **Run**

   CLI:
   ```bash
   npm start
   ```

   Web UI (Phase 1–2):
   ```bash
   cd web
   cp .env.local.example .env.local   # or copy keys from ../.env
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Upload `.txt`, `.md`, or `.pdf` files in the sidebar, then chat about them.

## Project structure

```
ai_agents/
├── documents/          # Source files to read
├── forms/              # JSON form templates
│   └── pdf/            # Fillable PDF templates
├── completed/          # Filled forms (generated)
├── src/
│   ├── index.ts        # CLI entry point
│   ├── agent.ts        # ToolLoopAgent definition
│   └── tools/
│       ├── document-tools.ts
│       ├── form-tools.ts
│       └── pdf-form-tools.ts
├── web/                    # Next.js chat UI
│   ├── app/
│   │   ├── api/chat/       # Agent API route
│   │   └── page.tsx
│   └── components/chat.tsx
├── .env.example
└── package.json
```

## Next steps

- Add a Next.js API route with `createAgentUIStreamResponse` for a web UI
- Swap models via `AI_GATEWAY_MODEL` in `.env` (e.g. `meta/llama-3.1-8b`, `openai/gpt-4o-mini`)
- Extend tools for URLs, databases, or RAG with embeddings

## Resources

- [AI SDK docs](https://ai-sdk.dev/docs/introduction)
- [Building agents](https://ai-sdk.dev/docs/agents/building-agents)
- [Node.js quickstart](https://ai-sdk.dev/docs/getting-started/nodejs)
