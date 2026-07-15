import { parseResumeProfile, formatNameLastFirstMiddle } from './resume-parse.js';

function normalizeFieldLabel(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fieldMatches(name: string, patterns: RegExp[]): boolean {
  const normalized = normalizeFieldLabel(name);
  return patterns.some((pattern) => pattern.test(normalized));
}

export function mapPdfFieldsFromContent(
  fieldNames: string[],
  content: string,
): Record<string, string> {
  const profile = parseResumeProfile(content);
  const values: Record<string, string> = {};

  for (const fieldName of fieldNames) {
    const value = suggestPdfFieldValue(fieldName, profile);
    if (value) {
      values[fieldName] = value;
    }
  }

  return values;
}

function suggestPdfFieldValue(
  fieldName: string,
  profile: ReturnType<typeof parseResumeProfile>,
): string | null {
  // Formal application PDFs ask for "Last, First Middle" order.
  if (fieldMatches(fieldName, [/^name last first middle$/])) {
    return formatNameLastFirstMiddle(profile) ?? profile.fullName;
  }

  // Generic name fields expect natural "First Last" order.
  if (
    fieldMatches(fieldName, [/^full name$/, /^applicant name$/, /^full_name$/])
  ) {
    return profile.fullName;
  }

  if (
    fieldMatches(fieldName, [/email/, /e mail/]) &&
    !fieldMatches(fieldName, [/phone/, /number/])
  ) {
    return profile.emails[0] ?? null;
  }

  if (
    fieldMatches(fieldName, [
      /cellular/,
      /cell phone/,
      /mobile/,
      /home telephone/,
      /phone number$/,
    ]) &&
    fieldMatches(fieldName, [/phone/, /telephone/, /cellular/])
  ) {
    return profile.phones[0] ?? null;
  }

  if (
    fieldMatches(fieldName, [/street/, /mailing address/, /address andor/]) &&
    !fieldMatches(fieldName, [/school/, /citystate/])
  ) {
    return profile.address;
  }

  if (fieldMatches(fieldName, [/^city$/, /^city 2$/, /^city 3$/])) {
    return profile.city;
  }

  if (fieldMatches(fieldName, [/^state$/, /^state 2$/, /^state 3$/])) {
    return profile.state;
  }

  if (fieldMatches(fieldName, [/^zip$/, /^zip 2$/, /^zip 3$/])) {
    return profile.zip;
  }

  if (fieldMatches(fieldName, [/^employer$/, /^company name$/])) {
    return profile.organization;
  }

  if (fieldMatches(fieldName, [/position applying/, /^job title 1$/])) {
    return profile.jobTitle;
  }

  if (fieldMatches(fieldName, [/^school nameschool$/])) {
    return profile.schools[0]?.name ?? null;
  }

  if (fieldMatches(fieldName, [/^degreeschool$/])) {
    return profile.schools[0]?.degree ?? null;
  }

  if (fieldMatches(fieldName, [/^addresscitystateschool$/])) {
    const school = profile.schools[0];
    if (!school) return null;
    return [school.name, school.dates].filter(Boolean).join(' · ');
  }

  if (fieldMatches(fieldName, [/^school nameschool 2$/])) {
    return profile.schools[1]?.name ?? null;
  }

  if (fieldMatches(fieldName, [/^degreeschool 2$/])) {
    return profile.schools[1]?.degree ?? null;
  }

  if (
    fieldMatches(fieldName, [/special skills/, /leadership organization/, /^skills$/])
  ) {
    return profile.skills;
  }

  if (
    fieldMatches(fieldName, [/^desired role$/, /desired position/, /^role$/])
  ) {
    return profile.desiredRole ?? profile.jobTitle;
  }

  if (
    fieldMatches(fieldName, [/professional summary/, /^summary$/, /^profile$/, /^objective$/])
  ) {
    return profile.summary;
  }

  if (fieldMatches(fieldName, [/years.*experience/, /experience.*years/])) {
    return profile.yearsExperience;
  }

  if (fieldMatches(fieldName, [/portfolio/, /^website$/, /^url$/])) {
    return profile.portfolioUrl;
  }

  if (fieldMatches(fieldName, [/^email$/])) {
    return profile.emails[0] ?? null;
  }

  if (fieldMatches(fieldName, [/^phone$/])) {
    return profile.phones[0] ?? null;
  }

  if (fieldMatches(fieldName, [/^address$/])) {
    return profile.address;
  }

  if (fieldMatches(fieldName, [/^organization$/])) {
    return profile.organization;
  }

  if (fieldMatches(fieldName, [/^job_title$/, /^job title$/])) {
    return profile.jobTitle;
  }

  return null;
}

export function mapJsonFormValuesFromContent(
  fields: Array<{ id: string; label: string }>,
  content: string,
): Record<string, string> {
  const profile = parseResumeProfile(content);
  const values: Record<string, string> = {};

  for (const field of fields) {
    const pdfStyleValue = suggestPdfFieldValue(field.id, profile);
    if (pdfStyleValue) {
      values[field.id] = pdfStyleValue;
      continue;
    }

    const labelValue = suggestPdfFieldValue(field.label, profile);
    if (labelValue) {
      values[field.id] = labelValue;
    }
  }

  return values;
}
