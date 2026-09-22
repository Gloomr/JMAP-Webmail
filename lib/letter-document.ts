/**
 * The document a letter is written as, and how it maps to an editor.
 *
 * What leaves this client is not HTML. The mail gateway renders the
 * letter itself and accepts only this tree, so nothing the browser put
 * in the editor — a stray `<div>` from a keypress, a `<span style>` from
 * a paste, a `<font>` from somewhere older — can reach a recipient. The
 * serialiser below walks the editor's DOM and keeps what the tree can
 * express; everything else contributes its text and nothing more.
 *
 * That is the same allow-list the gateway checks against, written twice
 * on purpose: this side so the editor cannot produce something the
 * gateway would refuse, that side because a client is not a place to
 * enforce anything.
 */

/** Text and the marks that may sit on it. */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 's'; c: Inline[] }
  | { t: 'a'; href: string; c: Inline[] };

/**
 * A paragraph-level node.
 *
 * One member per kind, mirroring the schema the gateway checks against.
 * A member carrying several literals — `{ t: 'p' | 'h1'; c }` — says the
 * same thing and does not narrow here, so a branch that has already
 * excluded the lists still cannot see `c`.
 */
export type RichBlock =
  | { t: 'p'; c: Inline[] }
  | { t: 'h1'; c: Inline[] }
  | { t: 'h2'; c: Inline[] }
  | { t: 'h3'; c: Inline[] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'hr' };

/** The kinds that hold a single run of inline content. */
type ProseKind = 'p' | 'h1' | 'h2' | 'h3' | 'quote';

/** Whose name stands under the letter. */
export type SignAs = 'person' | 'house';

/** What the gateway is handed, and what a draft carries as a body part. */
export interface LetterDocument {
  v: 1;
  body: RichBlock[];
  signAs: SignAs;
}

/** The media type the document travels under, on the draft. */
export const LETTER_DOCUMENT_TYPE = 'application/vnd.gloomr.richtext+json';

/** The file name the document is attached as. */
export const LETTER_DOCUMENT_NAME = '.gloomr-body.json';

/** Where a link may point. Anything else is kept as its words alone. */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:)/i;

/** The block each editor element becomes. */
const BLOCK_OF: Record<string, RichBlock['t']> = {
  P: 'p',
  H1: 'h1',
  H2: 'h2',
  H3: 'h3',
  BLOCKQUOTE: 'quote',
  UL: 'ul',
  OL: 'ol',
  HR: 'hr',
};

/** The mark each inline element becomes. */
const MARK_OF: Record<string, 'b' | 'i' | 's'> = {
  B: 'b',
  STRONG: 'b',
  I: 'i',
  EM: 'i',
  S: 's',
  DEL: 's',
  STRIKE: 's',
};

/** Reads one run of child nodes as inline content. */
function readInline(parent: Node): Inline[] {
  const out: Inline[] = [];

  const push = (node: Inline) => {
    // Two runs of plain text side by side are one run. The browser
    // splits text nodes as somebody types, and a tree that mirrors
    // those splits changes shape with every keystroke.
    const last = out[out.length - 1];
    if (node.t === 'text' && last && last.t === 'text') last.v += node.v;
    else out.push(node);
  };

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const v = child.textContent ?? '';
      if (v) push({ t: 'text', v });
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as HTMLElement;
    if (el.tagName === 'BR') {
      push({ t: 'text', v: ' ' });
      continue;
    }

    const mark = MARK_OF[el.tagName];
    if (mark) {
      const inner = readInline(el);
      if (inner.length) out.push({ t: mark, c: inner });
      continue;
    }

    if (el.tagName === 'A') {
      const href = el.getAttribute('href') ?? '';
      const inner = readInline(el);
      if (!inner.length) continue;
      // A link nobody can follow keeps its words: dropping them would
      // take away text the sender typed.
      if (SAFE_HREF.test(href)) out.push({ t: 'a', href, c: inner });
      else for (const node of inner) push(node);
      continue;
    }

    // Anything else — a div the browser inserted, a span carrying a
    // pasted style — contributes its content and no structure of its own.
    for (const node of readInline(el)) push(node);
  }

  return out;
}

/** Whether a run holds anything a reader would see. */
function hasText(nodes: Inline[]): boolean {
  return nodes.some((n) => (n.t === 'text' ? n.v.trim().length > 0 : hasText(n.c)));
}

/**
 * Reads the editor's DOM as a document.
 *
 * @param root  The element the sender writes in.
 * @returns     The blocks, in order. Empty paragraphs are dropped: the
 *              browser leaves them behind on every delete, and they
 *              would arrive as gaps in the letter.
 */
export function readDocument(root: HTMLElement): RichBlock[] {
  const blocks: RichBlock[] = [];

  for (const child of Array.from(root.children)) {
    const el = child as HTMLElement;
    const kind = BLOCK_OF[el.tagName];

    if (kind === 'hr') {
      blocks.push({ t: 'hr' });
      continue;
    }

    if (kind === 'ul' || kind === 'ol') {
      const items = Array.from(el.children)
        .filter((li) => li.tagName === 'LI')
        .map((li) => readInline(li))
        .filter(hasText);
      if (items.length) blocks.push({ t: kind, items });
      continue;
    }

    const content = readInline(el);
    if (!hasText(content)) continue;
    // The three other kinds already continued above; an element the
    // table does not name — a div the browser left behind — is prose.
    const prose: ProseKind = kind ?? 'p';
    blocks.push({ t: prose, c: content });
  }

  return blocks;
}

/** Escapes text for the markup the editor is filled with. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Writes one run of inline nodes back to editor markup. */
function writeInline(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.t) {
        case 'text':
          return esc(node.v);
        case 'b':
          return `<b>${writeInline(node.c)}</b>`;
        case 'i':
          return `<i>${writeInline(node.c)}</i>`;
        case 's':
          return `<s>${writeInline(node.c)}</s>`;
        case 'a':
          return `<a href="${esc(node.href)}">${writeInline(node.c)}</a>`;
      }
    })
    .join('');
}

/**
 * Writes a document back as the markup the editor is filled with.
 *
 * Needed whenever a draft is reopened: what was stored is the tree, and
 * the editor has to start from it rather than from prose.
 *
 * @param blocks  The document.
 * @returns       Markup for the editor's `innerHTML`.
 */
export function writeDocument(blocks: RichBlock[]): string {
  if (!blocks.length) return '<p><br></p>';

  return blocks
    .map((block) => {
      if (block.t === 'hr') return '<hr>';
      if (block.t === 'ul' || block.t === 'ol') {
        const items = block.items.map((item) => `<li>${writeInline(item)}</li>`).join('');
        return `<${block.t}>${items}</${block.t}>`;
      }
      const tag = block.t === 'quote' ? 'blockquote' : block.t;
      return `<${tag}>${writeInline(block.c)}</${tag}>`;
    })
    .join('');
}

/**
 * The document as plain prose.
 *
 * The draft keeps a readable text body beside the tree, so a draft
 * opened in any other client is a message rather than a blank. What is
 * actually sent comes from the tree; this is only what a reader of the
 * draft sees.
 *
 * @param blocks  The document.
 */
export function documentToText(blocks: RichBlock[]): string {
  const inlineText = (nodes: Inline[]): string =>
    nodes.map((n) => (n.t === 'text' ? n.v : inlineText(n.c))).join('');

  return blocks
    .map((block) => {
      if (block.t === 'hr') return '---';
      if (block.t === 'ul' || block.t === 'ol') {
        return block.items
          .map((item, i) => `${block.t === 'ol' ? `${i + 1}.` : '-'} ${inlineText(item)}`)
          .join('\n');
      }
      if (block.t === 'quote') return `> ${inlineText(block.c)}`;
      return inlineText(block.c);
    })
    .join('\n\n');
}

/**
 * Reads plain prose as a document.
 *
 * The starting point for a reply or a forward, whose quoted text
 * arrives as a string. A blank line starts a paragraph, which is the
 * one piece of structure plain text agrees on.
 *
 * @param text  The prose.
 */
export function textToDocument(text: string): RichBlock[] {
  return text
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((value): RichBlock => ({ t: 'p', c: [{ t: 'text', v: value }] }));
}

/**
 * Reads a document out of a blob's bytes, or null when it is not one.
 *
 * @param raw  What the server returned for the attached part.
 */
export function parseDocument(raw: string): LetterDocument | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const doc = parsed as Partial<LetterDocument>;
    if (doc.v !== 1 || !Array.isArray(doc.body)) return null;
    return { v: 1, body: doc.body, signAs: doc.signAs === 'person' ? 'person' : 'house' };
  } catch {
    return null;
  }
}
