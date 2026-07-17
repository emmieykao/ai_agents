'use client';

import { useCallback, useEffect, useState } from 'react';

type FormEntry = {
  name: string;
  kind: 'json' | 'pdf';
  label: string;
};

type FormFillPanelProps = {
  refreshKey?: number;
  selectedDocument?: string;
  selectedForm?: string;
  selectedFormKind?: 'json' | 'pdf';
  onSelectForm: (name: string, kind: 'json' | 'pdf') => void;
  onFillForm: () => void;
  isLoading?: boolean;
};

export function FormFillPanel({
  refreshKey = 0,
  selectedDocument,
  selectedForm,
  selectedFormKind,
  onSelectForm,
  onFillForm,
  isLoading = false,
}: FormFillPanelProps) {
  const [forms, setForms] = useState<FormEntry[]>([]);
  const [isLoadingForms, setIsLoadingForms] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadForms = useCallback(async () => {
    setError(null);
    setIsLoadingForms(true);

    try {
      const response = await fetch('/api/forms');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to load forms');
      }

      setForms(data.forms);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Failed to load forms',
      );
    } finally {
      setIsLoadingForms(false);
    }
  }, []);

  useEffect(() => {
    void loadForms();
  }, [loadForms, refreshKey]);

  const canFill = Boolean(selectedForm) && !isLoading;

  return (
    <section className="shrink-0 space-y-3 p-4">
      <h2 className="eyebrow">Fill a form</h2>

      <div>
        <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-faint">
          Source
        </p>
        <p className="mt-0.5 truncate text-[13px]">
          {selectedDocument ?? (
            <span className="font-display italic text-ink-faint">
              latest upload, chosen for you
            </span>
          )}
        </p>
      </div>

      <div>
        <label
          htmlFor="form-select"
          className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-faint"
        >
          Form
        </label>
        {isLoadingForms ? (
          <p className="mt-0.5 font-display text-[13px] italic text-ink-faint">
            Fetching forms…
          </p>
        ) : (
          <div className="relative mt-1">
            <select
              id="form-select"
              className="w-full appearance-none rounded-md border border-line bg-sheet-tint px-3 py-2 pr-8 text-[13px] outline-none transition-colors focus:border-pen"
              value={
                selectedForm
                  ? `${selectedFormKind ?? 'json'}:${selectedForm}`
                  : ''
              }
              onChange={(event) => {
                const [kind, name] = event.currentTarget.value.split(':');
                if (name && (kind === 'json' || kind === 'pdf')) {
                  onSelectForm(name, kind);
                }
              }}
            >
              {forms.length === 0 && (
                <option value="">No forms available</option>
              )}
              {forms.length > 0 && !selectedForm && (
                <option value="" disabled>
                  Choose a form…
                </option>
              )}
              {forms.map((form) => (
                <option
                  key={`${form.kind}:${form.name}`}
                  value={`${form.kind}:${form.name}`}
                >
                  {form.label}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6.5 8 10.5l4-4" />
            </svg>
          </div>
        )}
      </div>

      {error && <p className="text-[12px] text-seal">{error}</p>}

      <button
        type="button"
        disabled={!canFill || forms.length === 0}
        onClick={onFillForm}
        className="btn-ink w-full"
      >
        {isLoading ? 'Writing…' : 'Fill from document'}
      </button>
    </section>
  );
}
