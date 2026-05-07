import { TERRACES } from '../src/data/terraces';
import { getBuildingsForTerrace } from '../src/data/buildings';
import { computeSunScore, scoreLabel } from '../src/engines/scoring';

const DATE = '2026-06-15'; // World Cup launch window
const wc = TERRACES.filter((t) => t.outdoorScreens && t.outdoorScreens > 0);
console.log(`${wc.length} World Cup venues:`);
console.log('');
console.log('Hour      ', wc.map(v => v.name.slice(0,12).padEnd(12)).join(' '));
for (let h = 14; h <= 21; h++) {
  const row = wc.map(v => {
    const b = getBuildingsForTerrace(v.id);
    const r = computeSunScore(v, b, h, DATE, 'sunny');
    const pct = Math.round(r.score * 100);
    return pct.toString().padStart(2) + '%   ' + ' '.repeat(6);
  });
  console.log(h.toString().padStart(2) + ':00   ', row.join(' '));
}
console.log('');
console.log('Range avg 18-21h (typical match window):');
for (const v of wc) {
  const b = getBuildingsForTerrace(v.id);
  let sum = 0;
  for (let h = 18; h <= 21; h++) sum += computeSunScore(v, b, h, DATE, 'sunny').score;
  const avg = sum / 4;
  console.log('  ', Math.round(avg*100).toString().padStart(3) + '%', scoreLabel(avg).padEnd(15), v.name);
}
