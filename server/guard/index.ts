/**
 * The guard pipeline: checks on every hop between the user, the model, its
 * tools and the board, enforced in code rather than asked of the model.
 *
 * 1. Input     the brief, typed messages, pasted documents and finished
 *              speech turns are screened with Prompt Shields when it is
 *              configured.
 * 2. Pre-tool  every requirement and building change must name a basis that
 *              is found in the brief, the user's own words or a pasted
 *              document (provenance), then passes the
 *              typed change log; drawing calls pass the tool allowlist.
 * 3. Post-tool documentation results keep only Microsoft Learn links and are
 *              screened for embedded instructions before the model sees them.
 * 4. Output    the coach's transcribed speech is checked for repeating its
 *              own instructions; the board, the durable output, is fully
 *              gated by steps 2 and the change log.
 *
 * Every decision goes to the audit trail. When Prompt Shields is not
 * configured, screening is reported as off in the trail, never as passed.
 */
import type { Basis } from '../../shared/board/changes';
import type { Brief } from '../../shared/board/schema';
import { Audit, excerpt } from './audit';
import { checkBasis, DocumentStore, UserWords, type Verdict } from './provenance';
import type { Shield } from './prompt-shields';

export type Screen = 'passed' | 'flagged' | 'unscreened';

const LEARN_HOST = /(^|\.)learn\.microsoft\.com$/i;

/** Keeps links to Microsoft Learn and removes every other link. */
export function keepLearnLinks(text: string): { text: string; removed: number } {
  let removed = 0;
  const out = text.replace(/https?:\/\/[^\s)\]>"']+/gi, (url) => {
    try {
      if (LEARN_HOST.test(new URL(url).hostname)) return url;
    } catch {}
    removed++;
    return '[link removed]';
  });
  return { text: out, removed };
}

/** Runs of `n` words, for spotting the coach reciting its instructions. */
function shingles(text: string, n: number): Set<string> {
  const w = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

const LEAK_WORDS = 8;

export class Guard {
  readonly userWords = new UserWords();
  readonly documents = new DocumentStore();
  private readonly promptShingles: Set<string>;
  private spoken = '';

  constructor(
    readonly audit: Audit,
    private readonly shield: Shield | null,
    instructions: string,
  ) {
    this.promptShingles = shingles(instructions, LEAK_WORDS);
  }

  get screening(): boolean {
    return this.shield !== null;
  }

  /** 1. Screens text from the user. Fails open (unscreened) if the service is down, and says so. */
  async screenInput(text: string, where: 'brief' | 'typed' | 'speech'): Promise<Screen> {
    if (!text.trim()) return 'passed';
    if (!this.shield) return 'unscreened';
    try {
      const r = await this.shield({ userPrompt: text });
      if (r.userAttack) {
        this.audit.record({ kind: 'input_flagged', where, excerpt: excerpt(text), reason: `Prompt Shields flagged the ${where}` });
        return 'flagged';
      }
      return 'passed';
    } catch (err) {
      this.audit.record({ kind: 'input_unscreened', where, reason: err instanceof Error ? err.message : String(err) });
      return 'unscreened';
    }
  }

  /**
   * 1. A document the user pasted (transcript, RFP, notes): screened for
   * embedded instructions, then kept for provenance. Fails closed: a document
   * that cannot be screened is still kept but reported as unscreened.
   */
  async addDocument(title: string, text: string): Promise<{ ok: true; id: string; screen: Screen } | { ok: false; error: string }> {
    let screen: Screen = 'unscreened';
    if (this.shield) {
      try {
        const r = await this.shield({ userPrompt: '', documents: [text.slice(0, 10_000)] });
        if (r.documentAttacks.some(Boolean)) {
          this.audit.record({ kind: 'input_flagged', where: 'document', excerpt: excerpt(title), reason: 'Prompt Shields found instructions in the pasted document' });
          return { ok: false, error: 'The document contains instructions aimed at the assistant and was not added.' };
        }
        screen = 'passed';
      } catch (err) {
        this.audit.record({ kind: 'input_unscreened', where: 'document', reason: err instanceof Error ? err.message : String(err) });
      }
    }
    const id = this.documents.add(title, text);
    this.audit.record({ kind: 'document_added', id, excerpt: excerpt(title), reason: `screening ${screen}` });
    return { ok: true, id, screen };
  }

  /** 2. Provenance for a coach change. */
  checkChange(tool: string, basis: Basis | null, brief: Brief): Verdict {
    const verdict = checkBasis(basis, { brief, userWords: this.userWords.text(), documents: this.documents });
    if ('error' in verdict) this.audit.record({ kind: 'change_refused', tool, basis, reason: verdict.error });
    return verdict;
  }

  /** 3. Documentation results: Learn links only, then screened. Fails closed: withheld if it cannot be screened. */
  async screenDocuments(text: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
    const cleaned = keepLearnLinks(text);
    if (cleaned.removed) this.audit.record({ kind: 'docs_links_removed', count: cleaned.removed, reason: `${cleaned.removed} non-Learn links removed` });
    if (!this.shield) return { ok: true, text: cleaned.text };
    try {
      const r = await this.shield({ userPrompt: '', documents: [cleaned.text] });
      if (r.documentAttacks.some(Boolean)) {
        this.audit.record({ kind: 'docs_withheld', reason: 'Prompt Shields found instructions in the documentation result' });
        return { ok: false, error: 'The documentation result was withheld because it contained instructions. Answer without it, or search again.' };
      }
      return { ok: true, text: cleaned.text };
    } catch (err) {
      this.audit.record({ kind: 'docs_withheld', reason: `could not be screened: ${err instanceof Error ? err.message : String(err)}` });
      return { ok: false, error: 'The documentation result could not be checked, so it was withheld. Say you could not verify it.' };
    }
  }

  /**
   * 4. Spoken output, as transcribed fragments. Returns true once when the
   * coach starts reciting its instructions word for word.
   */
  checkOutput(fragment: string): boolean {
    this.spoken = `${this.spoken} ${fragment}`.slice(-2000);
    for (const s of shingles(this.spoken, LEAK_WORDS)) {
      if (this.promptShingles.has(s)) {
        this.audit.record({ kind: 'output_flagged', reason: 'The coach repeated its instructions', excerpt: excerpt(s) });
        this.spoken = '';
        return true;
      }
    }
    return false;
  }
}

export { Audit } from './audit';
export { promptShields } from './prompt-shields';
