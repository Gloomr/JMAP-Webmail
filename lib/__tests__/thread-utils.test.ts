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
