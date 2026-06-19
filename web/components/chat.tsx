'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useState } from 'react';

function MessageContent({
  parts,
}: {
  parts: Array<{ type: string; text?: string; toolName?: string; state?: string }>;
}) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'text' && part.text) {
          return (
            <p key={index} className="whitespace-pre-wrap">
              {part.text}
            </p>
          );
        }

        if (part.type === 'tool-invocation' || part.type.startsWith('tool-')) {
          const name =
            'toolName' in part && part.toolName
              ? part.toolName
              : part.type.replace('tool-', '');
          return (
            <p
              key={index}
              className="mt-2 text-xs text-[var(--muted)] italic"
            >
              Using tool: {name}
              {part.state ? ` (${part.state})` : ''}
            </p>
          );
        }

        return null;
      })}
    </>
  );
}

export function Chat({
  promptSuggestion = '',
}: {
  promptSuggestion?: string;
}) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat();

  useEffect(() => {
    if (promptSuggestion) {
      setInput(promptSuggestion);
    }
  }, [promptSuggestion]);

  const isLoading = status === 'streaming' || status === 'submitted';

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
            <p className="font-medium text-[var(--foreground)]">Try asking:</p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Upload a PDF on the left, then ask about it</li>
              <li>Summarize resume-sample.pdf</li>
              <li>Fill the contact-info PDF using my uploaded file</li>
            </ul>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-lg border border-[var(--border)] p-4 ${
              message.role === 'user'
                ? 'ml-8 bg-[var(--card)]'
                : 'mr-8 bg-[var(--card)]'
            }`}
          >
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {message.role === 'user' ? 'You' : 'Agent'}
            </p>
            <MessageContent parts={message.parts} />
          </div>
        ))}

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error.message}
          </div>
        )}
      </div>

      <form
        className="sticky bottom-0 border-t border-[var(--border)] bg-[var(--background)] pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() || isLoading) return;
          sendMessage({ text: input });
          setInput('');
        }}
      >
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
            value={input}
            placeholder="Ask about your documents..."
            onChange={(event) => setInput(event.currentTarget.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
