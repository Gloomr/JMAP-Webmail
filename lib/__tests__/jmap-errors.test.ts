import { describe, it, expect } from 'vitest';
import { isServerUnreachable } from '@/lib/jmap/errors';
import { JMAPSetError } from '@/lib/jmap/client';

describe('isServerUnreachable', () => {
  it('recognises the browser’s own network failure, whatever the engine calls it', () => {
    expect(isServerUnreachable(new TypeError('Failed to fetch'))).toBe(true);
    expect(isServerUnreachable(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(isServerUnreachable(new TypeError('Load failed'))).toBe(true);
  });

  it('recognises an entrance whose service is down', () => {
    expect(isServerUnreachable(new Error('Request failed: 502 - Bad Gateway'))).toBe(true);
    expect(isServerUnreachable(new Error('Request failed: 503 - '))).toBe(true);
    expect(isServerUnreachable(new Error('Failed to get session: 504'))).toBe(true);
  });

  it('leaves a server’s own answer alone', () => {
    expect(isServerUnreachable(new Error('Request failed: 400 - bad request'))).toBe(false);
    expect(isServerUnreachable(new Error('Request failed: 401 - '))).toBe(false);
    expect(isServerUnreachable(new JMAPSetError('forbiddenFrom', 'not your address'))).toBe(false);
    expect(isServerUnreachable('Request failed: 503')).toBe(false);
    expect(isServerUnreachable(undefined)).toBe(false);
  });
});
