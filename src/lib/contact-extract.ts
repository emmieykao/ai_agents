const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.\w+/g;
const PHONE_PATTERN =
  /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

export type ContactHints = {
  emails: string[];
  phones: string[];
  fullName: string | null;
  organization: string | null;
  jobTitle: string | null;
  address: string | null;
  hasContactInfo: boolean;
};

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function matchLabelValue(content: string, labels: string[]): string | null {
  for (const label of labels) {
    const pattern = new RegExp(
      `(?:^|\\n)\\s*${label}\\s*[:：]\\s*(.+?)(?:\\n|$)`,
      'im',
    );
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function matchAddressBlock(content: string): string | null {
  const blockMatch = content.match(
    /(?:mailing\s+address|address)\s*[:：]?\s*\n?([\s\S]{0,200}?)(?:\n\n|$)/i,
  );

  if (!blockMatch?.[1]) {
    return null;
  }

  const lines = blockMatch[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  return lines.length > 0 ? lines.join(', ') : null;
}

export function extractContactHints(content: string): ContactHints {
  const emails = unique(content.match(EMAIL_PATTERN) ?? []);
  const phones = unique(content.match(PHONE_PATTERN) ?? []);
  const fullName = matchLabelValue(content, [
    'full\\s*name',
    'name',
    'applicant\\s*name',
  ]);
  const organization = matchLabelValue(content, [
    'current\\s+organization',
    'organization',
    'company',
    'employer',
  ]);
  const jobTitle = matchLabelValue(content, [
    'job\\s*title',
    'title',
    'position',
    'role',
  ]);
  const address =
    matchAddressBlock(content) ??
    matchLabelValue(content, ['mailing\\s+address', 'address']);

  const hasContactInfo =
    emails.length > 0 ||
    phones.length > 0 ||
    Boolean(fullName) ||
    Boolean(organization);

  return {
    emails,
    phones,
    fullName,
    organization,
    jobTitle,
    address,
    hasContactInfo,
  };
}
