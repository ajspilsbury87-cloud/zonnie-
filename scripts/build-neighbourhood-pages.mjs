// =============================================================================
// build-neighbourhood-pages.mjs — regenerate the static NL neighbourhood SEO
// pages' ranked terrace lists from the live dataset.
// -----------------------------------------------------------------------------
// The 8 docs/nl/terrassen-*.html pages were hand-built score snapshots that
// drifted: they listed since-closed venues and missed genuinely-sunnier ones
// added by later sweeps. This regenerates just the `.terr-list` block + the
// ItemList JSON-LD in each page (surrounding copy/layout untouched) from
// docs/terraces-lite.json, so they stay accurate.
//
//   node scripts/build-neighbourhood-pages.mjs
// =============================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const LITE = 'docs/terraces-lite.json';
const DIR = 'docs/nl';
const TOP_N = 10;

// page slug → dataset areas it draws from (reverse-engineered from the pages'
// existing content + the app's AREA_TO_REGION; disjoint + complete).
const PAGE_AREAS = {
  'centrum': ['Centrum', '9 Straatjes', 'Leidseplein', 'Rembrandtplein', 'Plantage'],
  'de-pijp': ['De Pijp'],
  'jordaan': ['Jordaan', 'Haarlemmerbrt'],
  'noord': ['Noord'],
  'oost': ['Oost', 'Watergraafsmeer', 'Indische Buurt', 'Amstelkwartier', 'Amstel', 'IJburg', 'Zeeburgereiland'],
  'west': ['West', 'Oud-West', 'De Baarsjes', 'Bos en Lommer', 'Nieuw-West'],
  'westerpark': ['Westerpark', 'Spaarndammer', 'Houthavens'],
  'zuid': ['Zuid', 'Oud-Zuid', 'Rivierenbuurt', 'Stadionbuurt', 'Zuidas', 'Buitenveldert', 'Vondelpark'],
};

const FACING_NL = {
  N: 'op het noorden', NE: 'op het noordoosten', E: 'op het oosten', SE: 'op het zuidoosten',
  S: 'op het zuiden', SW: 'op het zuidwesten', W: 'op het westen', NW: 'op het noordwesten',
  All: 'aan alle kanten',
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function sunClass(score) { return score >= 70 ? 'hi' : score >= 45 ? 'md' : 'lo'; }

const lite = JSON.parse(readFileSync(LITE, 'utf8'));

function topForAreas(areas) {
  const set = new Set(areas);
  return lite
    .filter((t) => set.has(t.area))
    .map((t) => ({ ...t, peak: Math.max(...t.h) }))
    .sort((a, b) => b.peak - a.peak || (b.googleReviewCount ?? 0) - (a.googleReviewCount ?? 0))
    .slice(0, TOP_N);
}

let changed = 0;
for (const [slug, areas] of Object.entries(PAGE_AREAS)) {
  const path = `${DIR}/terrassen-${slug}.html`;
  let html = readFileSync(path, 'utf8');
  const top = topForAreas(areas);
  if (top.length === 0) { console.log(`  ${slug}: no terraces — skipped`); continue; }

  // Rows
  const rows = top.map((t, i) => {
    const meta = `${esc(t.area)} · ${FACING_NL[t.facing] ?? 'op het zuiden'}`;
    const rating = t.googleRating != null
      ? `<span class="rating">★ ${t.googleRating} · ${t.googleReviewCount ?? 0}</span>`
      : '';
    return `      <div class="terr"><div class="rank">${i + 1}</div>\n` +
      `        <div><div class="tn">${esc(t.name)}</div><div class="meta">${meta}</div></div>\n` +
      `        <div class="right">${rating}<span class="sun ${sunClass(t.peak)}">☀ ${t.peak}</span></div></div>`;
  }).join('\n');
  const newList = `<div class="terr-list">\n${rows}\n  </div>`;

  // JSON-LD ItemList (name field only, matching the original shape)
  const items = top.map((t, i) => `{"@type":"ListItem","position":${i + 1},"name":${JSON.stringify(t.name)}}`).join(',');
  const areaName = html.match(/<h1>Zonnige terrassen in ([^<]+)<\/h1>/)?.[1] ?? slug;
  const newItemList = `{"@type":"ItemList","name":"Zonnigste terrassen in ${areaName}","itemListElement":[${items}]}`;

  const beforeHtml = html;
  html = html.replace(/<div class="terr-list">[\s\S]*?\n  <\/div>/, newList);
  html = html.replace(/\{"@type":"ItemList","name":"[^"]*","itemListElement":\[[\s\S]*?\]\}/, newItemList);
  if (html === beforeHtml) { console.log(`  ${slug}: NO MATCH — markers not found!`); continue; }
  writeFileSync(path, html);
  changed++;
  console.log(`  ${slug}: ${top.length} terraces (top "${top[0].name}" ${top[0].peak})`);
}
console.log(`\nRegenerated ${changed}/${Object.keys(PAGE_AREAS).length} pages.`);
