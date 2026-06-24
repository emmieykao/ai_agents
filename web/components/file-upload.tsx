'use client';

import { useCallback, useState } from 'react';

const ACCEPTED_TYPES = '.txt,.md,.pdf';

type FileUploadProps = {
  onUploaded: (result: {
    document: { name: string };
    fillableForm?: { name: string; fieldCount: number } | null;
  }) => void;
};

export function FileUpload({ onUploaded }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setError(null);
      setSuccess(null);
      setIsUploading(true);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? 'Upload failed');
        }

        const fillableNote = data.fillableForm
          ? ` · ${data.fillableForm.fieldCount} fillable fields detected`
          : '';
        setSuccess(`Uploaded ${data.document.name}${fillableNote}`);
        onUploaded({
          document: data.document,
          fillableForm: data.fillableForm ?? null,
        });
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : 'Upload failed',
        );
      } finally {
        setIsUploading(false);
      }
    },
    [onUploaded],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      void uploadFile(files[0]);
    },
    [uploadFile],
  );

  return (
    <div className="space-y-2">
      <label
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
          isDragging
            ? 'border-[var(--accent)] bg-blue-50/50 dark:bg-blue-950/20'
            : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]'
        } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          disabled={isUploading}
          onChange={(event) => handleFiles(event.target.files)}
        />
        <p className="text-sm font-medium">
          {isUploading ? 'Uploading...' : 'Drop a file here'}
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          or click to browse · .txt, .md, .pdf · max 10 MB
        </p>
      </label>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {success && (
        <p className="text-xs text-green-600 dark:text-green-400">{success}</p>
      )}
    </div>
  );
}
