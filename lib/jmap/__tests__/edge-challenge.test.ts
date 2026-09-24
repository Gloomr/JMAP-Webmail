import { describe, expect, it, vi } from 'vitest';
import { announceEdgeChallenge, EDGE_CHALLENGE_EVENT, isEdgeChallenge } from '../edge-challenge';

describe('edge challenge', () => {
  it('recognises the edge asking for a challenge', () => {
    expect(isEdgeChallenge(new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } }))).toBe(true);
  });

  it('leaves a server refusal alone', () => {
    expect(isEdgeChallenge(new Response('', { status: 403 }))).toBe(false);
  });

  it('announces the challenge on the window', () => {
    const seen = vi.fn();
    window.addEventListener(EDGE_CHALLENGE_EVENT, seen);
    announceEdgeChallenge();
    window.removeEventListener(EDGE_CHALLENGE_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
