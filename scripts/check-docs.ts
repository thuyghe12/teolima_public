/**
 * Runs one real Microsoft Learn search, to confirm documentation grounding works
 * from this machine:  npm run check:docs -- "your query"
 */
import 'dotenv/config';
import { config } from '../server/config';
import { microsoftDocsCaller, searchMicrosoftDocs } from '../server/microsoft-docs';

const query = process.argv.slice(2).join(' ') || 'Agent Framework orchestration patterns';
if (!config.microsoftDocsUrl || config.microsoftDocsUrl === 'off') {
  console.log('Microsoft Learn search is disabled (MICROSOFT_DOCS_MCP_URL=off).');
  process.exit(1);
}
const result = await searchMicrosoftDocs(query, microsoftDocsCaller(config.microsoftDocsUrl));
if ('error' in result) {
  console.error(`Failed: ${result.error}`);
  process.exit(1);
}
console.log(`Query: ${result.query}\n`);
console.log(result.results.slice(0, 1500));
process.exit(0);
