/**
 * What a reply needs to know about the message it answers.
 *
 * Without it a reply is a new conversation to every mail system that
 * sees it — ours and the recipient's. Threading is built from
 * `In-Reply-To` and `References` (RFC 5322 §3.6.4), never from the
 * subject alone.
 */
export interface ReplyContext {
  /**
   * The original's Message-ID header, without angle brackets.
   *
   * Both shapes are accepted because both occur: RFC 8621 §4.1.1 defines
   * `messageId` as `String[]`, and this codebase's `Email` type declares
   * it a `string`. Normalising here keeps the discrepancy out of the
   * call sites.
   */
  messageId?: string | string[];
  /** The original's own References chain, oldest first. */
  references?: string[];
  /** The original's JMAP id, so it can be marked answered. */
  emailId?: string;
  /** The account the original lives in, which is not always the primary one. */
  accountId?: string;
}

/**
 * A References chain longer than this is trimmed. Some servers reject an
 * oversized header outright, and the middle is the part no client reads:
 * the first entry roots the conversation and the last few place the
 * reply within it.
 */
const MAX_REFERENCES = 32;

/**
 * Builds the two headers that make a reply a reply.
 *
 * @returns  An empty object when there is nothing to answer, so the
 *           caller can spread it into a draft unconditionally.
 */
export function buildReplyHeaders(
  context: ReplyContext | undefined,
): { inReplyTo?: string[]; references?: string[] } {
  const ids = context?.messageId;
  const parent = (Array.isArray(ids) ? ids[0] : ids)?.trim();
  if (!parent) return {};

  // The chain is the original's own, with the original appended — that
  // is what places the reply one step below it rather than beside it.
  const chain = [...(context?.references ?? []), parent];

  const seen = new Set<string>();
  const unique = chain.filter((id) => id && !seen.has(id) && seen.add(id));

  const references =
    unique.length <= MAX_REFERENCES
      ? unique
      : [unique[0], ...unique.slice(unique.length - (MAX_REFERENCES - 1))];

  return { inReplyTo: [parent], references };
}
