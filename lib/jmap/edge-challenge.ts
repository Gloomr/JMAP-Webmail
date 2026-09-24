/**
 * Recognises an answer from the edge rather than from the mail server.
 *
 * On GLOOMR's deployment the webmail sits behind a Cloudflare managed
 * challenge. A browser passes it once and then carries a clearance
 * cookie; when that cookie expires mid-session, the next JMAP call is
 * answered by Cloudflare with a challenge page instead of JSON, marked
 * `cf-mitigated: challenge`. A fetch cannot solve a challenge — only a
 * page load can — so the client announces it and the page reloads
 * (components/providers/edge-challenge-provider.tsx).
 *
 * Without such a deployment the header never appears and nothing here
 * runs.
 */
export const EDGE_CHALLENGE_EVENT = 'gloomr:edge-challenge';

/**
 * Whether the response is the edge asking for a challenge. A response
 * without headers — a stand-in some callers build — is not one.
 */
export function isEdgeChallenge(response: Partial<Pick<Response, 'headers'>>): boolean {
  return response.headers?.get?.('cf-mitigated') === 'challenge';
}

/** Tells the page a challenge is due. Safe to call outside a browser. */
export function announceEdgeChallenge(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EDGE_CHALLENGE_EVENT));
  }
}
