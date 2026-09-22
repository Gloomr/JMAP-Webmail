import { describe, it, expect } from 'vitest';
import { creationId, isPortableCreationId } from '../creation-id';

// Measured against Stalwart 0.16.23: Email/copy drops an entry whose
// creation id carries a hyphen, an underscore, an uppercase letter or
// four or more digits, and reports neither `created` nor `notCreated`
// for it. `draft-${Date.now()}` is discarded on two of those counts.
describe('portable creation ids', () => {
  it('rejects the shapes a server drops in silence', () => {
    for (const id of ['draft-1790087429058', 'draft-x', 'a_b', 'A1', 'Draft1', '1234', 'draft1234']) {
      expect(isPortableCreationId(id), id).toBe(false);
    }
  });

  it('accepts the shapes that came back created', () => {
    for (const id of ['p', 'probe', 'draftx', 'draft1', 'draft12', 'draft123', 'abcdefghijklmnopqr', 'copyabcdefgh']) {
      expect(isPortableCreationId(id), id).toBe(true);
    }
  });

  it('generates only ids of that kind', () => {
    for (let i = 0; i < 200; i++) {
      const id = creationId('draft');
      expect(isPortableCreationId(id), id).toBe(true);
      expect(id.startsWith('draft')).toBe(true);
    }
  });

  it('does not repeat itself across a request', () => {
    const seen = new Set(Array.from({ length: 200 }, () => creationId()));
    expect(seen.size).toBe(200);
  });
});
