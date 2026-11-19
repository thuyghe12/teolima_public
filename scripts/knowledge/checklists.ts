/**
 * Writes shared/board/waf.ts: the Well-Architected design review checklists
 * (RE:01 to PE:12) from the guidance snapshot, small enough to ship to the
 * browser. tests/technical.test.ts fails when the two disagree; run
 * `npm run knowledge:checklists` after the snapshot is refreshed.
 */
import { readFileSync, writeFileSync } from 'node:fs';

type Item = { code: string; pillar: string; text: string; url: string };
const { checklist } = JSON.parse(readFileSync('data/knowledge/well-architected.json', 'utf8')) as { checklist: Item[] };
const title = (text: string) => (text.match(/^.+?\.(?=\s|$)/)?.[0] ?? text).trim();
const rows = checklist.map((i) => `  { code: ${JSON.stringify(i.code)}, pillar: ${JSON.stringify(i.pillar)}, title: ${JSON.stringify(title(i.text))}, url: ${JSON.stringify(i.url)} },`);
writeFileSync(
  'shared/board/waf.ts',
  `/**
 * The Well-Architected Framework design review checklists, one coded
 * recommendation per row, generated from the guidance snapshot by
 * scripts/knowledge/checklists.ts. Do not edit by hand.
 */
export type Pillar = 'reliability' | 'security' | 'cost-optimization' | 'operational-excellence' | 'performance-efficiency';
export interface Recommendation {
  code: string;
  pillar: Pillar;
  /** The recommendation's first sentence. */
  title: string;
  url: string;
}

export const PILLARS: Record<Pillar, string> = {
  reliability: 'Reliability',
  security: 'Security',
  'cost-optimization': 'Cost Optimization',
  'operational-excellence': 'Operational Excellence',
  'performance-efficiency': 'Performance Efficiency',
};

export const CHECKLIST: Recommendation[] = [
${rows.join('\n')}
];
`,
);
console.log(`Wrote ${checklist.length} recommendations`);
