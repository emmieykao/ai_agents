type DocumentEntry = {
  name: string;
  modified: string;
};

function scoreByKeywords(
  file: DocumentEntry,
  keywords: string[],
): number {
  const name = file.name.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    if (name.includes(keyword.toLowerCase())) {
      score += 1_000;
    }
  }

  if (name.includes('resume') || name.includes('cv')) {
    score += 100;
  }

  if (name.includes('lecture') || name.includes('notes')) {
    score -= 50;
  }

  score += Date.parse(file.modified) / 1_000_000_000_000;

  return score;
}

export function pickPreferredDocumentClient(
  files: DocumentEntry[],
  options?: { keywords?: string[] },
): DocumentEntry | null {
  if (files.length === 0) return null;
  if (files.length === 1) return files[0];

  const keywords = options?.keywords ?? [];

  const scored = [...files].sort(
    (a, b) => scoreByKeywords(b, keywords) - scoreByKeywords(a, keywords),
  );

  return scored[0] ?? null;
}
