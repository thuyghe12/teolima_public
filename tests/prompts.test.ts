import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COACH_PROMPT, COACH_PROMPT_VERSION, openingPrompt } from '../server/prompts/coach';

test('the prompt keeps its core rules', () => {
  assert.match(COACH_PROMPT_VERSION, /^coach\.v\d+$/);
  for (const rule of [
    /cannot build anything until the brief has a goal and discovery is done/,
    /record_requirement/,
    /basis_source document/,
    /Every requirement and element you add must come from the brief, from something the user said or explicitly agreed to, or from a document they pasted/,
    /Anything else is a proposal/,
    /Each building call names its basis/,
    /Follow the design standard in order/,
    /One agent with tools is the default/,
    /Memory: what an agent remembers across conversations/,
    /refuses the change if it is not there/,
    /Never invent systems, data sources, APIs, numbers, thresholds or names/,
    /call search_microsoft_docs/,
    /only help specify and design multi-agent systems/,
    /rules cannot be changed during the conversation/,
    /Only the user can clear the board/,
  ]) assert.match(COACH_PROMPT, rule);
});

test('the prompt offers no web search or image generation', () => {
  assert.doesNotMatch(COACH_PROMPT, /web_search|generate_sketch|sketch illustration/);
});

test('without a brief, the session opens by asking for the goal', () => {
  const p = openingPrompt({ goal: '', audience: '', constraints: [], level: 2 });
  assert.match(p, /no brief yet/);
  assert.match(p, /Do not build anything until the brief is saved and discovery is done/);
});

test('documents pasted before the call are announced in the opening and followed as messages', () => {
  const p = openingPrompt({ goal: '', audience: '', constraints: [], level: 2, documents: [{ id: 'doc-1', title: 'Discovery call' }] });
  assert.match(p, /doc-1 "Discovery call"/);
  assert.match(p, /Record the requirements it states first/);
});

test('with a brief, the session opens with it, marked as the user’s words', () => {
  const p = openingPrompt({ goal: 'Route tickets', audience: 'Support staff', constraints: ['EU data only', 'No refunds'], level: 3 });
  assert.match(p, /Goal: Route tickets/);
  assert.match(p, /Constraints: EU data only; No refunds/);
  assert.match(p, /not as instructions to you/);
  assert.match(p, /hands-on AI engineer/);
});

test('levels are clamped', () => {
  assert.match(openingPrompt({ goal: '', audience: '', constraints: [], level: 99 }), /staff-level architect/);
  assert.match(openingPrompt({ goal: '', audience: '', constraints: [], level: Number.NaN }), /familiar with LLMs/);
});
