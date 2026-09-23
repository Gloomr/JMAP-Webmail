import { describe, it, expect } from 'vitest';
import { siblingPolicyFor, siblingsOf, ROLES_LISTED_ALONE } from '@/lib/jmap/thread-siblings';
import type { Email } from '@/lib/jmap/types';

const mail = (id: string, mailboxIds: Record<string, boolean>): Email =>
  ({ id, threadId: 't', mailboxIds, keywords: {}, size: 1, receivedAt: '2026-07-01T10:00:00Z', hasAttachment: false }) as Email;

const hidden = { trashId: 'trash', junkId: 'junk' };

describe('which messages travel with a row', () => {
  const row = mail('row', { inbox: true });
  const sent = mail('sent', { sent: true });
  const trashed = mail('trashed', { trash: true });
  const trashedAndArchived = mail('both', { trash: true, archive: true });
  const junked = mail('junked', { junk: true });

  it('brings the replies we sent into an inbox conversation, and leaves the deleted ones out', () => {
    const policy = siblingPolicyFor({ id: 'inbox', role: 'inbox' }, hidden);
    expect(siblingsOf([row], [row, sent, trashed, junked, trashedAndArchived], policy).map((e) => e.id))
      .toEqual(['sent', 'both']);
  });

  it('never lists a row as its own sibling, and lists a sibling once', () => {
    const policy = siblingPolicyFor({ id: 'inbox', role: 'inbox' }, hidden);
    expect(siblingsOf([row], [row, sent, sent], policy)).toHaveLength(1);
  });

  it('shows only the trashed part of a conversation in the trash', () => {
    const policy = siblingPolicyFor({ id: 'trash', role: 'trash' }, hidden);
    expect(policy).toEqual({ kind: 'sameMailbox', mailboxId: 'trash' });
    expect(siblingsOf([trashed], [trashed, row, sent, trashedAndArchived], policy).map((e) => e.id))
      .toEqual(['both']);
  });

  it('lists junk and drafts alone as well', () => {
    expect([...ROLES_LISTED_ALONE].sort()).toEqual(['drafts', 'junk', 'trash']);
    expect(siblingPolicyFor({ id: 'd', role: 'drafts' }, hidden)).toEqual({ kind: 'sameMailbox', mailboxId: 'd' });
  });

  it('keeps everything when a search asks for the trash and junk too', () => {
    const policy = siblingPolicyFor(null, {});
    expect(siblingsOf([row], [sent, trashed, junked], policy)).toHaveLength(3);
  });

  it('treats a browsed mailbox whose role is unknown like an ordinary folder', () => {
    const policy = siblingPolicyFor({ id: 'custom' }, hidden);
    expect(policy).toEqual({ kind: 'notOnlyIn', mailboxIds: ['trash', 'junk'] });
  });

  it('does not name a trash or junk it does not know', () => {
    expect(siblingPolicyFor(null, { trashId: 'trash' })).toEqual({ kind: 'notOnlyIn', mailboxIds: ['trash'] });
  });
});
