'use client';

/**
 * Writing inside the letter that will arrive.
 *
 * The frame — wordmark, headline, signature card, footer — comes from
 * the mail gateway as the bytes it will send, and is dropped into this
 * page as it is. One cell in it is left empty, and that is the only
 * thing anybody can type in. Everything around it is a picture of the
 * outcome: unchangeable, and right by construction rather than by
 * having been copied carefully.
 *
 * No iframe. The gateway hangs every rule of that markup under one
 * class, so the letter cannot restyle the application and the
 * application cannot reach into the letter — which leaves the writing
 * area an ordinary element in the ordinary document, where selection,
 * focus and the browser's own editing behaviour work the way they do
 * everywhere else.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { debug } from '@/lib/debug';
import {
  readDocument,
  writeDocument,
  type LetterDocument,
  type RichBlock,
  type SignAs,
} from '@/lib/letter-document';

/** What the gateway answers a frame request with. */
interface Chrome {
  html: string;
  slotId: string;
  bodyCss: string;
}

interface LetterheadEditorProps {
  /** The account the identity belongs to — the group's, on a send-as. */
  accountId: string;
  identityId: string;
  subject: string;
  /** The first recipient, for the footer's line. */
  recipient?: string;
  document: LetterDocument;
  onChange: (document: LetterDocument) => void;
  /** Issues a request under the signed-in user's own credentials. */
  fetcher: (input: string, init?: Parameters<typeof fetch>[1]) => Promise<Response>;
  placeholder?: string;
  /** What the link button is called. */
  linkLabel?: string;
  /** What the link prompt asks. */
  linkPrompt?: string;
  /** Shown when the letter cannot be drawn, above the writing area. */
  unavailableNote?: string;
  className?: string;
}

/** How long typing settles before the document is read out of the DOM. */
const SETTLE_MS = 250;

/**
 * What the toolbar offers, which is exactly what the document can hold.
 *
 * Derived from the schema rather than chosen: a button for something
 * the tree cannot express would apply, look right, and be dropped on
 * the next read — so the way to keep the two in step is to have no such
 * button. A colour picker, a font size, a table: none of them are here
 * because none of them survive to a recipient.
 */
const TOOLS = [
  { key: 'p', label: 'Text', command: 'formatBlock', argument: 'p' },
  { key: 'h1', label: 'H1', command: 'formatBlock', argument: 'h1' },
  { key: 'h2', label: 'H2', command: 'formatBlock', argument: 'h2' },
  { key: 'h3', label: 'H3', command: 'formatBlock', argument: 'h3' },
  { key: 'b', label: 'B', command: 'bold', weight: 700 },
  { key: 'i', label: 'I', command: 'italic', italic: true },
  { key: 's', label: 'S', command: 'strikeThrough', strike: true },
  { key: 'ul', label: '• Liste', command: 'insertUnorderedList' },
  { key: 'ol', label: '1. Liste', command: 'insertOrderedList' },
  { key: 'quote', label: 'Zitat', command: 'formatBlock', argument: 'blockquote' },
  { key: 'hr', label: '—', command: 'insertHorizontalRule' },
] as const;

/**
 * The letter, with one writable cell in it.
 *
 * @param props.document  The current document; its `signAs` decides
 *                        whose name the frame shows, so changing it
 *                        re-fetches the frame.
 * @param props.onChange  Called with the document after typing settles,
 *                        and immediately when a format is applied.
 */
export function LetterheadEditor({
  accountId,
  identityId,
  subject,
  recipient,
  document: doc,
  onChange,
  fetcher,
  placeholder,
  linkLabel,
  linkPrompt,
  unavailableNote,
  className,
}: LetterheadEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [chrome, setChrome] = useState<Chrome | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [failed, setFailed] = useState(false);

  // Read through a ref rather than listed as a dependency. The composer
  // passes an inline function, which is a new function on every render
  // — and every keystroke renders. With it in the effect's dependencies
  // the frame was fetched again after each pause in typing, its markup
  // replaced the slot, the editor was mounted afresh into the new slot,
  // and what had been typed was gone. Measured: two frame requests and a
  // different, empty editor element 1.5 s after typing one word.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // The document as the editor last wrote it. Compared before filling
  // the editor again, so a re-render caused by our own onChange does
  // not replace the DOM the caret sits in.
  const ownRef = useRef<string>('');

  const emit = useCallback(
    (signAs: SignAs = doc.signAs) => {
      const root = editorRef.current;
      if (!root) return;
      const body: RichBlock[] = readDocument(root);
      const next: LetterDocument = { v: 1, body, signAs };
      ownRef.current = JSON.stringify(body);
      onChange(next);
    },
    [doc.signAs, onChange],
  );

  // The frame. Re-fetched when anything it displays changes — the
  // headline is the subject, the footer names the recipient, and the
  // signature card follows `signAs`.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetcherRef.current('/render/chrome', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              accountId,
              identityId,
              subject,
              recipient: recipient ?? null,
              document: { v: 1, body: [], signAs: doc.signAs },
            }),
          });
          if (!res.ok) throw new Error(`frame request answered ${res.status}`);
          const next = (await res.json()) as Chrome;
          if (!cancelled) {
            setChrome(next);
            setFailed(false);
          }
        } catch (err) {
          debug.error('Could not load the letterhead frame:', err);
          if (!cancelled) setFailed(true);
        }
      })();
    }, SETTLE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accountId, identityId, subject, recipient, doc.signAs]);

  // Put the frame in the page and find the cell to write in.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !chrome) return;
    host.innerHTML = chrome.html;
    // The element the editor lived in is gone with the old markup, so the
    // editor mounted into the new one starts empty. Forgetting what was
    // last written is what lets the fill effect write the document into
    // it again instead of judging it already there.
    ownRef.current = '';
    const next = host.querySelector<HTMLElement>(`#${CSS.escape(chrome.slotId)}`);
    setSlot(next);
    // The letter's head — wordmark, headline — stands above the writing
    // area, and a dialog shows the top first. Bring the pen to the paper.
    next?.scrollIntoView({ block: 'center' });
  }, [chrome]);

  // Fill the editor from the document, but never while the person is
  // inside it: replacing the markup would take the caret with it.
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    if (JSON.stringify(doc.body) === ownRef.current) return;
    if (root.contains(window.document.activeElement)) return;
    root.innerHTML = writeDocument(doc.body);
    ownRef.current = JSON.stringify(doc.body);
  }, [doc.body, slot]);

  /**
   * Applies one format to the selection.
   *
   * `execCommand` is deprecated and still the only way to edit in place
   * without an editing framework. A framework is a heavier answer than
   * this document deserves — eleven commands against a tree of eight
   * node kinds — and every package added here is paid for again at each
   * rebase onto an upstream that ships several releases a week.
   */
  const apply = useCallback(
    (command: string, argument?: string) => {
      const root = editorRef.current;
      if (!root) return;
      root.focus();
      if (command === 'createLink') {
        const href = window.prompt(linkPrompt ?? 'https://');
        if (!href) return;
        window.document.execCommand('createLink', false, href);
      } else {
        window.document.execCommand(command, false, argument);
      }
      emit();
    },
    [emit, linkPrompt],
  );

  /**
   * The writing area.
   *
   * Rendered whether or not the frame arrived. A gateway that cannot be
   * reached costs the picture of the letter, not the ability to write
   * one — the letterhead is applied when the message is sent, from the
   * prose, so a composer that refused to open would be withholding
   * something it does not need.
   */
  const editable = (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder}
      data-placeholder={placeholder}
      style={{ outline: 'none', minHeight: '120px' }}
      onInput={() => emit()}
      onBlur={() => emit()}
      onPaste={(event) => {
        // Plain text only. What a browser puts on the clipboard is
        // another document's markup, and the tree has no room for it —
        // pasting it would look right for a moment and then be thrown
        // away on the next read.
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        window.document.execCommand('insertText', false, text);
      }}
    />
  );

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        {TOOLS.map((tool) => (
          <button
            key={tool.key}
            type="button"
            // The selection is lost the moment a button takes focus,
            // and a command with no selection does nothing.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply(tool.command, 'argument' in tool ? tool.argument : undefined)}
            className="rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            style={{
              fontWeight: 'weight' in tool ? tool.weight : undefined,
              fontStyle: 'italic' in tool ? 'italic' : undefined,
              textDecoration: 'strike' in tool ? 'line-through' : undefined,
            }}
          >
            {tool.label}
          </button>
        ))}
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => apply('createLink')}
          className="rounded px-2 py-1 text-xs text-muted-foreground underline transition-colors hover:bg-muted hover:text-foreground"
        >
          {linkLabel ?? 'Link'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
      {failed && unavailableNote && (
        // Said plainly rather than hidden: the letter still goes out in
        // the letterhead, but what is on screen is no longer a picture
        // of it, and somebody proof-reading deserves to know which.
        <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          {unavailableNote}
        </p>
      )}
      {chrome && <style>{chrome.bodyCss}</style>}
      <div ref={hostRef} />
      {slot ? createPortal(editable, slot) : <div className="px-4 py-3">{editable}</div>}
      </div>
    </div>
  );
}
