import { describe, expect, it } from 'vitest';
import {
  documentToText,
  parseDocument,
  readDocument,
  textToDocument,
  writeDocument,
  type RichBlock,
} from '@/lib/letter-document';

/** Builds an editor's DOM from markup, the way the browser leaves it. */
function editor(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

describe('reading the editor', () => {
  it('keeps the blocks the document can hold', () => {
    const blocks = readDocument(
      editor('<h1>Eins</h1><h2>Zwei</h2><h3>Drei</h3><p>Prosa</p><blockquote>Zitat</blockquote><hr>'),
    );
    expect(blocks.map((b) => b.t)).toEqual(['h1', 'h2', 'h3', 'p', 'quote', 'hr']);
  });

  it('gives an element it does not know the shape of a paragraph', () => {
    // A div is what a browser leaves behind on Enter in several
    // engines. Dropping it would drop what somebody typed.
    const blocks = readDocument(editor('<div>Getippt</div>'));
    expect(blocks).toEqual([{ t: 'p', c: [{ t: 'text', v: 'Getippt' }] }]);
  });

  it('keeps the words of markup it cannot represent, and none of its structure', () => {
    const blocks = readDocument(
      editor('<p>vor <span style="color:red"><font size="7">mitte</font></span> nach</p>'),
    );
    expect(blocks).toEqual([{ t: 'p', c: [{ t: 'text', v: 'vor mitte nach' }] }]);
  });

  it('joins the text nodes a browser splits while typing', () => {
    const root = editor('<p></p>');
    const p = root.firstElementChild as HTMLElement;
    p.append(document.createTextNode('Hal'), document.createTextNode('lo'));
    expect(readDocument(root)).toEqual([{ t: 'p', c: [{ t: 'text', v: 'Hallo' }] }]);
  });

  it('keeps a link only where a reader could follow it', () => {
    const safe = readDocument(editor('<p><a href="https://gloomr.com">Seite</a></p>'));
    expect(safe).toEqual([
      { t: 'p', c: [{ t: 'a', href: 'https://gloomr.com', c: [{ t: 'text', v: 'Seite' }] }] },
    ]);

    // The words survive; the destination does not.
    const unsafe = readDocument(editor('<p><a href="javascript:alert(1)">Klick</a></p>'));
    expect(unsafe).toEqual([{ t: 'p', c: [{ t: 'text', v: 'Klick' }] }]);
  });

  it('drops the empty paragraphs a delete leaves behind', () => {
    const blocks = readDocument(editor('<p>Eins</p><p><br></p><p>   </p><p>Zwei</p>'));
    expect(blocks.map((b) => ('c' in b ? b.c : null))).toHaveLength(2);
  });

  it('reads a list as its items, without the empty ones', () => {
    const blocks = readDocument(editor('<ul><li>eins</li><li></li><li>zwei</li></ul>'));
    expect(blocks).toEqual([
      { t: 'ul', items: [[{ t: 'text', v: 'eins' }], [{ t: 'text', v: 'zwei' }]] },
    ]);
  });

  it('opens a list the browser left inside a paragraph', () => {
    // What Chrome produces for insertUnorderedList on a paragraph. Read
    // naively the paragraph is the block and the list is flattened to
    // its words: bullets on screen, a sentence on arrival.
    const blocks = readDocument(editor('<p><ul><li>eins</li><li>zwei</li></ul></p>'));
    expect(blocks).toEqual([
      { t: 'ul', items: [[{ t: 'text', v: 'eins' }], [{ t: 'text', v: 'zwei' }]] },
    ]);
  });

  it('keeps loose words around a nested block as paragraphs of their own', () => {
    const blocks = readDocument(editor('<p>vorher<ol><li>a</li></ol>nachher</p>'));
    expect(blocks.map((b) => b.t)).toEqual(['p', 'ol', 'p']);
  });

  it('drops a list with nothing in it rather than sending an empty one', () => {
    expect(readDocument(editor('<ol><li></li></ol>'))).toEqual([]);
  });

  it('reads nested marks in the order they nest', () => {
    const blocks = readDocument(editor('<p><b>fett <i>und kursiv</i></b></p>'));
    expect(blocks).toEqual([
      {
        t: 'p',
        c: [
          {
            t: 'b',
            c: [{ t: 'text', v: 'fett ' }, { t: 'i', c: [{ t: 'text', v: 'und kursiv' }] }],
          },
        ],
      },
    ]);
  });
});

describe('writing the editor', () => {
  it('survives a round trip through the DOM', () => {
    const original: RichBlock[] = [
      { t: 'h2', c: [{ t: 'text', v: 'Der Ablauf' }] },
      {
        t: 'p',
        c: [
          { t: 'text', v: 'Wir machen das in ' },
          { t: 'b', c: [{ t: 'text', v: 'drei Schritten' }] },
          { t: 'text', v: '.' },
        ],
      },
      { t: 'ol', items: [[{ t: 'text', v: 'eins' }], [{ t: 'text', v: 'zwei' }]] },
      { t: 'quote', c: [{ t: 'text', v: 'Alles Weitere im Angebot.' }] },
      { t: 'hr' },
    ];
    expect(readDocument(editor(writeDocument(original)))).toEqual(original);
  });

  it('escapes what somebody typed rather than rendering it', () => {
    const html = writeDocument([{ t: 'p', c: [{ t: 'text', v: '<script>alert(1)</script>' }] }]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('gives an empty document one paragraph to put the caret in', () => {
    expect(writeDocument([])).toBe('<p><br></p>');
  });
});

describe('the prose beside the document', () => {
  it('reads as a message rather than as dismantled markup', () => {
    const text = documentToText([
      { t: 'h2', c: [{ t: 'text', v: 'Der Ablauf' }] },
      { t: 'ul', items: [[{ t: 'text', v: 'eins' }]] },
      { t: 'quote', c: [{ t: 'text', v: 'Zitat' }] },
      { t: 'hr' },
    ]);
    expect(text).toBe('Der Ablauf\n\n- eins\n\n> Zitat\n\n---');
  });

  it('turns plain prose back into paragraphs on a blank line', () => {
    expect(textToDocument('Hallo Anna,\n\ndanke.')).toEqual([
      { t: 'p', c: [{ t: 'text', v: 'Hallo Anna,' }] },
      { t: 'p', c: [{ t: 'text', v: 'danke.' }] },
    ]);
  });
});

describe('reading a stored document', () => {
  it('accepts the shape the gateway also accepts', () => {
    const raw = '{"v":1,"signAs":"person","body":[{"t":"p","c":[{"t":"text","v":"x"}]}]}';
    expect(parseDocument(raw)).toEqual({
      v: 1,
      signAs: 'person',
      body: [{ t: 'p', c: [{ t: 'text', v: 'x' }] }],
    });
  });

  it('refuses anything else, so a bad part cannot become a letter', () => {
    for (const raw of ['', 'not json', '{}', '[]', '{"v":2,"body":[]}', '{"v":1}']) {
      expect(parseDocument(raw)).toBeNull();
    }
  });

  it('reads a structured quote, and an older string as text with no attribution', () => {
    const structured = parseDocument('{"v":1,"body":[],"signAs":"house","quoted":{"attribution":"On x wrote:","text":"hi"}}');
    expect(structured?.quoted).toEqual({ attribution: 'On x wrote:', text: 'hi' });
    const legacy = parseDocument('{"v":1,"body":[],"signAs":"house","quoted":"On x wrote:\\n> hi"}');
    expect(legacy?.quoted).toEqual({ attribution: '', text: 'On x wrote:\n> hi' });
    expect(parseDocument('{"v":1,"body":[],"signAs":"house","quoted":"   "}')?.quoted).toBeUndefined();
  });

  it('treats an unknown signature choice as the house, never as a person', () => {
    expect(parseDocument('{"v":1,"body":[],"signAs":"whoever"}')?.signAs).toBe('house');
  });
});
