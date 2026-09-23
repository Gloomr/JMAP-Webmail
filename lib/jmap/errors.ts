import { debug } from '@/lib/debug';

/**
 * Tells a request that never reached a working server from one a server
 * answered.
 *
 * The browser's `fetch` rejects a network failure with a TypeError whose
 * message differs per engine — Chrome says "Failed to fetch", Firefox
 * "NetworkError when attempting to fetch resource", Safari "Load failed".
 * A gateway that is up while the service behind it is down answers 502,
 * 503 or 504, which the client wraps as `Request failed: <status>`, or as
 * `Failed to upload file: <status>` on the upload path. Both mean the same
 * thing to the person sending: nothing happened, and trying again in a
 * moment is the right move. Every other error is a server's own answer
 * and is reported as what it says.
 */
const NETWORK_FAILURE = /Failed to fetch|NetworkError|Load failed/;
const UNREACHABLE_ANSWER = /^(Request failed|Failed to get session|Failed to upload file): 50[234]\b/;

export function isServerUnreachable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return NETWORK_FAILURE.test(err.message) || UNREACHABLE_ANSWER.test(err.message);
}

/**
 * Asks the server whether it is there at all.
 *
 * Some failures do not carry the status that caused them: a mailbox
 * lookup that met a 503 comes back empty, and the send then fails on
 * "no Sent mailbox" — true, and beside the point. When the error does not
 * say, one `Core/echo` does: it costs a round trip only on the failure
 * path, and it answers the one question the sender has.
 */
export async function serverAnswers(client: { ping(): Promise<void> }): Promise<boolean> {
  try {
    await client.ping();
    return true;
  } catch (err) {
    debug.error('The server did not answer a ping:', err);
    return false;
  }
}
