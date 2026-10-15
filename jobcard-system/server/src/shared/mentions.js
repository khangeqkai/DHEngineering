// The @mention rules both sides read (see CLAUDE.md "Shared rule files"), so the comment box
// and the route can never disagree.
//   - MAX_MENTIONS: most people one comment can @mention. The comment box stops the send
//     with TOO_MANY_MENTIONS_MESSAGE; the route's shape check refuses with the same words.
//   - MENTION_INACTIVE: the `code` on a refused comment that @mentions someone archived
//     meanwhile. The comment box re-reads the staff list on it, so that person drops off
//     the @ list.

const MAX_MENTIONS = 20;
const TOO_MANY_MENTIONS_MESSAGE = `A comment can ask at most ${MAX_MENTIONS} people.`;
const MENTION_INACTIVE = 'MENTION_INACTIVE';

module.exports = { MAX_MENTIONS, TOO_MANY_MENTIONS_MESSAGE, MENTION_INACTIVE };
