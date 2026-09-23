import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { routing } from '@/i18n/routing';
import en from '@/locales/en/common.json';
import de from '@/locales/de/common.json';

type Json = Record<string, unknown>;

function leafKeys(obj: Json, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? leafKeys(v as Json, path)
      : [path];
  });
}

const BUNDLES: Record<string, Json> = { en, de };

describe('locale parity', () => {
  it('routing declares exactly the two shipped locales', () => {
    expect([...routing.locales]).toEqual(['en', 'de']);
  });

  it('the locale directories are the declared locales, no more and no fewer', () => {
    // A bundle nobody can select is dead weight in the image; a declared
    // locale without a bundle is a 404 on the first page load.
    const dirs = readdirSync(join(process.cwd(), 'locales'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '__tests__')
      .map((d) => d.name)
      .sort();
    expect(dirs).toEqual([...routing.locales].sort());
  });

  it('every declared locale has a message bundle', () => {
    for (const code of routing.locales) {
      expect(BUNDLES[code], `missing bundle for ${code}`).toBeDefined();
    }
  });

  const enKeys = new Set(leafKeys(en as Json));
  for (const [code, msgs] of Object.entries(BUNDLES)) {
    it(`${code} has identical key set to en`, () => {
      const keys = new Set(leafKeys(msgs));
      const missing = [...enKeys].filter((k) => !keys.has(k)).sort();
      const extra = [...keys].filter((k) => !enKeys.has(k)).sort();
      expect({ code, missing, extra }).toEqual({ code, missing: [], extra: [] });
    });
  }
});
