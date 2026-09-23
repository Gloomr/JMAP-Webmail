import { describe, it, expect } from 'vitest';
import {
  groupEmailsByThread,
  sortThreadGroups,
  getThreadParticipants,
  mergeThreadEmails,
  getEmailColorTag,
  getThreadColorTag,
  conversationChanged,
  withThreadSiblings,
  siblingsFor,
  hasRealAttachment,
} from '../thread-utils';
import type { Email, ThreadGroup } from '../jmap/types';

const makeEmail = (overrides: Partial<Email> = {}): Email => ({
  id: 'email-1',
  threadId: 'thread-1',
  mailboxIds: { inbox: true },
  keywords: { $seen: true },
  size: 1000,
  receivedAt: '2024-01-15T10:00:00Z',
  from: [{ name: 'Alice', email: 'alice@example.com' }],
  subject: 'Test Subject',
  hasAttachment: false,
  ...overrides,
});

describe('withThreadSiblings', () => {
  const row = makeEmail({ id: 'row', threadId: 't1' });
  const reply = makeEmail({ id: 'reply', threadId: 't1', mailboxIds: { sent: true }, receivedAt: '2024-01-15T11:00:00Z' });
  const stray = makeEmail({ id: 'stray', threadId: 't2', mailboxIds: { sent: true } });

  it('puts the replies we sent under the row of their conversation', () => {
    const groups = groupEmailsByThread(withThreadSiblings([row], [reply]));
    expect(groups).toHaveLength(1);
    expect(groups[0].emailCount).toBe(2);
    // The reply is the newest, so it is what the row shows and sorts by.
    expect(groups[0].latestEmail.id).toBe('reply');
  });

  it('leaves out a sibling whose row is not listed, so a sent reply never becomes a row', () => {
    expect(siblingsFor([row], [reply, stray]).map((e) => e.id)).toEqual(['reply']);
    expect(groupEmailsByThread(withThreadSiblings([row], [stray]))).toHaveLength(1);
  });

  it('keeps a conversation apart from a same-named thread of another account', () => {
    const otherAccount = makeEmail({ id: 'reply-b', threadId: 't1', accountId: 'b' });
    expect(siblingsFor([row], [otherAccount])).toEqual([]);
  });

  it('hands the rows back untouched when there is nothing to add', () => {
    const rows = [row];
    expect(withThreadSiblings(rows, [])).toBe(rows);
    expect(withThreadSiblings(rows, [stray])).toBe(rows);
  });
});

describe('conversationChanged', () => {
  const a = makeEmail({ id: 'a' });
  const b = makeEmail({ id: 'b', receivedAt: '2024-01-15T11:00:00Z' });

  it('is quiet when the same messages come back with the same flags', () => {
    // A fresh fetch is a new array; what matters is whether the screen
    // would change, and here it would not.
    expect(conversationChanged([b, a], [{ ...b }, { ...a }])).toBe(false);
  });

  it('notices a message that arrived, and one that went', () => {
    const c = makeEmail({ id: 'c', receivedAt: '2024-01-15T12:00:00Z' });
    expect(conversationChanged([b, a], [c, b, a])).toBe(true);
    expect(conversationChanged([b, a], [a])).toBe(true);
  });

  it('notices a flag — the reply arrow is one', () => {
    const answered = { ...a, keywords: { $seen: true, $answered: true } };
    expect(conversationChanged([b, a], [b, answered])).toBe(true);
  });

  it('treats absent and empty keywords alike', () => {
    expect(conversationChanged([{ ...a, keywords: undefined as unknown as Record<string, boolean> }], [{ ...a, keywords: {} }])).toBe(false);
  });
});

describe('groupEmailsByThread', () => {
  it('groups emails by threadId', () => {
    const emails = [
      makeEmail({ id: 'e1', threadId: 'thread-1' }),
      makeEmail({ id: 'e2', threadId: 'thread-1' }),
      makeEmail({ id: 'e3', threadId: 'thread-2' }),
    ];
    const groups = groupEmailsByThread(emails);
    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.threadId === 'thread-1')!.emailCount).toBe(2);
    expect(groups.find(g => g.threadId === 'thread-2')!.emailCount).toBe(1);
  });

  it('sorts emails within group by receivedAt descending', () => {
    const emails = [
      makeEmail({ id: 'e1', threadId: 'thread-1', receivedAt: '2024-01-10T10:00:00Z' }),
      makeEmail({ id: 'e2', threadId: 'thread-1', receivedAt: '2024-01-15T10:00:00Z' }),
      makeEmail({ id: 'e3', threadId: 'thread-1', receivedAt: '2024-01-12T10:00:00Z' }),
    ];
    const group = groupEmailsByThread(emails)[0];
    expect(group.emails[0].id).toBe('e2');
    expect(group.emails[1].id).toBe('e3');
    expect(group.emails[2].id).toBe('e1');
  });

  it('sets latestEmail to the newest email', () => {
    const emails = [
      makeEmail({ id: 'old', threadId: 'thread-1', receivedAt: '2024-01-01T00:00:00Z' }),
      makeEmail({ id: 'new', threadId: 'thread-1', receivedAt: '2024-06-01T00:00:00Z' }),
    ];
    expect(groupEmailsByThread(emails)[0].latestEmail.id).toBe('new');
  });

  it('calculates participantNames from unique senders', () => {
    const emails = [
      makeEmail({ id: 'e1', from: [{ name: 'Alice', email: 'alice@example.com' }] }),
      makeEmail({ id: 'e2', from: [{ name: 'Bob', email: 'bob@example.com' }] }),
      makeEmail({ id: 'e3', from: [{ name: 'Alice', email: 'alice@example.com' }] }),
    ];
    const group = groupEmailsByThread(emails)[0];
    expect(group.participantNames).toEqual(['Alice', 'Bob']);
  });

  it('detects hasUnread when an email lacks $seen', () => {
    const emails = [
      makeEmail({ id: 'e1', keywords: { $seen: true } }),
      makeEmail({ id: 'e2', keywords: {} }),
    ];
    expect(groupEmailsByThread(emails)[0].hasUnread).toBe(true);
  });

  it('detects hasStarred when an email has $flagged', () => {
    const emails = [
      makeEmail({ id: 'e1', keywords: { $seen: true } }),
      makeEmail({ id: 'e2', keywords: { $seen: true, $flagged: true } }),
    ];
    expect(groupEmailsByThread(emails)[0].hasStarred).toBe(true);
  });

  it('detects hasAttachment', () => {
    const emails = [
      makeEmail({ id: 'e1', hasAttachment: false }),
      makeEmail({ id: 'e2', hasAttachment: true }),
    ];
    expect(groupEmailsByThread(emails)[0].hasAttachment).toBe(true);
  });

  it('keeps threads from different accounts separate when threadId strings collide', () => {
    const emails = [
      makeEmail({ id: 'e1', threadId: 'T1', receivedAt: '2024-01-16T10:00:00Z' }),
      makeEmail({ id: 'e2', threadId: 'T1', accountId: 'acc-b', receivedAt: '2024-01-15T10:00:00Z' }),
      makeEmail({ id: 'e3', threadId: 'T1', accountId: 'acc-b', receivedAt: '2024-01-14T10:00:00Z' }),
    ];
    const groups = groupEmailsByThread(emails);
    expect(groups).toHaveLength(2);

    const primaryGroup = groups.find(g => g.latestEmail.accountId === undefined)!;
    expect(primaryGroup.emailCount).toBe(1);
    expect(primaryGroup.emails.map(e => e.id)).toEqual(['e1']);

    const sharedGroup = groups.find(g => g.latestEmail.accountId === 'acc-b')!;
    expect(sharedGroup.emailCount).toBe(2);
    expect(sharedGroup.emails.map(e => e.id)).toEqual(['e2', 'e3']);
    expect(sharedGroup.threadId).toBe('T1');
  });

  it('returns empty array for empty input', () => {
    expect(groupEmailsByThread([])).toEqual([]);
  });

  it('returns empty array for null/undefined input', () => {
    expect(groupEmailsByThread(null as unknown as Email[])).toEqual([]);
    expect(groupEmailsByThread(undefined as unknown as Email[])).toEqual([]);
  });
});

describe('sortThreadGroups', () => {
  it('sorts groups by latestEmail.receivedAt descending', () => {
    const groups: ThreadGroup[] = [
      {
        threadId: 'old',
        emails: [makeEmail({ receivedAt: '2024-01-01T00:00:00Z' })],
        latestEmail: makeEmail({ receivedAt: '2024-01-01T00:00:00Z' }),
        participantNames: ['A'],
        hasUnread: false,
        hasStarred: false,
        hasAnswered: false,
        hasForwarded: false,
        hasAttachment: false,
        emailCount: 1,
        hasDraft: false,
      },
      {
        threadId: 'new',
        emails: [makeEmail({ receivedAt: '2024-06-01T00:00:00Z' })],
        latestEmail: makeEmail({ receivedAt: '2024-06-01T00:00:00Z' }),
        participantNames: ['B'],
        hasUnread: false,
        hasStarred: false,
        hasAnswered: false,
        hasForwarded: false,
        hasAttachment: false,
        emailCount: 1,
        hasDraft: false,
      },
    ];
    const sorted = sortThreadGroups(groups);
    expect(sorted[0].threadId).toBe('new');
    expect(sorted[1].threadId).toBe('old');
  });
});

describe('getThreadParticipants', () => {
  it('extracts unique sender names', () => {
    const emails = [
      makeEmail({ from: [{ name: 'Alice', email: 'alice@example.com' }] }),
      makeEmail({ from: [{ name: 'Bob', email: 'bob@example.com' }] }),
      makeEmail({ from: [{ name: 'Alice', email: 'alice@example.com' }] }),
    ];
    expect(getThreadParticipants(emails)).toEqual(['Alice', 'Bob']);
  });

  it('names the reader once, as themselves, however many times they wrote', () => {
    const self = { isSelf: (a: string) => a.endsWith('@gloomr.com'), selfLabel: 'me' };
    const emails = [
      makeEmail({ id: 'a', from: [{ name: 'Anna', email: 'anna@example.org' }], receivedAt: '2026-07-01T10:00:00Z' }),
      makeEmail({ id: 'b', from: [{ name: 'Kevin Collmer', email: 'kevin@gloomr.com' }], receivedAt: '2026-07-01T11:00:00Z' }),
      makeEmail({ id: 'c', from: [{ name: 'Kevin', email: 'info@gloomr.com' }], receivedAt: '2026-07-01T12:00:00Z' }),
    ];
    // Oldest first, so the row reads as who the conversation is with —
    // and both own addresses are the same "me".
    expect(getThreadParticipants(emails, 4, self)).toEqual(['Anna', 'me']);
  });

  it('names the reader as they signed when nothing says which addresses are theirs', () => {
    const emails = [makeEmail({ from: [{ name: 'Kevin Collmer', email: 'kevin@gloomr.com' }] })];
    expect(getThreadParticipants(emails)).toEqual(['Kevin Collmer']);
  });

  it('respects maxNames limit', () => {
    const emails = [
      makeEmail({ from: [{ name: 'A', email: 'a@x.com' }] }),
      makeEmail({ from: [{ name: 'B', email: 'b@x.com' }] }),
      makeEmail({ from: [{ name: 'C', email: 'c@x.com' }] }),
    ];
    expect(getThreadParticipants(emails, 2)).toEqual(['A', 'B']);
  });

  it('uses email prefix when name is empty', () => {
    const emails = [
      makeEmail({ from: [{ name: '', email: 'charlie@example.com' }] }),
    ];
    expect(getThreadParticipants(emails)).toEqual(['charlie']);
  });
});

describe('a draft in a thread', () => {
  const original = makeEmail({ id: 'orig', threadId: 't', receivedAt: '2024-01-15T10:00:00Z', from: [{ name: 'Anna', email: 'anna@example.org' }] });
  const reply = makeEmail({ id: 'reply', threadId: 't', receivedAt: '2024-01-15T11:00:00Z', from: [{ name: 'Kevin', email: 'kevin@gloomr.com' }] });
  const draft = makeEmail({
    id: 'draft', threadId: 't', receivedAt: '2024-01-15T12:00:00Z',
    keywords: { $draft: true, $seen: true }, hasAttachment: true,
    from: [{ name: 'Kevin', email: 'kevin@gloomr.com' }],
  });

  it('belongs to the thread but is not one of its messages', () => {
    const [group] = groupEmailsByThread([draft, reply, original]);
    // Listed, so it can be taken up from the row …
    expect(group.emails.map((e) => e.id)).toEqual(['draft', 'reply', 'orig']);
    expect(group.hasDraft).toBe(true);
    // … but not counted, not dating the conversation, not carrying its flags.
    expect(group.emailCount).toBe(2);
    expect(group.latestEmail.id).toBe('reply');
    expect(group.hasAttachment).toBe(false);
  });

  it('describes a thread of nothing but drafts by the drafts themselves', () => {
    // Which is what the Drafts folder lists.
    const [group] = groupEmailsByThread([draft]);
    expect(group.hasDraft).toBe(true);
    expect(group.emailCount).toBe(1);
    expect(group.latestEmail.id).toBe('draft');
  });

  it('says so when a merged thread has none', () => {
    const [group] = groupEmailsByThread([reply, original]);
    expect(group.hasDraft).toBe(false);
    expect(mergeThreadEmails(group, [draft]).hasDraft).toBe(true);
    expect(mergeThreadEmails(group, [draft]).emailCount).toBe(2);
  });
});

describe('what earns a paperclip', () => {
  const mark = { partId: '2', blobId: 'b', size: 9908, name: 'gloomr.png', type: 'image/png', cid: 'gloomr-mark', disposition: 'inline' };
  const pdf = { partId: '3', blobId: 'c', size: 1, name: 'offer.pdf', type: 'application/pdf', disposition: 'attachment' };

  it('not an image embedded in the body, whatever the server says', () => {
    // The server flags the letter's mark as an attachment; a paperclip
    // on every letter says nothing.
    expect(hasRealAttachment(makeEmail({ hasAttachment: true, attachments: [mark] }))).toBe(false);
  });

  it('a file somebody attached', () => {
    expect(hasRealAttachment(makeEmail({ hasAttachment: true, attachments: [mark, pdf] }))).toBe(true);
    // An image without a Content-ID is a file, not part of the body.
    expect(hasRealAttachment(makeEmail({ attachments: [{ ...mark, cid: undefined }] }))).toBe(true);
  });

  it('falls back to the server flag when the parts are not there', () => {
    expect(hasRealAttachment(makeEmail({ hasAttachment: true }))).toBe(true);
    expect(hasRealAttachment(makeEmail({ hasAttachment: false }))).toBe(false);
  });

  it('is what a thread row reads', () => {
    const [group] = groupEmailsByThread([makeEmail({ hasAttachment: true, attachments: [mark] })]);
    expect(group.hasAttachment).toBe(false);
  });
});

describe('thread flags for handled messages', () => {
  it('marks a thread answered when any message in it was replied to', () => {
    const [group] = groupEmailsByThread([
      makeEmail({ id: 'e1', threadId: 't', keywords: { $seen: true } }),
      makeEmail({ id: 'e2', threadId: 't', keywords: { $seen: true, $answered: true } }),
    ]);
    expect(group.hasAnswered).toBe(true);
    expect(group.hasForwarded).toBe(false);
  });

  it('leaves a thread nobody acted on unmarked', () => {
    const [group] = groupEmailsByThread([makeEmail({ id: 'e1', threadId: 't' })]);
    expect(group.hasAnswered).toBe(false);
    expect(group.hasForwarded).toBe(false);
  });

  it('marks a forwarded thread', () => {
    const [group] = groupEmailsByThread([
      makeEmail({ id: 'e1', threadId: 't', keywords: { $forwarded: true } }),
    ]);
    expect(group.hasForwarded).toBe(true);
  });
});

describe('mergeThreadEmails', () => {
  it('merges new emails without duplicating existing ones', () => {
    const existing: ThreadGroup = {
      threadId: 'thread-1',
      emails: [
        makeEmail({ id: 'e1', receivedAt: '2024-01-10T00:00:00Z' }),
        makeEmail({ id: 'e2', receivedAt: '2024-01-09T00:00:00Z' }),
      ],
      latestEmail: makeEmail({ id: 'e1', receivedAt: '2024-01-10T00:00:00Z' }),
      participantNames: ['Alice'],
      hasUnread: false,
      hasStarred: false,
      hasAnswered: false,
      hasForwarded: false,
      hasAttachment: false,
      emailCount: 2,
      hasDraft: false,
    };
    const fetched = [
      makeEmail({ id: 'e2', receivedAt: '2024-01-09T00:00:00Z' }),
      makeEmail({ id: 'e3', receivedAt: '2024-01-11T00:00:00Z', from: [{ name: 'Bob', email: 'bob@example.com' }] }),
    ];
    const merged = mergeThreadEmails(existing, fetched);
    expect(merged.emailCount).toBe(3);
    expect(merged.emails.map(e => e.id)).toEqual(['e3', 'e1', 'e2']);
  });

  it('updates thread metadata after merge', () => {
    const existing: ThreadGroup = {
      threadId: 'thread-1',
      emails: [makeEmail({ id: 'e1', keywords: { $seen: true }, hasAttachment: false })],
      latestEmail: makeEmail({ id: 'e1' }),
      participantNames: ['Alice'],
      hasUnread: false,
      hasStarred: false,
      hasAnswered: false,
      hasForwarded: false,
      hasAttachment: false,
      emailCount: 1,
      hasDraft: false,
    };
    const fetched = [
      makeEmail({
        id: 'e2',
        receivedAt: '2024-06-01T00:00:00Z',
        keywords: { $flagged: true },
        hasAttachment: true,
        from: [{ name: 'Bob', email: 'bob@example.com' }],
      }),
    ];
    const merged = mergeThreadEmails(existing, fetched);
    expect(merged.latestEmail.id).toBe('e2');
    expect(merged.hasUnread).toBe(true);
    expect(merged.hasStarred).toBe(true);
    expect(merged.hasAttachment).toBe(true);
    expect(merged.participantNames).toContain('Bob');
  });
});

describe('getEmailColorTag', () => {
  it('returns color from $color: keyword', () => {
    expect(getEmailColorTag({ '$color:red': true, $seen: true })).toBe('red');
  });

  it('returns null when no color keyword', () => {
    expect(getEmailColorTag({ $seen: true, $flagged: true })).toBeNull();
  });

  it('returns null for undefined keywords', () => {
    expect(getEmailColorTag(undefined)).toBeNull();
  });
});

describe('getThreadColorTag', () => {
  it('returns first color found across thread emails', () => {
    const emails = [
      makeEmail({ id: 'e1', keywords: { $seen: true } }),
      makeEmail({ id: 'e2', keywords: { '$color:blue': true } }),
    ];
    expect(getThreadColorTag(emails)).toBe('blue');
  });

  it('returns null when no emails have color tags', () => {
    const emails = [
      makeEmail({ id: 'e1', keywords: { $seen: true } }),
      makeEmail({ id: 'e2', keywords: { $flagged: true } }),
    ];
    expect(getThreadColorTag(emails)).toBeNull();
  });
});
