import type { Email } from "./types";

/**
 * Mailboxes whose listing shows only their own messages. A conversation
 * browsed in the trash is the trashed part of it, and the inbox half
 * stays in the inbox; a draft is listed as a draft, not as the thread it
 * answers.
 */
export const ROLES_LISTED_ALONE: ReadonlySet<string> = new Set(["trash", "junk", "drafts"]);

/**
 * Which messages of a listed conversation travel with its row.
 *
 * `sameMailbox` keeps only those in the browsed mailbox. `notOnlyIn`
 * keeps every message except those that sit in nothing but the named
 * mailboxes — an account's trash and junk — so a deleted reply does not
 * come back into an inbox conversation. An empty list keeps everything.
 */
export type SiblingPolicy =
  | { kind: "sameMailbox"; mailboxId: string }
  | { kind: "notOnlyIn"; mailboxIds: readonly string[] };

/**
 * The policy for a listing: what is browsed decides it. `browsed` is the
 * mailbox of a folder scope, or null for a search across folders;
 * `hidden` names the account's trash, junk and drafts, as far as they
 * are known.
 */
export function siblingPolicyFor(
  browsed: { id: string; role?: string } | null,
  hidden: { trashId?: string; junkId?: string; draftsId?: string },
): SiblingPolicy {
  if (browsed?.role && ROLES_LISTED_ALONE.has(browsed.role)) {
    return { kind: "sameMailbox", mailboxId: browsed.id };
  }
  return {
    kind: "notOnlyIn",
    mailboxIds: [hidden.trashId, hidden.junkId, hidden.draftsId].filter((id): id is string => Boolean(id)),
  };
}

/**
 * The messages of the listed conversations that are not rows themselves,
 * filtered by the policy, each once. Mailbox ids are compared as the
 * account states them, so this runs before any namespacing.
 */
export function siblingsOf(rows: Email[], threadEmails: Email[], policy: SiblingPolicy): Email[] {
  const rowIds = new Set(rows.map((e) => e.id));
  const seen = new Set<string>();
  const siblings: Email[] = [];
  for (const email of threadEmails) {
    if (rowIds.has(email.id) || seen.has(email.id)) continue;
    if (!allowed(email, policy)) continue;
    seen.add(email.id);
    siblings.push(email);
  }
  return siblings;
}

function allowed(email: Email, policy: SiblingPolicy): boolean {
  const mailboxIds = Object.keys(email.mailboxIds ?? {}).filter((id) => email.mailboxIds[id]);
  if (policy.kind === "sameMailbox") return mailboxIds.includes(policy.mailboxId);
  // An unsent draft is not part of the conversation. Carried into the
  // row it is the newest thing in it, so the conversation is dated by
  // when somebody last typed; shown in the thread it cannot be opened,
  // edited or deleted, because that is the composer's business; and
  // answered, it is a message of one's own with nobody to answer to.
  // The keyword is what a server marks it with; the mailbox is the same
  // answer for a server that does not.
  if (email.keywords?.$draft) return false;
  if (policy.mailboxIds.length === 0 || mailboxIds.length === 0) return true;
  return mailboxIds.some((id) => !policy.mailboxIds.includes(id));
}
