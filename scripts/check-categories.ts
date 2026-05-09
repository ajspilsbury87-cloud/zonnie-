#!/usr/bin/env tsx
import { TERRACES } from '../src/data/terraces';
import { categoriesForTerrace } from '../src/data/categories';

const counts = { 'bar only': 0, 'restaurant only': 0, both: 0, neither: 0 };
const examples: Record<string, string[]> = {
  'bar only': [],
  'restaurant only': [],
  both: [],
  neither: [],
};

for (const t of TERRACES) {
  const cats = categoriesForTerrace(t);
  const key =
    cats.size === 0 ? 'neither' :
    cats.size === 2 ? 'both' :
    cats.has('bar') ? 'bar only' : 'restaurant only';
  counts[key]++;
  if (examples[key]!.length < 8) examples[key]!.push(t.name);
}

console.log('Categorisation distribution:');
for (const k of Object.keys(counts)) {
  console.log(`  ${k.padEnd(16)} ${counts[k as keyof typeof counts]}`);
}
console.log('\nSample names:');
for (const k of Object.keys(examples)) {
  console.log(`  [${k}]`);
  for (const n of examples[k]!) console.log(`    ${n}`);
}

// Specific suspect-name check — "eetcafé"-prefixed venues should now
// land in restaurant only, not bar+restaurant.
const eetcafes = TERRACES.filter((t) => /eetcaf/i.test(t.name));
console.log(`\n${eetcafes.length} eetcafé-named venues:`);
for (const t of eetcafes.slice(0, 8)) {
  const cats = [...categoriesForTerrace(t)].sort().join('+') || 'neither';
  console.log(`  ${cats.padEnd(20)} ${t.name}`);
}
