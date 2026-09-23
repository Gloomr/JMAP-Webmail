/**
 * Tells a request that never reached a working server from one a server
 * answered.
 *
 * The browser's `fetch` rejects a network failure with a TypeError whose
 * message differs per engine — Chrome says "Failed to fetch", Firefox
 * "NetworkError when attempting to fetch resource", Safari "Load failed".
 * A gateway that is up while the service behind it is down answers 502,
 * 503 or 504, which the client wraps as `Request failed: <status>`.
 * Both mean the same thing to the person sending: nothing happened, and
 * trying again in a moment is the right move. Every other error is a
 * server's own answer and is reported as what it says.
 */
const NETWORK_FAILURE = /Failed to fetch|NetworkError|Load failed/;
const UNREACHABLE_ANSWER = /^(Request failed|Failed to get session): 50[234]\b/;

export function isServerUnreachable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return NETWORK_FAILURE.test(err.message) || UNREACHABLE_ANSWER.test(err.message);
}
