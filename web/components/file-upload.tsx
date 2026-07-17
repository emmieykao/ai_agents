'use client';

import { useCallback, useState } from 'react';
import { Glyph } from './icons';

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
          ? ` · ${data.fillableForm.fieldCount} fillable fields found`
          : '';
        setSuccess(`Added ${data.document.name}${fillableNote}`);
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
    <div className="space-y-1.5">
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-5 text-center transition-colors ${
          isDragging
            ? 'border-pen bg-pen-wash'
            : 'border-line-strong hover:border-pen'
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
        <Glyph
          name="arrow-up"
          className={`h-3.5 w-3.5 ${isDragging ? 'text-pen' : 'text-ink-faint'}`}
        />
        <p className="text-[13px] font-medium">
          {isUploading ? 'Adding…' : 'Drop a document'}
        </p>
        <p className="font-mono text-[10px] text-ink-faint">
          or click to browse · .txt .md .pdf · 10 MB
        </p>
      </label>

      {error && <p className="text-[12px] text-seal">{error}</p>}
      {success && <p className="font-mono text-[11px] text-pen">{success}</p>}
    </div>
  );
}
