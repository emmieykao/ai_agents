'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatBytes, formatDate } from '@/lib/format';
import { FileUpload } from './file-upload';

type DocumentEntry = {
  name: string;
  sizeBytes: number;
  modified: string;
};

type DocumentSidebarProps = {
  onSelectDocument?: (name: string) => void;
};

export function DocumentSidebar({ onSelectDocument }: DocumentSidebarProps) {
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
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load documents',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    <aside className="flex h-full flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold">Documents</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Upload, read, or ask the agent to summarize
        </p>
      </div>

      <FileUpload onUploaded={loadDocuments} />

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          {documents.length} file{documents.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          onClick={() => void loadDocuments()}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          Refresh
        </button>
      </div>

      {isLoading && (
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {!isLoading && !error && documents.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No documents yet.</p>
      )}

      <ul className="space-y-2 overflow-y-auto">
        {documents.map((doc) => (
          <li
            key={doc.name}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
          >
            <p className="truncate text-sm font-medium">{doc.name}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {formatBytes(doc.sizeBytes)} · {formatDate(doc.modified)}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={isReading}
                onClick={() => void readDocument(doc.name)}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
              >
                Read
              </button>
              <button
                type="button"
                onClick={() => onSelectDocument?.(doc.name)}
                className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:border-[var(--accent)]"
              >
                Summarize
              </button>
            </div>
          </li>
        ))}
      </ul>

      {preview && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium">{preview.filename}</p>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Close
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-xs text-[var(--muted)]">
            {preview.content}
          </pre>
          {preview.truncated && (
            <p className="mt-2 text-xs italic text-[var(--muted)]">
              Preview truncated. Use Summarize for full AI analysis.
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
