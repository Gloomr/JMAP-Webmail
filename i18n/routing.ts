import { defineRouting } from 'next-intl/routing';

// The two languages GLOOMR's operators work in. A locale listed here has
// a bundle under `locales/<code>/common.json`; the parity tests hold the
// two sets equal.
export const routing = defineRouting({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  localePrefix: 'never'
});

export const locales = routing.locales;
export const defaultLocale = routing.defaultLocale;
export type Locale = (typeof locales)[number];
