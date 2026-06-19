'use client';

import { useState } from 'react';
import { Chat } from '@/components/chat';
import { DocumentSidebar } from '@/components/document-sidebar';

export function AppShell() {
  const [promptSuggestion, setPromptSuggestion] = useState('');

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
      <header className="mb-6 border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Document Agent</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Upload documents, then ask the agent to read or fill forms.
        </p>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[280px_1fr]">
        <DocumentSidebar
          onSelectDocument={(name) => {
            setPromptSuggestion(`Summarize ${name}`);
          }}
        />
        <Chat promptSuggestion={promptSuggestion} />
      </div>
    </div>
  );
}
