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

      if (!selectedForm && data.forms.length > 0) {
        const first = data.forms[0] as FormEntry;
        onSelectForm(first.name, first.kind);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Failed to load forms',
      );
    } finally {
      setIsLoadingForms(false);
    }
  }, [onSelectForm, selectedForm]);

  useEffect(() => {
    void loadForms();
  }, [loadForms, refreshKey]);

  const canFill = Boolean(selectedForm) && !isLoading;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <h2 className="text-sm font-semibold">Fill a form</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Pick a form template. The agent reads your document — no exact filename
        needed.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Source document
          </label>
          <p className="mt-1 truncate text-sm">
            {selectedDocument ?? (
              <span className="text-[var(--muted)]">
                Latest upload (auto-selected)
              </span>
            )}
          </p>
        </div>

        <div>
          <label
            htmlFor="form-select"
            className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]"
          >
            Form template
          </label>
          {isLoadingForms ? (
            <p className="mt-1 text-sm text-[var(--muted)]">Loading forms...</p>
          ) : (
            <select
              id="form-select"
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
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
              {forms.map((form) => (
                <option
                  key={`${form.kind}:${form.name}`}
                  value={`${form.kind}:${form.name}`}
                >
                  {form.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="button"
          disabled={!canFill || forms.length === 0}
          onClick={onFillForm}
          className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isLoading ? 'Filling form...' : 'Fill form from document'}
        </button>
      </div>
    </section>
  );
}
