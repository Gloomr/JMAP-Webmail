import { describe, it, expect } from 'vitest';
import { buildReplyHeaders } from '../reply-context';

describe('reply headers', () => {
  it('answers nothing when there is nothing to answer', () => {
    expect(buildReplyHeaders(undefined)).toEqual({});
    expect(buildReplyHeaders({})).toEqual({});
    expect(buildReplyHeaders({ messageId: [] })).toEqual({});
    expect(buildReplyHeaders({ messageId: '  ' })).toEqual({});
  });

  it('takes the id whether the server sent one or a list', () => {
    expect(buildReplyHeaders({ messageId: 'a@h' })).toEqual({
      inReplyTo: ['a@h'],
      references: ['a@h'],
    });
    expect(buildReplyHeaders({ messageId: ['a@h', 'ignored@h'] })).toEqual({
      inReplyTo: ['a@h'],
      references: ['a@h'],
    });
  });

  it('puts the reply one step below the message it answers', () => {
    expect(
      buildReplyHeaders({ messageId: ['c@h'], references: ['a@h', 'b@h'] }),
    ).toEqual({
      inReplyTo: ['c@h'],
      references: ['a@h', 'b@h', 'c@h'],
    });
  });

  it('does not name the same message twice', () => {
    expect(
      buildReplyHeaders({ messageId: ['b@h'], references: ['a@h', 'b@h'] }).references,
    ).toEqual(['a@h', 'b@h']);
  });

  it('keeps the root and the recent end when the chain grows too long', () => {
    const references = Array.from({ length: 80 }, (_, i) => `r${i}@h`);
    const { references: out } = buildReplyHeaders({ messageId: ['last@h'], references });

    expect(out).toHaveLength(32);
    // The first entry roots the conversation; the last is what this
    // reply answers. The middle is what no client reads.
    expect(out?.[0]).toBe('r0@h');
    expect(out?.[out.length - 1]).toBe('last@h');
  });
});
