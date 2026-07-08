// =============================================================================
// apply-closed.mjs — remove closed venues found by audit-closed.mjs
// -----------------------------------------------------------------------------
//   node scripts/apply-closed.mjs               # dry-run (perm only)
//   node scripts/apply-closed.mjs --apply       # remove CLOSED_PERMANENTLY
//   node scripts/apply-closed.mjs --apply --gone # also remove 404/gone placeIds
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const ALSO_GONE = process.argv.includes('--gone');
const TERRACES = 'src/data/terraces.json';
const REPORT = 'C:/Users/andys/AppData/Local/Temp/claude/C--Users-andys-OneDrive-Documents-SunBae-Claude/e5e783fb-cefc-4a61-8a0f-eb81e750fcbc/scratchpad/closed-audit-report.json';

const rep = JSON.parse(readFileSync(REPORT, 'utf8'));
let terraces = JSON.parse(readFileSync(TERRACES, 'utf8'));

const removeIds = new Set(rep.perm.map((p) => p.id));
if (ALSO_GONE) for (const g of rep.gone) removeIds.add(g.id);

const before = terraces.length;
const removed = terraces.filter((t) => removeIds.has(t.id));
terraces = terraces.filter((t) => !removeIds.has(t.id));

console.log(`CLOSED_PERMANENTLY: ${rep.perm.length}  |  gone(404): ${rep.gone.length}  |  temp: ${rep.temp.length}`);
console.log(`Removing ${removed.length} (perm${ALSO_GONE ? ' + gone' : ''}): ${before} -> ${terraces.length}`);
for (const r of removed) console.log(`  - #${r.id} ${r.name} [${r.area}]`);
if (rep.temp.length) {
  console.log(`\nKEPT (temporarily closed — may reopen, review manually):`);
  for (const t of rep.temp) console.log(`  ? #${t.id} ${t.name} [${t.area}]`);
}

if (!APPLY) { console.log('\n(dry-run — no writes. Re-run with --apply [--gone])'); process.exit(0); }
writeFileSync(TERRACES, JSON.stringify(terraces, null, 2) + '\n');
console.log(`\nWrote ${terraces.length} terraces -> ${TERRACES}`);
