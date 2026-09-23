import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { routing } from '@/i18n/routing';

const LOCALES_DIR = join(__dirname, '..');
const SORT_KEYS = ['by_date', 'by_sender', 'by_subject', 'by_size', 'ascending', 'descending'];

const localeDirs = readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '__tests__')
  .map((d) => d.name);

describe('sort namespace locale parity', () => {
  it('ships exactly the declared locales', () => {
    expect([...localeDirs].sort()).toEqual([...routing.locales].sort());
  });

  for (const locale of localeDirs) {
    it(`${locale} defines every sort.* key`, () => {
      const json = JSON.parse(
        readFileSync(join(LOCALES_DIR, locale, 'common.json'), 'utf-8'),
      );
      expect(json.sort, `${locale} is missing the "sort" namespace`).toBeDefined();
      for (const key of SORT_KEYS) {
        expect(json.sort[key], `${locale}.sort.${key} is empty/missing`).toBeTruthy();
      }
    });
  }
});
