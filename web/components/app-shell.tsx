'use client';

import { useCallback, useState } from 'react';
import { Chat } from '@/components/chat';
import { DocumentSidebar } from '@/components/document-sidebar';
import { FormFillPanel } from '@/components/form-fill-panel';

export function AppShell() {
  const [selectedDocument, setSelectedDocument] = useState<string>();
  const [selectedForm, setSelectedForm] = useState<string>();
  const [selectedFormKind, setSelectedFormKind] = useState<'json' | 'pdf'>('json');
  const [fillTrigger, setFillTrigger] = useState(0);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [formsRefreshKey, setFormsRefreshKey] = useState(0);

  const handleSelectForm = useCallback((name: string, kind: 'json' | 'pdf') => {
    setSelectedForm(name);
    setSelectedFormKind(kind);
  }, []);

  const documentKeywords =
    selectedForm === 'contact-info' ||
    selectedForm?.toLowerCase().includes('application')
      ? ['resume', 'cv']
      : [];

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
      <header className="mb-6 border-b border-[var(--border)] pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Form Agent</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Upload a document, pick a form, and let the agent fill it for you.
        </p>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-4">
          <DocumentSidebar
            selectedDocument={selectedDocument}
            preferredDocumentKeywords={documentKeywords}
            onSelectDocument={setSelectedDocument}
            onDocumentUploaded={(name) => setSelectedDocument(name)}
            onUploadComplete={({ document, fillableForm }) => {
              if (fillableForm) {
                setSelectedForm(fillableForm.name);
                setSelectedFormKind('pdf');
                setFormsRefreshKey((value) => value + 1);
              } else {
                setSelectedDocument(document.name);
              }
            }}
          />
          <FormFillPanel
            refreshKey={formsRefreshKey}
            selectedDocument={selectedDocument}
            selectedForm={selectedForm}
            selectedFormKind={selectedFormKind}
            onSelectForm={handleSelectForm}
            onFillForm={() => setFillTrigger((value) => value + 1)}
            isLoading={isChatLoading}
          />
        </div>
        <Chat
          selectedDocument={selectedDocument}
          selectedForm={selectedForm}
          selectedFormKind={selectedFormKind}
          fillTrigger={fillTrigger}
          onLoadingChange={setIsChatLoading}
        />
      </div>
    </div>
  );
}
