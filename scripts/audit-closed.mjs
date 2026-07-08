// =============================================================================
// audit-closed.mjs — permanently/temporarily-closed audit of the dataset
// -----------------------------------------------------------------------------
// Checks Places `businessStatus` for every placeId'd terrace verified BEFORE
// this session's sweeps (fresh ones are already known operational). Writes a
// report; makes NO repo changes. apply-closed.mjs consumes it.
//
//   node scripts/audit-closed.mjs
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const REPO = 'C:/Users/andys/OneDrive/Documents/SunBae_Claude/SunBae';
const OUT = 'C:/Users/andys/AppData/Local/Temp/claude/C--Users-andys-OneDrive-Documents-SunBae-Claude/e5e783fb-cefc-4a61-8a0f-eb81e750fcbc/scratchpad/closed-audit-report.json';
const KEY = (readFileSync(`${REPO}/.env.local`, 'utf8').match(/^GOOGLE_MAPS_API_KEY=(.+)$/m) || [])[1]?.trim();
if (!KEY) throw new Error('key missing');

const terraces = JSON.parse(readFileSync(`${REPO}/src/data/terraces.json`, 'utf8'));
const targets = terraces.filter((x) => x.placeId && (!x.verifiedAt || x.verifiedAt < '2026-07-04'));
console.log(`Auditing ${targets.length} placeId'd entries (verified before 2026-07-04)`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const perm = [], temp = [], gone = [];
let calls = 0, ok = 0;
for (let i = 0; i < targets.length; i++) {
  const t = targets[i];
  calls++;
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${t.placeId}`, {
      headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'businessStatus,displayName' },
    });
    if (r.status === 404) { gone.push({ id: t.id, name: t.name, area: t.area }); }
    else if (r.ok) {
      const d = await r.json();
      const bs = d.businessStatus;
      if (bs === 'CLOSED_PERMANENTLY') perm.push({ id: t.id, name: t.name, area: t.area, google: d.displayName?.text });
      else if (bs === 'CLOSED_TEMPORARILY') temp.push({ id: t.id, name: t.name, area: t.area });
      else ok++;
    }
  } catch { /* skip transient errors */ }
  if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${targets.length} · perm ${perm.length} · temp ${temp.length} · gone ${gone.length}`);
  await sleep(90);
}

writeFileSync(OUT, JSON.stringify({ perm, temp, gone, audited: calls, ok }, null, 2));
console.log(`\n════ CLOSED AUDIT ════`);
console.log(`Audited: ${calls}  (~$${(calls * 0.017).toFixed(2)})  · operational: ${ok}`);
console.log(`CLOSED_PERMANENTLY: ${perm.length}`);
for (const p of perm) console.log(`  #${p.id} ${p.name} [${p.area}]`);
console.log(`CLOSED_TEMPORARILY: ${temp.length}`);
for (const p of temp) console.log(`  #${p.id} ${p.name} [${p.area}]`);
console.log(`placeId 404 / gone: ${gone.length}`);
for (const p of gone) console.log(`  #${p.id} ${p.name} [${p.area}]`);
console.log(`Report → ${OUT}`);
