import '@/lib/load-env';
import {
  createDocumentReaderAgent,
  type AgentUiContext,
} from '@agent/agent';
import type { ProgressEvent } from '@agent/lib/progress';
import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type Agent,
} from 'ai';

export const maxDuration = 60;

/** Turn opaque provider errors (esp. free-tier 429s) into actionable messages. */
function toUserFacingError(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message, error.name);
  try {
    parts.push(JSON.stringify(error));
  } catch {
    /* ignore non-serializable */
  }
  parts.push(String(error));
  const hay = parts.join(' ').toLowerCase();
  const status =
    (error as { statusCode?: number; status?: number } | null)?.statusCode ??
    (error as { statusCode?: number; status?: number } | null)?.status;

  if (
    status === 429 ||
    hay.includes('429') ||
    hay.includes('rate limit') ||
    hay.includes('rate_limit') ||
    hay.includes('rate-limited')
  ) {
    return 'The AI provider is rate-limiting requests (Vercel AI Gateway free tier). Wait ~30 seconds and try again, or add paid credits / set a different AI_GATEWAY_MODEL in the repo-root .env.';
  }

  if (
    status === 401 ||
    hay.includes('unauthorized') ||
    hay.includes('invalid api key') ||
    hay.includes('load api key')
  ) {
    return 'Authentication failed. Check AI_GATEWAY_API_KEY in the repo-root .env file.';
  }

  if (
    hay.includes('model') &&
    (hay.includes('not found') ||
      hay.includes('restricted') ||
      hay.includes('unsupported'))
  ) {
    return 'The configured model is unavailable on your plan. Set a different AI_GATEWAY_MODEL in .env (e.g. google/gemini-2.5-flash-lite).';
  }

  const raw = error instanceof Error ? error.message : '';
  return raw
    ? `Agent error: ${raw}`
    : 'An unexpected error occurred while running the agent.';
}

export async function POST(req: Request) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json(
      {
        error:
          'Missing AI_GATEWAY_API_KEY. Add it to the repo root .env file (same as the CLI).',
      },
      { status: 500 },
    );
  }

  const body = await req.json();
  const { messages, selectedDocument, selectedForm, selectedFormKind } = body;

  const context: AgentUiContext = {
    selectedDocument,
    selectedForm,
    selectedFormKind,
  };

  const stream = createUIMessageStream({
    onError: toUserFacingError,
    execute: async ({ writer }) => {
      let seq = 0;
      // Unique per request — a bare counter would repeat ids (progress-1, ...)
      // across turns and cause duplicate React keys in the UI.
      const runId = crypto.randomUUID().slice(0, 8);

      const agent = createDocumentReaderAgent(context, (event: ProgressEvent) => {
        // Each event becomes a distinct data part so the UI can list sub-steps
        // (reading → extracting → mapping → saving) as they happen.
        writer.write({
          type: 'data-progress',
          id: `progress-${runId}-${++seq}`,
          data: event,
        });
      });

      const agentStream = await createAgentUIStream({
        agent: agent as unknown as Agent,
        uiMessages: messages,
      });

      writer.merge(agentStream);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
