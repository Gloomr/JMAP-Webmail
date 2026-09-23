import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { locales as LOCALES } from '@/i18n/routing';
const SCOPE_KEYS = ['scope_everywhere', 'scope_this_folder', 'include_trash_junk'] as const;

function loadSearch(locale: string): Record<string, unknown> {
  const raw = readFileSync(join(process.cwd(), 'locales', locale, 'common.json'), 'utf8');
  const parsed = JSON.parse(raw) as { search?: Record<string, unknown> };
  return parsed.search ?? {};
}

describe('search scope i18n parity', () => {
  it('tracks the shipped locales', () => {
    expect([...LOCALES]).toEqual(['en', 'de']);
  });

  it.each(LOCALES)('locale %s defines every scope key as a non-empty string', (locale) => {
    const search = loadSearch(locale);
    for (const key of SCOPE_KEYS) {
      expect(typeof search[key], `${locale}.search.${key} must be a string`).toBe('string');
      expect((search[key] as string).trim().length, `${locale}.search.${key} must be non-empty`).toBeGreaterThan(0);
    }
  });
});
