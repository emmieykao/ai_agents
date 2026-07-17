'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatBytes, formatDate } from '@/lib/format';
import { pickPreferredDocumentClient } from '@/lib/preferred-document';
import { FileUpload } from './file-upload';

type DocumentEntry = {
  name: string;
  sizeBytes: number;
  modified: string;
};

type DocumentSidebarProps = {
  selectedDocument?: string;
  preferredDocumentKeywords?: string[];
  onSelectDocument?: (name: string) => void;
  onDocumentUploaded?: (name: string) => void;
  onUploadComplete?: (result: {
    document: { name: string };
    fillableForm?: { name: string; fieldCount: number } | null;
  }) => void;
};

export function DocumentSidebar({
  selectedDocument,
  preferredDocumentKeywords = [],
  onSelectDocument,
  onDocumentUploaded,
  onUploadComplete,
}: DocumentSidebarProps) {
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    filename: string;
    content: string;
    truncated: boolean;
  } | null>(null);
  const [isReading, setIsReading] = useState(false);

  const loadDocuments = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/documents');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to load documents');
      }

      setDocuments(data.documents);

      const preferred = pickPreferredDocumentClient(data.documents, {
        keywords: preferredDocumentKeywords,
      });

      if (preferred && (!selectedDocument || preferredDocumentKeywords.length > 0)) {
        const currentIsPreferred =
          selectedDocument &&
          preferredDocumentKeywords.some((keyword) =>
            selectedDocument.toLowerCase().includes(keyword.toLowerCase()),
          );

        if (!selectedDocument || !currentIsPreferred) {
          onSelectDocument?.(preferred.name);
        }
      } else if (!selectedDocument && data.documents.length > 0) {
        onSelectDocument?.(data.documents[0].name);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load documents',
      );
    } finally {
      setIsLoading(false);
    }
  }, [onSelectDocument, preferredDocumentKeywords, selectedDocument]);

  const readDocument = useCallback(async (name: string) => {
    setIsReading(true);
    setError(null);

    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(name)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to read document');
      }

      setPreview({
        filename: data.filename,
        content: data.content,
        truncated: data.truncated,
      });
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : 'Failed to read document',
      );
    } finally {
      setIsReading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  return (
    <aside className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="eyebrow">Documents</h2>
        <button
          type="button"
          onClick={() => void loadDocuments()}
          className="btn-quiet"
        >
          refresh
        </button>
      </div>

      <FileUpload
        onUploaded={({ document, fillableForm }) => {
          void loadDocuments();
          onUploadComplete?.({ document, fillableForm });
          if (!fillableForm) {
            onDocumentUploaded?.(document.name);
            onSelectDocument?.(document.name);
          }
        }}
      />

      {isLoading && (
        <p className="font-display text-[13.5px] italic text-ink-faint">
          Opening the cabinet…
        </p>
      )}

      {error && <p className="text-[12.5px] text-seal">{error}</p>}

      {!isLoading && !error && documents.length === 0 && (
        <p className="font-display text-[13.5px] italic text-ink-faint">
          Nothing here yet. Add a resume to begin.
        </p>
      )}

      <ul className="-mx-1.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5">
        {documents.map((doc) => {
          const isSelected = doc.name === selectedDocument;

          return (
            <li key={doc.name}>
              <div
                className={`group flex items-start gap-2 rounded-md border-l-2 py-2 pl-2.5 pr-2 transition-colors ${
                  isSelected
                    ? 'border-pen bg-pen-wash'
                    : 'border-transparent hover:bg-sheet-tint'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectDocument?.(doc.name)}
                  className="min-w-0 flex-1 text-left"
                  title="Use as source"
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`truncate text-[13px] font-medium ${
                        isSelected ? 'text-pen' : ''
                      }`}
                    >
                      {doc.name}
                    </span>
                    {isSelected && (
                      <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.12em] text-pen">
                        in use
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10.5px] text-ink-faint">
                    {formatBytes(doc.sizeBytes)} · {formatDate(doc.modified)}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={isReading}
                  onClick={() => void readDocument(doc.name)}
                  className="btn-quiet shrink-0 pt-0.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  read
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {preview && (
        <div className="max-h-56 shrink-0 overflow-y-auto rounded-md border border-line bg-sheet-tint p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="truncate font-mono text-[10.5px] text-ink-soft">
              {preview.filename}
            </p>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="btn-quiet shrink-0"
            >
              close
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[10.5px] leading-relaxed text-ink-soft">
            {preview.content}
          </pre>
          {preview.truncated && (
            <p className="mt-2 font-display text-[12px] italic text-ink-faint">
              Preview truncated.
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
