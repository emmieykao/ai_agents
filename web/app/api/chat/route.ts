import '@/lib/load-env';
import {
  createDocumentReaderAgent,
  type AgentUiContext,
} from '@agent/agent';
import { createAgentUIStreamResponse, type Agent } from 'ai';

export const maxDuration = 60;

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

  const agent = createDocumentReaderAgent(context);

  return createAgentUIStreamResponse({
    agent: agent as unknown as Agent,
    uiMessages: messages,
  });
}
