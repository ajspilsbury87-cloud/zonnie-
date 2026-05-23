/**
 * Deep diagnostic: why Bonnie has 0 shadow at 15-19h.
 * Run: node scripts/diagnose-scores.js
 */
'use strict';
const fs = require('fs');

const terraces = JSON.parse(fs.readFileSync('src/data/terraces.json', 'utf8'));
const buildingsMap = JSON.parse(fs.readFileSync('src/data/buildings.json', 'utf8'));

const DEG = Math.PI / 180, RAD = 180 / Math.PI;
const M_LNG = 111320 * Math.cos(52.3676 * DEG);
const M_LAT = 110540;

function julianDay(date) {
  let y = date.getUTCFullYear(), m = date.getUTCMonth() + 1;
  const d = date.getUTCDate(), h = date.getUTCHours() + date.getUTCMinutes() / 60;
  if (m <= 2) { y--; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25*(y+4716)) + Math.floor(30.6001*(m+1)) + d + h/24 + B - 1524.5;
}
function solarPos(date, lat, lng) {
  const jd = julianDay(date), n = jd - 2451545.0;
  const L = (280.46 + 0.9856474*n) % 360, g = ((357.528 + 0.9856003*n) % 360) * DEG;
  const lambda = (L + 1.915*Math.sin(g) + 0.02*Math.sin(2*g)) * DEG;
  const e = 23.439 * DEG, dec = Math.asin(Math.sin(e)*Math.sin(lambda));
  let ra = Math.atan2(Math.cos(e)*Math.sin(lambda), Math.cos(lambda));
  if (ra < 0) ra += 2*Math.PI;
  const gmst = (280.46061837 + 360.98564736629*n) % 360;
  let ha = ((gmst+lng)%360)*DEG - ra;
  if (ha < -Math.PI) ha += 2*Math.PI; if (ha > Math.PI) ha -= 2*Math.PI;
  const lr = lat*DEG, sinAlt = Math.sin(lr)*Math.sin(dec) + Math.cos(lr)*Math.cos(dec)*Math.cos(ha);
  const alt = Math.asin(sinAlt)*RAD;
  const cosAz = (Math.sin(dec)-Math.sin(lr)*sinAlt)/(Math.cos(lr)*Math.cos(alt*DEG));
  let az = Math.acos(Math.max(-1,Math.min(1,cosAz)))*RAD;
  if (Math.sin(ha) > 0) az = 360 - az;
  return { alt, az };
}

const bonnie = terraces.find(t => t.id === 502);
const bldgs = buildingsMap[502] || [];

// ── 1. Full building inventory: bearing, distance, height for ALL buildings ──
console.log(`\n=== All buildings near Bonnie (${bldgs.length} total) ===`);
console.log(`Bonnie at lat=${bonnie.lat.toFixed(5)}, lng=${bonnie.lng.toFixed(5)}, facing=S`);
console.log('\n  Bearing  Dist    Height  HasPoly  AngH@17h  Ratio@17h  AngH@19h  Ratio@19h');

const sun17 = solarPos(new Date('2026-05-18T15:00:00Z'), bonnie.lat, bonnie.lng); // 17:00 CEST
const sun19 = solarPos(new Date('2026-05-18T17:00:00Z'), bonnie.lat, bonnie.lng); // 19:00 CEST
console.log(`  Sun@17h: alt=${sun17.alt.toFixed(1)}° az=${sun17.az.toFixed(1)}°`);
console.log(`  Sun@19h: alt=${sun19.alt.toFixed(1)}° az=${sun19.az.toFixed(1)}°`);

const rows = bldgs.map(b => {
  const dx = (b.lng - bonnie.lng) * M_LNG;
  const dy = (b.lat - bonnie.lat) * M_LAT;
  const dist = Math.sqrt(dx*dx + dy*dy);
  const bearing = (Math.atan2(dx, dy)*RAD + 360) % 360;
  const angH = Math.atan2(b.height, dist)*RAD;
  return { bearing, dist, height: b.height, hasPoly: !!(b.poly?.length >= 3), angH, dist, b };
}).sort((a,b) => a.bearing - b.bearing);

// Group by bearing quadrant to understand layout
const byQuadrant = { 'N(315-45)': 0, 'E(45-135)': 0, 'S(135-225)': 0, 'W(225-315)': 0 };
for (const r of rows) {
  const bear = r.bearing;
  if (bear >= 315 || bear < 45) byQuadrant['N(315-45)']++;
  else if (bear < 135) byQuadrant['E(45-135)']++;
  else if (bear < 225) byQuadrant['S(135-225)']++;
  else byQuadrant['W(225-315)']++;
}
console.log('\n  Buildings by quadrant:', JSON.stringify(byQuadrant));

// Show all buildings sorted by bearing, with height ratios
console.log('\n  Bear°   Dist    H(m)  AngH  R@17h  R@19h');
for (const r of rows) {
  const ratio17 = r.angH / sun17.alt;
  const ratio19 = r.angH / sun19.alt;
  const flag17 = ratio17 >= 0.8 ? '✓' : '✗';
  const flag19 = ratio19 >= 0.8 ? '✓' : '✗';
  const inSunDir = (r.bearing >= 200 && r.bearing <= 310);  // roughly SW-W-NW
  console.log(
    `  ${r.bearing.toFixed(1).padStart(6)}°  ${r.dist.toFixed(0).padStart(5)}m  ${r.height.toFixed(1).padStart(5)}  ${r.angH.toFixed(1).padStart(4)}°  ${flag17}${ratio17.toFixed(2).padStart(5)}  ${flag19}${ratio19.toFixed(2).padStart(5)}${inSunDir ? '  ← in sun direction' : ''}`
  );
}

// ── 2. What would need to change for buildings to cast shadow at 17h and 19h ──
console.log('\n=== What it takes to block Bonnie\'s sun ===');
for (const { hour, utcH } of [{hour:15,utcH:13},{hour:17,utcH:15},{hour:18,utcH:16},{hour:19,utcH:17}]) {
  const sun = solarPos(new Date(`2026-05-18T${String(utcH).padStart(2,'0')}:00:00Z`), bonnie.lat, bonnie.lng);
  const needAngH = 0.8 * sun.alt;
  const atDist = (dist) => (Math.atan2(1, dist/16)*RAD).toFixed(1); // 16m building at dist
  console.log(`\n  ${hour}:00 — sun alt=${sun.alt.toFixed(1)}°, az=${sun.az.toFixed(1)}°`);
  console.log(`    Need angH > ${needAngH.toFixed(1)}° to pass height check`);
  for (const d of [20, 30, 40, 50, 60]) {
    const neededH = Math.tan(needAngH * DEG) * d;
    console.log(`    At ${d}m: building must be > ${neededH.toFixed(1)}m tall (4-story ≈ 14m; 6-story ≈ 20m)`);
  }
  // Which buildings currently pass height check AND are in sun direction?
  const passing = rows.filter(r => {
    const angH = Math.atan2(r.height, r.dist)*RAD;
    return angH / sun.alt >= 0.8 && r.dist >= 8 && r.dist <= 200;
  });
  const inDir = passing.filter(r => {
    const diff = Math.abs(r.bearing - sun.az);
    return Math.min(diff, 360-diff) < 30;  // within 30° of sun azimuth
  });
  console.log(`    Buildings passing height check: ${passing.length} total, ${inDir.length} within 30° of sun`);
}

// ── 3. Facing factor breakdown — show the cliff problem ───────────────────────
console.log('\n=== Facing-factor cliff diagnostic (S-facing, sun az varies) ===');
console.log('  SunAz  FacingDiff  Factor   Score@alt30°');
const alt30 = Math.sqrt(30/90);
for (let az = 160; az <= 290; az += 5) {
  const diff = Math.min(Math.abs(az - 180), 360 - Math.abs(az - 180));
  const factor = diff < 90 ? 1 + (1 - diff/90)*0.25 : 0.6;
  const score = alt30 * factor;
  const flag = diff === 90 ? ' ←← CLIFF' : (diff > 87 && diff < 93 ? ' ← near cliff' : '');
  console.log(`  ${az.toString().padStart(5)}°    ${diff.toFixed(0).padStart(3)}°     ${factor.toFixed(3)}    ${(score*100).toFixed(0)}${flag}`);
}

// ── 4. What does the formula give at theoretical max for each time window ──────
console.log('\n=== Theoretical max score (no shadow, 0% cloud, best facing SW) ===');
console.log('For reference: what is the ceiling for each hour?');
for (const { h, utcH } of [{h:13,utcH:11},{h:14,utcH:12},{h:15,utcH:13},{h:16,utcH:14},{h:17,utcH:15},{h:18,utcH:16},{h:19,utcH:17},{h:20,utcH:18}]) {
  const sun = solarPos(new Date(`2026-05-18T${String(utcH).padStart(2,'0')}:00:00Z`), bonnie.lat, bonnie.lng);
  if (sun.alt <= 0) continue;
  const altF = Math.sqrt(sun.alt / 90);
  // Best facing: diff=0 → 1.25; calculate for SW(225), S(180), W(270)
  for (const [facing, facingAz] of [['SW',225],['S',180],['W',270]]) {
    const diff = Math.min(Math.abs(sun.az - facingAz), 360-Math.abs(sun.az-facingAz));
    const fF = diff < 90 ? 1 + (1-diff/90)*0.25 : 0.6;
    if (facing === 'SW') process.stdout.write(`  ${h}:00  alt=${sun.alt.toFixed(1).padStart(5)}° az=${sun.az.toFixed(1).padStart(6)}°  `);
    process.stdout.write(`${facing}:${Math.round(altF*fF*100).toString().padStart(3)}  `);
  }
  console.log();
}
