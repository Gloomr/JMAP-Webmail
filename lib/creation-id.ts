/**
 * Builds a JMAP creation id that every server accepts.
 *
 * RFC 8620 §1.2 allows `A-Z a-z 0-9 - _`, but acceptance is narrower in
 * practice, and the failure is silent rather than an error. Measured
 * against Stalwart 0.16.23, `Email/copy` returns neither `created` nor
 * `notCreated` for a creation id that carries a hyphen, an underscore,
 * an uppercase letter, or four or more digits — the entry is dropped
 * and the response says nothing about it. A timestamp-based id such as
 * `draft-1790087429058` is therefore discarded on both counts, and a
 * submission that names it fails with invalidResultReference.
 *
 * Lowercase letters alone are accepted at every length tested, so that
 * is what this produces.
 *
 * @param prefix  A short lowercase-letter label, for reading responses.
 * @returns       A lowercase-letter id, unique enough for one request.
 */
export function creationId(prefix = 'c'): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let suffix = '';
  for (let i = 0; i < 10; i++) {
    suffix += letters[Math.floor(Math.random() * letters.length)];
  }
  return `${prefix}${suffix}`;
}

/** Whether a creation id is one every tested server keeps. */
export function isPortableCreationId(id: string): boolean {
  return /^[a-z]+$/.test(id) || (/^[a-z0-9]+$/.test(id) && (id.match(/\d/g)?.length ?? 0) < 4);
}
