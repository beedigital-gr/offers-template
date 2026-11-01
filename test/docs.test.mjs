import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
// ChatGPT refuses Project instructions over 8,000 characters; the margin keeps room for small edits.
const MAX_INSTRUCTION_CHARS = 7900;
const SEARCH = 'label:offers-new -label:offers-needs-you';

test('docs/PROJECT-INSTRUCTIONS.md fits a ChatGPT Project (≤ 7,900 characters)', () => {
  const chars = [...readFileSync(join(REPO, 'docs', 'PROJECT-INSTRUCTIONS.md'), 'utf8')].length;
  assert.ok(chars <= MAX_INSTRUCTION_CHARS, `${chars} characters, max ${MAX_INSTRUCTION_CHARS}`);
});

test('docs/INBOX-TASK.md: English and Greek prompts stay in step', () => {
  const doc = readFileSync(join(REPO, 'docs', 'INBOX-TASK.md'), 'utf8');
  const prompt = (heading) => {
    const at = doc.indexOf(heading);
    assert.ok(at >= 0, `missing ${heading}`);
    const block = /```text\n([\s\S]*?)```/.exec(doc.slice(at));
    assert.ok(block, `no prompt block under ${heading}`);
    return block[1];
  };
  const en = prompt('## Prompt (English)');
  const el = prompt('## Prompt (Ελληνικά)');
  const steps = (text) => text.match(/^\d+\. /gm)?.length ?? 0;
  assert.ok(steps(en) > 0);
  assert.equal(steps(el), steps(en));
  for (const text of [en, el]) {
    for (const token of ['offers-new', 'offers-needs-you', '[LINK]', 'gmail-thread:', '<owner>/<repo>', 'Offers/needs-you']) {
      assert.ok(text.includes(token), `a prompt is missing ${token}`);
    }
    assert.match(text, new RegExp(`: ${SEARCH}\n`), 'a prompt has a different Gmail search');
  }
});

test('the Gmail search is the same in docs/PROJECT-INSTRUCTIONS.md §9; HOWTOs point at Offers/needs-you', () => {
  const instructions = readFileSync(join(REPO, 'docs', 'PROJECT-INSTRUCTIONS.md'), 'utf8');
  assert.ok(instructions.includes(`Gmail \`${SEARCH}\``), '§9 has a different Gmail search');
  assert.ok(!/is:unread/.test(instructions));
  for (const howto of ['HOWTO.el.md', 'HOWTO.en.md']) {
    assert.ok(readFileSync(join(REPO, 'docs', howto), 'utf8').includes('Offers/needs-you'), `${howto} does not mention Offers/needs-you`);
  }
});
