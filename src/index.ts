import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { documentReaderAgent } from './agent.js';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error(
      'Missing API key. Copy .env.example to .env and set AI_GATEWAY_API_KEY.',
    );
    console.error('Get a key at https://vercel.com/docs/ai-gateway');
    process.exit(1);
  }

  console.log('Document Reader & Form Completer');
  console.log('Documents: ./documents/  |  Forms: ./forms/  |  PDF forms: ./forms/pdf/');
  console.log('Type "exit" to quit.\n');

  while (true) {
    const userInput = await terminal.question('You: ');
    if (!userInput.trim() || userInput.trim().toLowerCase() === 'exit') {
      break;
    }

    process.stdout.write('\nAssistant: ');

    const result = await documentReaderAgent.stream({
      prompt: userInput,
      onStepFinish: async ({ toolCalls }) => {
        if (toolCalls?.length) {
          const names = toolCalls.map((tc) => tc.toolName).join(', ');
          process.stdout.write(`\n  [using tools: ${names}]\n`);
        }
      },
    });

    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }

    process.stdout.write('\n\n');
  }

  terminal.close();
}

main().catch((error) => {
  if (error?.reason === 'maxRetriesExceeded') {
    console.error(
      '\nAI Gateway rate-limited this model on the free tier.',
    );
    console.error(
      'Try setting AI_GATEWAY_MODEL in .env to meta/llama-3.1-8b, wait a few minutes, or add paid credits:',
    );
    console.error(
      'https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dtop-up',
    );
  } else {
    console.error(error);
  }
  process.exit(1);
});
