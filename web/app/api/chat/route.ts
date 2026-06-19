import '@/lib/load-env';
import { documentReaderAgent } from '@agent/agent';
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

  const { messages } = await req.json();

  return createAgentUIStreamResponse({
    agent: documentReaderAgent as unknown as Agent,
    uiMessages: messages,
  });
}
