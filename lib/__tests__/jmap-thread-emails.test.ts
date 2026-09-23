import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestClient, mockFetch, mockFetchOnce } from './jmap-test-helpers';

/** The Email/get arguments of the second request a thread load makes. */
function emailGetArgs(spy: ReturnType<typeof mockFetch>): Record<string, unknown> {
  const [, init] = spy.mock.calls[1];
  const body = JSON.parse(String((init as Parameters<typeof fetch>[1])?.body));
  const [name, args] = body.methodCalls[0];
  expect(name).toBe('Email/get');
  return args;
}

describe('getThreadEmails', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the messages of a conversation whole, not as listing rows', async () => {
    const client = createTestClient();
    const spy = mockFetch({
      methodResponses: [
        ['Email/get', { list: [{ id: 'e1', mailboxIds: { 'mb-1': true }, receivedAt: '2026-07-01T00:00:00Z' }] }, '0'],
      ],
    });
    mockFetchOnce(spy, {
      methodResponses: [['Thread/get', { list: [{ id: 't1', emailIds: ['e1'] }] }, '0']],
    });

    await client.getThreadEmails('t1');

    const args = emailGetArgs(spy);
    // The conversation view renders these rows, so it needs the bodies;
    // a reply is opened from them, so it needs what it threads on.
    expect(args.properties).toEqual(
      expect.arrayContaining(['htmlBody', 'textBody', 'bodyValues', 'attachments', 'messageId', 'references']),
    );
    expect(args.fetchHTMLBodyValues).toBe(true);
    expect(args.fetchTextBodyValues).toBe(true);
  });

  it('turns the raw header list into the parsed fields the viewer reads', async () => {
    const client = createTestClient();
    const spy = mockFetch({
      methodResponses: [
        ['Email/get', {
          list: [{
            id: 'e1',
            mailboxIds: {},
            receivedAt: '2026-07-01T00:00:00Z',
            headers: [{ name: 'X-Spam-Status', value: 'Yes, score=7.2' }],
          }],
        }, '0'],
      ],
    });
    mockFetchOnce(spy, {
      methodResponses: [['Thread/get', { list: [{ id: 't1', emailIds: ['e1'] }] }, '0']],
    });

    const [email] = await client.getThreadEmails('t1');

    expect(Array.isArray(email.headers)).toBe(false);
    expect(email.spamScore).toBe(7.2);
  });
});
