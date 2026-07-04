// Quick visual mock of the TodaysVerdict sun arc — same trig as
// src/engines/sunArcGeometry.ts, rendered via sharp so it can be eyeballed
// without an iOS simulator. Not part of the app.
import sharp from 'sharp';

const R = 150, SD = 150, ED = 30, ER = (ED * Math.PI) / 180;
const W = Math.round(2 * R * Math.cos(ER));
function pt(h, f, t) {
  const s = t - f;
  const u = s <= 0 ? 0 : Math.min(1, Math.max(0, (h - f) / s));
  const rad = ((SD + (ED - SD) * u) * Math.PI) / 180;
  return { x: W / 2 + R * Math.cos(rad), y: R * Math.sin(rad) - R * Math.sin(ER) };
}

const F = 8, T = 21, BF = 13, BT = 18, NOW = 15.4;
let dots = '';
for (let h = F; h <= T; h += 0.5) {
  const { x, y } = pt(h, F, T);
  const warm = h >= BF && h <= BT;
  dots += `<circle cx="${60 + x}" cy="${150 - y}" r="${warm ? 3.5 : 2.5}" fill="${warm ? '#FBA85A' : '#C8B89A'}"/>`;
}
const s = pt(NOW, F, T);

const svg = `<svg width="380" height="260" xmlns="http://www.w3.org/2000/svg">
<rect width="380" height="260" fill="#FFF8F0"/>
<rect x="14" y="14" width="352" height="232" rx="16" fill="#FFFFFF"/>
<rect x="14" y="14" width="3" height="232" fill="#FBA85A"/>
<text x="32" y="44" font-family="sans-serif" font-size="10" letter-spacing="1" fill="#5A4A38">TODAY&#8217;S VERDICT</text>
<text x="32" y="68" font-family="serif" font-weight="bold" font-size="19" fill="#2A1F15">Great terrace day.</text>
<text x="32" y="88" font-family="sans-serif" font-size="12" fill="#5A4A38">312 terraces in strong sun &#183; best 13:00&#8211;18:00</text>
<line x1="60" y1="150" x2="${60 + W}" y2="150" stroke="#E8DCC8" stroke-width="1"/>
${dots}
<circle cx="${60 + s.x}" cy="${150 - s.y}" r="15" fill="#FBA85A" opacity="0.22"/>
<circle cx="${60 + s.x}" cy="${150 - s.y}" r="9" fill="#FBA85A" stroke="#FFFFFF" stroke-width="2"/>
<text x="60" y="166" font-family="sans-serif" font-weight="600" font-size="10" fill="#C8B89A">08</text>
<text x="${48 + W}" y="166" font-family="sans-serif" font-weight="600" font-size="10" fill="#C8B89A">21</text>
<line x1="32" y1="182" x2="348" y2="182" stroke="#E8DCC8" stroke-width="0.7"/>
<text x="32" y="202" font-family="sans-serif" font-size="9.5" letter-spacing="0.8" fill="#5A4A38">TOP PICKS TODAY</text>
<text x="32" y="222" font-family="serif" font-weight="bold" font-size="13" fill="#2A1F15">Waterkant</text>
<rect x="316" y="210" width="32" height="17" rx="8.5" fill="#D9633E"/>
<text x="332" y="222" font-family="sans-serif" font-weight="bold" font-size="10" fill="#fff" text-anchor="middle">94</text>
</svg>`;

const out = process.argv[2] ?? 'sunarc-mock.png';
await sharp(Buffer.from(svg)).resize(760).png().toFile(out);
console.log('wrote', out);
