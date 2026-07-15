'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isTextUIPart, type UIMessage } from 'ai';
import { useEffect, useMemo, useRef } from 'react';
import { AgentActivityPanel } from './agent-activity';

function MessageText({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join('');

  if (!text) return null;

  return <p className="whitespace-pre-wrap">{text}</p>;
}

type ChatProps = {
  selectedDocument?: string;
  selectedForm?: string;
  selectedFormKind?: 'json' | 'pdf';
  fillTrigger?: number;
  onLoadingChange?: (isLoading: boolean) => void;
};

export function Chat({
  selectedDocument,
  selectedForm,
  selectedFormKind,
  fillTrigger = 0,
  onLoadingChange,
}: ChatProps) {
  const contextRef = useRef({
    selectedDocument,
    selectedForm,
    selectedFormKind,
  });
  const lastFillTrigger = useRef(0);

  useEffect(() => {
    contextRef.current = {
      selectedDocument,
      selectedForm,
      selectedFormKind,
    };
  }, [selectedDocument, selectedForm, selectedFormKind]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({
          messages,
          body,
          id,
          trigger,
          messageId,
        }) => ({
          body: {
            ...body,
            messages,
            id,
            trigger,
            messageId,
            ...contextRef.current,
          },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    if (!fillTrigger || fillTrigger === lastFillTrigger.current || !selectedForm) {
      return;
    }

    lastFillTrigger.current = fillTrigger;

    const formLabel =
      selectedFormKind === 'pdf'
        ? `${selectedForm} PDF form`
        : `${selectedForm} form`;

    const isApplicationForm = selectedForm?.toLowerCase().includes('application');

    const documentHint = selectedDocument
      ? `Read the source document "${selectedDocument}" for answers.`
      : isApplicationForm
        ? 'Read the resume/CV document (hint "resume" or forContactInfo: true) for answers.'
        : 'Call readDocument with forContactInfo: true or hint "resume".';

    const formHint =
      selectedFormKind === 'pdf'
        ? `Call fillPdfFormFromSource for "${selectedForm}" with the resume as sourceDocument.`
        : `Call fillJsonFormFromSource for "${selectedForm}" with the resume as sourceDocument.`;

    void sendMessage({
      text: `Fill the ${formLabel}. ${formHint} ${documentHint} As you go, explain your steps in plain language: your plan, which document you used and why, and which fields you mapped. Map fields accurately from the source document and save the completed form. End with a short summary and explicitly list any fields you could not fill.`,
    });
  }, [
    fillTrigger,
    selectedDocument,
    selectedForm,
    selectedFormKind,
    sendMessage,
  ]);

  return (
    <div className="flex flex-1 flex-col">
      <AgentActivityPanel messages={messages} status={status} />

      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] p-6 text-sm text-[var(--muted)]">
            <p className="font-medium text-[var(--foreground)]">How it works</p>
            <ol className="mt-2 list-inside list-decimal space-y-1">
              <li>Upload a document on the left</li>
              <li>Choose a form template</li>
              <li>Click &quot;Fill form from document&quot;</li>
            </ol>
            <p className="mt-3">
              You can also chat naturally — say &quot;fill contact-info using my
              resume&quot; without typing exact filenames.
            </p>
          </div>
        )}

        {messages.map((message) => {
          if (message.role === 'assistant' && !message.parts.some(isTextUIPart)) {
            return null;
          }

          return (
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
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap">
                  {message.parts
                    .filter(isTextUIPart)
                    .map((part) => part.text)
                    .join('')}
                </p>
              ) : (
                <MessageText message={message} />
              )}
            </div>
          );
        })}

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
          const form = event.currentTarget;
          const input = form.elements.namedItem('message') as HTMLInputElement;
          const text = input.value.trim();
          if (!text || isLoading) return;
          void sendMessage({ text });
          input.value = '';
        }}
      >
        <div className="flex gap-2">
          <input
            name="message"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
            placeholder="Ask about your documents or forms..."
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {isLoading ? 'Working...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
