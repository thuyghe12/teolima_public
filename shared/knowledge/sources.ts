/**
 * The Microsoft Learn doc sets Teolima's guidance snapshot is built from.
 *
 * Each source starts from a table of contents (toc.json) or from seed pages,
 * and keeps the pages under its URL prefixes, so a source can be a whole doc
 * set or one branch of a larger one. The build follows links between pages
 * inside the prefixes, so a seed page is enough for a small branch. All of
 * them are published by Microsoft under CC BY 4.0.
 */
export interface Source {
  id: string;
  title: string;
  /** Where the page list starts: a toc.json, or seed pages when the table of contents is too large to fetch reliably. */
  tocUrl?: string;
  seeds?: string[];
  baseUrl: string;
  prefixes: string[];
  license: 'CC-BY-4.0';
}

export const SOURCES: Source[] = [
  {
    id: 'well-architected',
    title: 'Azure Well-Architected Framework',
    tocUrl: 'https://learn.microsoft.com/en-us/azure/well-architected/toc.json',
    baseUrl: 'https://learn.microsoft.com/en-us/azure/well-architected/',
    prefixes: ['https://learn.microsoft.com/en-us/azure/well-architected/'],
    license: 'CC-BY-4.0',
  },
  {
    id: 'architecture-center-ai',
    title: 'Azure Architecture Center: AI and machine learning',
    tocUrl: 'https://learn.microsoft.com/en-us/azure/architecture/toc.json',
    baseUrl: 'https://learn.microsoft.com/en-us/azure/architecture/',
    prefixes: ['https://learn.microsoft.com/en-us/azure/architecture/ai-ml/'],
    license: 'CC-BY-4.0',
  },
  {
    id: 'cloud-adoption-ai-agents',
    title: 'Cloud Adoption Framework: AI agents',
    // The Cloud Adoption Framework's table of contents is large and rate limited; the AI agents hub links to every page.
    seeds: ['https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents/'],
    baseUrl: 'https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/',
    prefixes: ['https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents/'],
    license: 'CC-BY-4.0',
  },
];

export const ATTRIBUTION =
  'Content from Microsoft Learn (learn.microsoft.com), © Microsoft, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). ' +
  'Changed for Teolima: page markup removed and pages split into sections by heading.';
