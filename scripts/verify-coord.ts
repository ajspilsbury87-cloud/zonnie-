/**
 * One-off coord verifier: compares a terrace's stored coords + placeId
 * against Google's authoritative record (via the read-only Places search).
 * Loads the key from .env without printing it. Run:
 *   npx tsx scripts/verify-coord.ts <terraceId>
 */
import { readFileSync } from 'node:fs';
import { placesLookupReadOnly, distanceMeters } from './audit/_placesLookupReadOnly';

const env = readFileSync('.env', 'utf8');
const envVal = (name: string) => {
  const m = env.match(new RegExp('^' + name + '=(.*)$', 'm'));
  return m ? m[1]!.trim().replace(/^["']|["']$/g, '') : undefined;
};
const key = envVal('GOOGLE_MAPS_API_KEY') ?? envVal('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
if (!key) { console.error('No Google key in .env'); process.exit(1); }

const id = Number(process.argv[2] ?? '1423');
const t = JSON.parse(readFileSync('src/data/terraces.json', 'utf8')).find((x: { id: number }) => x.id === id);
console.log(`#${t.id} ${t.name}`);
console.log('  stored coords:', t.lat, t.lng);
console.log('  stored placeId:', t.placeId);
console.log('  address:', t.address);

const queries = [
  `${t.name}, ${t.address}`,
  `${t.name} Amsterdam`,
  t.address,
];
(async () => {
  for (const q of queries) {
    const r = await placesLookupReadOnly(q, key);
    if (r.kind === 'hit') {
      const d = distanceMeters(t.lat, t.lng, r.result.lat, r.result.lng);
      console.log(`\nquery: "${q}"`);
      console.log('  → match:', r.result.matchName);
      console.log('  → google coords:', r.result.lat, r.result.lng);
      console.log('  → distance from stored:', Math.round(d), 'm');
      console.log('  → google placeId:', r.result.placeId, r.result.placeId === t.placeId ? '(MATCHES stored ✓)' : '(differs from stored)');
    } else {
      console.log(`\nquery: "${q}" → ${r.kind}`, JSON.stringify(r).slice(0, 200));
    }
  }
})();
