/**
 * Loads the guidance snapshot (data/knowledge/*.json) at startup.
 *
 * The snapshot ships with the repository, so the app needs no database or
 * network access to ground its advice in Microsoft's guidance. A missing or
 * empty folder gives an empty Guidance, not an error.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Guidance } from '../shared/knowledge/guidance';
import type { Snapshot } from '../shared/knowledge/snapshot';

export async function loadGuidance(dir = path.resolve('data/knowledge')): Promise<Guidance> {
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return new Guidance([]);
  }
  const snapshots = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), 'utf8')) as Snapshot));
  return new Guidance(snapshots);
}
