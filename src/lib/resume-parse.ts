import { extractContactHints, type ContactHints } from './contact-extract.js';

export type ResumeProfile = ContactHints & {
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  schools: Array<{ name: string; degree: string | null; dates: string | null }>;
  skills: string | null;
  summary: string | null;
  yearsExperience: string | null;
  desiredRole: string | null;
  portfolioUrl: string | null;
};

/** A standalone header line like "Alex Rivera" — 2-4 Title-Case words, no punctuation/digits. */
function isLikelyNameLine(line: string): boolean {
  if (/[@|•:\d]/.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  if (line === line.toUpperCase()) return false; // skip ALL-CAPS section headers
  return words.every((w) => /^[A-Z][A-Za-z'’.-]*$/.test(w));
}

/**
 * Parse the top-of-resume header block, supporting both:
 *  - inline: "Jane Doe  jane@x.com | (555) ..."
 *  - stacked: name on line 1, role on line 2, contact on line 3
 */
function parseHeader(content: string): { name: string | null; title: string | null } {
  const lines = content.split('\n').map((l) => l.trim());
  const filledIdx = lines
    .map((line, index) => (line ? index : -1))
    .filter((index) => index >= 0);

  for (let k = 0; k < Math.min(filledIdx.length, 4); k++) {
    const line = lines[filledIdx[k]];
    if (/^(resume|cv|curriculum vitae)$/i.test(line)) continue;

    const inline = line.match(
      /^([A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){1,3})(?:\s+[\w.+-]+@|\s*[•|])/,
    );

    let name: string | null = null;
    if (inline?.[1]) name = inline[1].trim();
    else if (isLikelyNameLine(line)) name = line;

    if (name) {
      const next = lines[filledIdx[k + 1]];
      const title =
        next &&
        !/[@|]/.test(next) &&
        !/^[A-Z\s&]+$/.test(next) && // not an ALL-CAPS section header
        next.split(/\s+/).length <= 6
          ? next
          : null;
      return { name, title };
    }
  }

  return { name: null, title: null };
}

function splitName(fullName: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!fullName) return { firstName: null, lastName: null };

  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
  };
}

/** Extract "City, ST" (with optional ZIP) from anywhere in the document. */
function parseLocation(content: string): {
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const match = content.match(
    /([A-Z][a-zA-Z.]+(?:\s+[A-Z][a-zA-Z.]+)*),\s*([A-Z]{2})\b(?:\s+(\d{5}))?/,
  );
  if (!match) return { city: null, state: null, zip: null };
  return { city: match[1].trim(), state: match[2], zip: match[3] ?? null };
}

/** Most recent experience entry: "Title, Company (dates)". */
function parseExperience(
  content: string,
): { title: string; company: string; dates: string } | null {
  const section = content.match(
    /\n\s*(?:EXPERIENCE|WORK EXPERIENCE|EMPLOYMENT)\s*\n([\s\S]*?)(?:\n\s*(?:EDUCATION|SKILLS|PROJECTS|CERTIFICATION)\b|$)/i,
  )?.[1];
  if (!section) return null;

  const line = section
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /\(\d{4}/.test(l) && l.includes(','));
  if (!line) return null;

  const match = line.match(/^(.+?),\s*(.+?)\s*\(([^)]*)\)/);
  if (!match) return null;

  return { title: match[1].trim(), company: match[2].trim(), dates: match[3].trim() };
}

function parseSummary(content: string): string | null {
  const match = content.match(
    /\n\s*(?:SUMMARY|PROFILE|OBJECTIVE)\s*\n([\s\S]*?)(?:\n\s*(?:EXPERIENCE|EDUCATION|SKILLS|WORK|PROJECTS)\b|$)/i,
  );
  return match?.[1]?.replace(/\s+/g, ' ').trim() || null;
}

function parseYearsExperience(content: string): string | null {
  const match = content.match(/(\d+\+?)\s*years?(?:\s+of)?\s+experience/i);
  return match?.[1] ?? null;
}

function parsePortfolioUrl(content: string): string | null {
  const match = content.match(/\b((?:https?:\/\/|www\.)\S+)/i);
  return match?.[1]?.replace(/[.,)]+$/, '') ?? null;
}

function parseSchools(content: string): ResumeProfile['schools'] {
  const educationSection = content.match(
    /EDUCATION\s*([\s\S]*?)(?:\nRESEARCH|\nLEADERSHIP|\nEXPERIENCE|\nSKILLS|$)/i,
  )?.[1];

  if (!educationSection) return [];

  const schoolHeaders = [
    ...educationSection.matchAll(
      /([A-Z][A-Z'’\s&.-]{3,})\s+(\d{4}\s*[-–]\s*(?:\d{4}|Present))/g,
    ),
  ];

  if (schoolHeaders.length === 0) return [];

  return schoolHeaders.slice(0, 3).map((match, index) => {
    const name = match[1].trim();
    const dates = match[2].trim();
    const startIndex = match.index ?? 0;
    const nextIndex = schoolHeaders[index + 1]?.index ?? educationSection.length;
    const detail = educationSection.slice(startIndex, nextIndex).replace(match[0], '');
    const degree =
      detail.match(
        /\b((?:B\.?A\.?|B\.?S\.?|M\.?A\.?|M\.?S\.?|Ph\.?D\.?|Intended [^.]+|Cum Laude[^.\n]*))/i,
      )?.[1]?.trim() ??
      detail
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ??
      null;

    return { name, degree, dates };
  });
}

function parseSkills(content: string): string | null {
  const skillsSection = content.match(
    /SKILLS(?:\s*&\s*INTERESTS)?\s*([\s\S]*?)(?:\n\n|$)/i,
  )?.[1];

  return skillsSection?.replace(/\s+/g, ' ').trim() ?? null;
}

export function parseResumeProfile(content: string): ResumeProfile {
  const hints = extractContactHints(content);
  const header = parseHeader(content);
  const experience = parseExperience(content);
  const location = parseLocation(content);

  const fullName = hints.fullName ?? header.name;
  const { firstName, lastName } = splitName(fullName);
  const jobTitle = hints.jobTitle ?? header.title ?? experience?.title ?? null;
  const organization = hints.organization ?? experience?.company ?? null;

  return {
    ...hints,
    fullName,
    firstName,
    lastName,
    jobTitle,
    organization,
    city: location.city,
    state: location.state,
    zip: location.zip,
    schools: parseSchools(content),
    skills: parseSkills(content),
    summary: parseSummary(content),
    yearsExperience: parseYearsExperience(content),
    desiredRole: header.title ?? jobTitle,
    portfolioUrl: parsePortfolioUrl(content),
  };
}

export function formatNameLastFirstMiddle(profile: ResumeProfile): string | null {
  if (!profile.fullName) return null;

  const { firstName, lastName } = profile;
  if (firstName && lastName && firstName !== lastName) {
    const middle = profile.fullName
      .split(/\s+/)
      .slice(1, -1)
      .join(' ');
    return middle
      ? `${lastName}, ${firstName} ${middle}`
      : `${lastName}, ${firstName}`;
  }

  return profile.fullName;
}
