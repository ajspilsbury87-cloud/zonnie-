/* Inspect terrace data to design a venue-type filter. */
import { TERRACES } from '../src/data/terraces';

console.log('=== Distinct vibes (top 30) ===');
const vibes: Record<string, number> = {};
for (const x of TERRACES) {
  vibes[x.vibe ?? '(empty)'] = (vibes[x.vibe ?? '(empty)'] ?? 0) + 1;
}
const sortedVibes = Object.entries(vibes).sort((a, b) => b[1] - a[1]);
for (const [v, c] of sortedVibes.slice(0, 30)) {
  console.log(c.toString().padStart(4), ' ', v);
}

console.log('\n=== Sample of "other" name bucket (no clear prefix) ===');
let n = 0;
for (const x of TERRACES) {
  const ln = x.name.toLowerCase();
  if (
    ln.startsWith('café') ||
    ln.startsWith('cafe ') ||
    ln.startsWith('bar ') ||
    ln.startsWith('brasserie') ||
    ln.startsWith('restaurant') ||
    ln.startsWith('eetcafé') ||
    ln.startsWith('koffie') ||
    ln.startsWith('lounge') ||
    ln.startsWith('brouwerij') ||
    ln.includes('grand café') ||
    ln.includes('bruin café')
  ) {
    continue;
  }
  if (n++ < 30) {
    console.log(x.name.padEnd(35), ' :: ', x.vibe?.slice(0, 30) ?? '');
  }
}
