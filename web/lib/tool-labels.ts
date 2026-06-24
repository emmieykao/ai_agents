export function getToolActivityLabel(
  toolName: string,
  input?: unknown,
): string {
  const args = (input ?? {}) as Record<string, unknown>;

  switch (toolName) {
    case 'listDocuments':
      return 'Listing available documents';
    case 'findDocument':
      return `Finding document matching "${String(args.query ?? '...')}"`;
    case 'readDocument': {
      const target =
        args.filename ??
        args.hint ??
        (args.useLatest ? 'latest upload' : 'document');
      return `Reading ${String(target)}`;
    }
    case 'searchDocuments':
      return `Searching for "${String(args.query ?? '...')}"`;
    case 'listForms':
      return 'Listing form templates';
    case 'getForm':
      return `Loading form: ${String(args.formName ?? '...')}`;
    case 'saveCompletedForm':
      return `Saving completed form: ${String(args.formName ?? '...')}`;
    case 'listCompletedForms':
      return 'Listing completed forms';
    case 'listPdfForms':
      return 'Listing PDF form templates';
    case 'getPdfFormFields':
      return `Reading fields from PDF: ${String(args.pdfFormName ?? '...')}`;
    case 'fillPdfForm':
      return `Filling PDF form: ${String(args.pdfFormName ?? '...')}`;
    case 'fillPdfFormFromSource':
      return `Auto-filling ${String(args.pdfFormName ?? 'PDF form')} from ${String(args.sourceDocument ?? 'source document')}`;
    case 'fillJsonFormFromSource':
      return `Auto-filling ${String(args.formName ?? 'form')} from ${String(args.sourceDocument ?? 'source document')}`;
    default:
      return `Running ${toolName}`;
  }
}

export function getToolStateLabel(state: string): string {
  switch (state) {
    case 'input-streaming':
      return 'Starting';
    case 'input-available':
      return 'Running';
    case 'output-available':
      return 'Complete';
    case 'output-error':
      return 'Failed';
    case 'approval-requested':
      return 'Awaiting approval';
    default:
      return state;
  }
}

export function summarizeToolOutput(
  toolName: string,
  output: unknown,
): string | null {
  if (!output || typeof output !== 'object') return null;

  const result = output as Record<string, unknown>;

  if (typeof result.error === 'string') {
    return result.error;
  }

  if (toolName === 'readDocument' && typeof result.characterCount === 'number') {
    const resolved = result.filename ? ` from ${result.filename}` : '';
    if (result.contactInfoFound === false) {
      return `No contact info detected${resolved}. Try a resume/CV document.`;
    }
    if (result.contactHints && typeof result.contactHints === 'object') {
      const hints = result.contactHints as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof hints.fullName === 'string') parts.push(hints.fullName);
      if (Array.isArray(hints.emails) && hints.emails[0]) {
        parts.push(String(hints.emails[0]));
      }
      if (parts.length > 0) {
        return `Found contact info${resolved}: ${parts.join(' · ')}`;
      }
    }
    return `Extracted ${result.characterCount.toLocaleString()} characters${resolved}`;
  }

  if (toolName === 'findDocument' && typeof result.bestMatch === 'string') {
    return `Best match: ${result.bestMatch}`;
  }

  if (typeof result.count === 'number') {
    return `Found ${result.count} item${result.count === 1 ? '' : 's'}`;
  }

  if (typeof result.savedPdf === 'string') {
    return `Saved ${result.savedPdf}`;
  }

  if (Array.isArray(result.suggestions) && result.suggestions.length > 0) {
    return `Try: ${result.suggestions.slice(0, 3).join(', ')}`;
  }

  if (typeof result.savedTo === 'string') {
    return `Saved ${result.savedTo}`;
  }

  if (typeof result.matchCount === 'number') {
    return `${result.matchCount} match${result.matchCount === 1 ? '' : 'es'}`;
  }

  if (typeof result.filledFieldCount === 'number') {
    return `Filled ${result.filledFieldCount} field${result.filledFieldCount === 1 ? '' : 's'}`;
  }

  if (typeof result.fieldCount === 'number' && toolName.includes('FromSource')) {
    return `Mapped and saved ${result.fieldCount} field${result.fieldCount === 1 ? '' : 's'}`;
  }

  return null;
}
