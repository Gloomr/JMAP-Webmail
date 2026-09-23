import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestClient, mockFetch } from './jmap-test-helpers';
import type { EmailQuery, EmailPage } from '@/lib/jmap/search-utils';

const folderTextQuery: EmailQuery = {
  text: 'invoice',
  scope: { kind: 'folder', mailboxId: 'mb-1' },
  sort: { by: 'receivedAt', ascending: false },
};
const firstPage: EmailPage = { limit: 50 };

function bodyOf(spy: ReturnType<typeof mockFetch>) {
  const init = spy.mock.calls[0][1] as { body?: string };
  return JSON.parse(init.body as string);
}

describe('JMAPClient.queryEmails', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for the conversations behind the rows in the same request, and hands their other messages back as siblings', async () => {
    const client = createTestClient();
    const spy = mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['e1'], total: 1, position: 0 }, '0'],
        ['Email/get', { list: [{ id: 'e1', threadId: 't1', mailboxIds: { 'mb-1': true } }] }, '1'],
        ['Thread/get', { list: [{ id: 't1', emailIds: ['e1', 'sent', 'gone'] }] }, '2'],
        ['Email/get', { list: [
          { id: 'e1', threadId: 't1', mailboxIds: { 'mb-1': true } },
          { id: 'sent', threadId: 't1', mailboxIds: { 'mb-sent': true } },
          { id: 'gone', threadId: 't1', mailboxIds: { 'mb-trash': true } },
        ] }, '3'],
        ['Mailbox/get', { list: [
          { id: 'mb-1', role: 'inbox' }, { id: 'mb-sent', role: 'sent' }, { id: 'mb-trash', role: 'trash' },
        ] }, '4'],
      ],
    });

    const result = await client.queryEmails({ ...folderTextQuery, text: undefined }, firstPage);

    const calls = bodyOf(spy).methodCalls;
    expect(calls.map((c: [string]) => c[0])).toEqual(['Email/query', 'Email/get', 'Thread/get', 'Email/get', 'Mailbox/get']);
    // One row per conversation, so the page and its total count conversations.
    expect(calls[0][1].collapseThreads).toBe(true);
    expect(calls[2][1]['#ids']).toEqual({ resultOf: '1', name: 'Email/get', path: '/list/*/threadId' });
    expect(calls[3][1]['#ids']).toEqual({ resultOf: '2', name: 'Thread/get', path: '/list/*/emailIds' });

    // The rows are the rows; the reply we sent rides along; what sits only
    // in the trash does not come back into the inbox.
    expect(result.emails.map((e) => e.id)).toEqual(['e1']);
    expect(result.siblings.map((e) => e.id)).toEqual(['sent']);
  });

  it('shows the rows alone when the conversation calls fail, rather than failing the listing', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['e1'], total: 1, position: 0 }, '0'],
        ['Email/get', { list: [{ id: 'e1', threadId: 't1' }] }, '1'],
        ['error', { type: 'unknownMethod' }, '2'],
        ['error', { type: 'invalidResultReference' }, '3'],
        ['Mailbox/get', { list: [] }, '4'],
      ],
    });

    const result = await client.queryEmails(folderTextQuery, firstPage);
    expect(result.emails.map((e) => e.id)).toEqual(['e1']);
    expect(result.siblings).toEqual([]);
  });

  it('turns a folder+text descriptor into the expected Email/query + back-referenced Email/get', async () => {
    const client = createTestClient();
    const spy = mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['e1', 'e2'], total: 5, position: 0 }, '0'],
        ['Email/get', { list: [{ id: 'e1' }, { id: 'e2' }] }, '1'],
      ],
    });

    const result = await client.queryEmails(folderTextQuery, firstPage);

    const calls = bodyOf(spy).methodCalls;
    expect(calls[0][0]).toBe('Email/query');
    const q = calls[0][1];
    expect(q.accountId).toBe('account-1');
    expect(q.limit).toBe(50);
    expect(q.calculateTotal).toBe(true);
    expect(q.sort).toEqual([{ property: 'receivedAt', isAscending: false }]);
    // scope + text land in the filter regardless of T1's exact nesting
    expect(JSON.stringify(q.filter)).toContain('"inMailbox":"mb-1"');
    expect(JSON.stringify(q.filter)).toContain('"text":"invoice"');
    // first page: no anchor continuation
    expect(q.anchor).toBeUndefined();
    expect(q.anchorOffset).toBeUndefined();

    expect(calls[1][0]).toBe('Email/get');
    expect(calls[1][1]['#ids']).toEqual({ resultOf: '0', name: 'Email/query', path: '/ids' });

    expect(result.emails.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(result.total).toBe(5);
    expect(result.position).toBe(0);
    // hasMore = position + ids.length < total => 0 + 2 < 5
    expect(result.hasMore).toBe(true);
  });

  it('reports hasMore=false once the loaded window reaches total', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['e1', 'e2'], total: 2, position: 0 }, '0'],
        ['Email/get', { list: [{ id: 'e1' }, { id: 'e2' }] }, '1'],
      ],
    });

    const result = await client.queryEmails(folderTextQuery, firstPage);
    expect(result.hasMore).toBe(false);
  });

  it('derives hasMore from a full page when the anchor query omits total', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/query', { ids: Array.from({ length: 50 }, (_, i) => `e${i}`), position: 50 }, '0'],
        ['Email/get', { list: [{ id: 'e0' }] }, '1'],
      ],
    });

    const anchorPage: EmailPage = { limit: 50, anchor: 'e49', anchorOffset: 1 };
    const result = await client.queryEmails(folderTextQuery, anchorPage);

    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(true);
  });

  it('reports hasMore=false on a short anchor page with total omitted', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [
        ['Email/query', { ids: ['e1', 'e2'], position: 50 }, '0'],
        ['Email/get', { list: [{ id: 'e1' }, { id: 'e2' }] }, '1'],
      ],
    });

    const anchorPage: EmailPage = { limit: 50, anchor: 'e49', anchorOffset: 1 };
    const result = await client.queryEmails(folderTextQuery, anchorPage);
    expect(result.hasMore).toBe(false);
  });

  it('throws on a method-level error response instead of blanking the list', async () => {
    const client = createTestClient();
    mockFetch({
      methodResponses: [['error', { type: 'unsupportedSort', description: 'bad sort' }, '0']],
    });

    await expect(client.queryEmails(folderTextQuery, firstPage)).rejects.toThrow('bad sort');
  });
});
