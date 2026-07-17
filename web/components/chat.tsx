'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isTextUIPart, type UIMessage } from 'ai';
import { useEffect, useMemo, useRef } from 'react';
import { AgentActivityPanel } from './agent-activity';

/**
 * Render the agent's prose with just enough inline markdown — **bold** and
 * `code` — to keep its answers readable without a markdown dependency.
 */
function InlineProse({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    if (match[1] !== undefined) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {match[1]}
        </strong>,
      );
    } else {
      nodes.push(
        <code key={key++} className="font-mono text-[12px] text-pen">
          {match[2]}
        </code>,
      );
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return <>{nodes}</>;
}

function MessageText({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join('');

  if (!text) return null;

  return (
    <p className="whitespace-pre-wrap font-display text-[15px] leading-relaxed">
      <InlineProse text={text} />
    </p>
  );
}

/**
 * The one-click fill sends the agent detailed instructions; show the intent,
 * not the plumbing. Everything else renders verbatim.
 */
function displayUserText(text: string): string {
  if (text.startsWith('Fill the ') && text.includes('Map fields accurately')) {
    return `${text.split('.')[0]}.`;
  }
  return text;
}

type ChatProps = {
  selectedDocument?: string;
  selectedForm?: string;
  selectedFormKind?: 'json' | 'pdf';
  fillTrigger?: number;
  onLoadingChange?: (isLoading: boolean) => void;
  onMessagesChange?: (messages: UIMessage[]) => void;
};

export function Chat({
  selectedDocument,
  selectedForm,
  selectedFormKind,
  fillTrigger = 0,
  onLoadingChange,
  onMessagesChange,
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
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  // Keep the newest exchange in view as messages stream in.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, isLoading]);

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
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
        <h2 className="eyebrow">Correspondence</h2>
        {isLoading && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-pen">
            <span className="ink-pulse inline-block h-1.5 w-1.5 rounded-full bg-pen" />
            writing
          </span>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <AgentActivityPanel messages={messages} status={status} />

        {messages.length === 0 && (
          <div className="px-4 py-14 text-center">
            <p className="font-display text-[16px] italic leading-relaxed text-ink-soft">
              The agent reads your documents
              <br />
              and answers here.
            </p>
            <p className="mt-3 font-mono text-[10.5px] text-ink-faint">
              try — “fill the travel request from my resume”
            </p>
          </div>
        )}

        {messages.map((message) => {
          if (message.role === 'assistant' && !message.parts.some(isTextUIPart)) {
            return null;
          }

          if (message.role === 'user') {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-lg rounded-br-sm bg-ink px-4 py-3 text-[13px] leading-relaxed text-sheet">
                  <p className="whitespace-pre-wrap">
                    {displayUserText(
                      message.parts
                        .filter(isTextUIPart)
                        .map((part) => part.text)
                        .join(''),
                    )}
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div key={message.id} className="pr-4">
              <p className="eyebrow mb-1.5 !text-[9.5px]">Inkwell</p>
              <MessageText message={message} />
            </div>
          );
        })}

        {error && (
          <div className="rounded-md border border-seal/30 bg-seal-wash p-3 text-[12.5px] text-seal">
            {error.message}
          </div>
        )}
      </div>

      <form
        className="shrink-0 border-t border-line p-3.5"
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
            className="flex-1 rounded-md border border-line bg-sheet px-3.5 py-2.5 text-[13.5px] outline-none transition-colors placeholder:text-ink-faint focus:border-pen"
            placeholder="Ask for a form, or add missing details…"
            disabled={isLoading}
            autoComplete="off"
          />
          <button type="submit" disabled={isLoading} className="btn-ink px-4">
            {isLoading ? 'Working…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
