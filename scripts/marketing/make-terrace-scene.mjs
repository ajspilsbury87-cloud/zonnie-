/* Terrace-in-the-sun hero — COMPACT panoramic strip. Renders PNG (view) + 2x webp (site). */
import sharp from 'sharp';
const OUT='C:/Users/andys/AppData/Local/Temp/claude/C--Users-andys-OneDrive-Documents-SunBae-Claude/e5e783fb-cefc-4a61-8a0f-eb81e750fcbc/scratchpad/terrace-scene.png';
const WEBP='C:/Users/andys/OneDrive/Documents/SunBae_Claude/SunBae/docs/assets/terrace-hero.webp';
const W=1400, H=430, GY=250;

const C={sky1:'#FFE0A6',sky2:'#FFF1DE',sun:'#FFF3CC',
  paveSun:'#F6DC97',paveSunHi:'#FBE7AE',paveShade:'#B7A183',paveShadeDk:'#9F8A6D',
  trim:'#FFF3E4',glass:'#3A2A22',awnA:'#D9633E',awnB:'#FFE5C2',ink:'#2A1F15',water:'#AECFCB',
  skin1:'#EBA96E',skin2:'#C6804B',skin3:'#D98F52',cocoa:'#7A2E14',mustard:'#F4D58D',burnt:'#D9633E',terra:'#B14222',cream:'#FFF3E4'};

function stepSeg(x,w,e,gh){const s=gh/3,d=w/6;return `L${x} ${e-s} L${x+d} ${e-s} L${x+d} ${e-2*s} L${x+2*d} ${e-2*s} L${x+2*d} ${e-3*s} L${(x+2.4*d).toFixed(1)} ${(e-3*s-s*0.7).toFixed(1)} L${(x+3.6*d).toFixed(1)} ${(e-3*s-s*0.7).toFixed(1)} L${x+4*d} ${e-3*s} L${x+4*d} ${e-2*s} L${x+5*d} ${e-2*s} L${x+5*d} ${e-s} L${x+w} ${e-s} L${x+w} ${e}`;}
function bellSeg(x,w,e,gh){const cx=x+w/2;return `C${x} ${e-gh*0.6} ${cx-w*0.3} ${e-gh} ${cx} ${e-gh} C${cx+w*0.3} ${e-gh} ${x+w} ${e-gh*0.6} ${x+w} ${e}`;}
function neckSeg(x,w,e,gh){const nk=w*0.42,nx=x+(w-nk)/2,sh=e-gh*0.32,ny=e-gh;return `L${x} ${sh} L${nx} ${sh} L${nx} ${ny+gh*0.16} L${nx+nk/2} ${ny} L${nx+nk} ${ny+gh*0.16} L${nx+nk} ${sh} L${x+w} ${sh} L${x+w} ${e}`;}
function sg(t,x,w,e,gh){return t==='step'?stepSeg(x,w,e,gh):t==='bell'?bellSeg(x,w,e,gh):neckSeg(x,w,e,gh);}
function house(h){const gh=h.eaves-h.peak;let s=`<path d="M${h.x} ${GY} L${h.x} ${h.eaves} ${sg(h.gable,h.x,h.w,h.eaves,gh)} L${h.x+h.w} ${GY} Z" fill="${h.brick}"/><rect x="${h.x}" y="${h.eaves}" width="${h.w}" height="6" fill="${h.dk}"/>`;
  const ww=h.w*0.26,wh=34,cols=[h.x+h.w*0.19,h.x+h.w*0.55];
  for(let r=0;r<2;r++){const y=h.eaves+18+r*46; if(y>GY-52)break; cols.forEach(cx=>{s+=`<rect x="${cx}" y="${y}" width="${ww}" height="${wh}" rx="2.5" fill="${C.trim}"/><rect x="${cx+2.5}" y="${y+2.5}" width="${ww-5}" height="${wh-5}" rx="2" fill="${C.glass}"/>`;});}
  return s;}

function person(x,y,shirt,skin,sc){sc=sc||1;const hr=13*sc,tw=32*sc,th=42*sc,hy=y-50*sc;return `<g><ellipse cx="${x}" cy="${y+3}" rx="${22*sc}" ry="${7*sc}" fill="rgba(122,46,20,.16)"/><rect x="${x-tw/2}" y="${y-th}" width="${tw}" height="${th}" rx="${13*sc}" fill="${shirt}"/><circle cx="${x}" cy="${hy}" r="${hr}" fill="${skin}"/><path d="M${x-hr} ${hy-2} a${hr} ${hr} 0 0 1 ${2*hr} 0 z" fill="${C.cocoa}" opacity=".9"/><circle cx="${x+4*sc}" cy="${hy-1}" r="${hr}" fill="#FFF6DC" opacity=".18"/></g>`;}
function chair(x,y,sc){sc=sc||1;const w=24*sc;return `<g fill="${C.cream}" stroke="${C.ink}" stroke-width="1.4" opacity=".9"><rect x="${x-w/2}" y="${y-6}" width="${w}" height="6" rx="3"/><rect x="${x-w/2}" y="${y-22*sc}" width="${5*sc}" height="${18*sc}" rx="2"/></g>`;}
function table(x,y,lit,sc){sc=sc||1;const top=lit?C.cream:'#D7C7AC',rx=34*sc,ry=11*sc;return `<g><ellipse cx="${x}" cy="${y+26*sc}" rx="${rx}" ry="${9*sc}" fill="rgba(122,46,20,.16)"/><rect x="${x-3*sc}" y="${y}" width="${6*sc}" height="${26*sc}" fill="${C.ink}" opacity=".85"/><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${top}" stroke="${C.ink}" stroke-width="1.3"/><ellipse cx="${x-8*sc}" cy="${y-2}" rx="${5*sc}" ry="${6*sc}" fill="${C.burnt}"/></g>`;}
function group(cx,ty,shirts,sc){return chair(cx-40*sc,ty+2,sc)+chair(cx+40*sc,ty+2,sc)+person(cx-26*sc,ty-3,shirts[0],C.skin1,sc*0.9)+person(cx+26*sc,ty-4,shirts[1],C.skin2,sc*0.9)+table(cx,ty,true,sc)+person(cx-32*sc,ty+34*sc,shirts[2],C.skin3,sc*1.08)+person(cx+30*sc,ty+35*sc,shirts[3],C.skin1,sc*1.08);}
function parasol(x,ty){const rimY=ty-40,apexY=rimY-54,R=124,n=8;let w='';for(let i=0;i<n;i++){const x1=x-R+2*R*i/n,x2=x-R+2*R*(i+1)/n,mx=(x1+x2)/2,col=i%2?C.awnB:C.awnA;w+=`<path d="M${x} ${apexY} L${x1.toFixed(1)} ${rimY} Q${mx.toFixed(1)} ${rimY+12} ${x2.toFixed(1)} ${rimY} Z" fill="${col}"/>`;}return `<g><rect x="${x-2.5}" y="${apexY}" width="5" height="${ty-apexY}" fill="${C.cocoa}"/>${w}<circle cx="${x}" cy="${apexY-6}" r="5" fill="${C.burnt}"/></g>`;}

const houses=[
 {x:876,w:120,eaves:120,peak:64,gable:'step',brick:'#B85434',dk:'#98412A'},
 {x:996,w:112,eaves:100,peak:52,gable:'bell',brick:'#C55C39',dk:'#A6472A'},
 {x:1108,w:128,eaves:122,peak:68,gable:'neck',brick:'#AA4C2A',dk:'#8A3B21'},
 {x:1236,w:164,eaves:106,peak:56,gable:'step',brick:'#BC5836',dk:'#9A4227'},
];
const SLtopX=912, SLbotX=560;

const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
 <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky1}"/><stop offset="0.72" stop-color="${C.sky2}"/><stop offset="1" stop-color="#FFF8F0"/></linearGradient>
 <radialGradient id="sunG" cx="90%" cy="20%" r="55%"><stop offset="0" stop-color="rgba(255,214,130,.7)"/><stop offset="1" stop-color="rgba(255,214,130,0)"/></radialGradient>
 <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.paveSunHi}"/><stop offset="1" stop-color="${C.paveSun}"/></linearGradient>
 <clipPath id="ground"><rect x="0" y="${GY}" width="${W}" height="${H-GY}"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/><rect width="${W}" height="${H}" fill="url(#sunG)"/>
<g>${(function(){let r='';for(let i=0;i<12;i++){const a=i/12*Math.PI*2,x1=1300+Math.cos(a)*60,y1=64+Math.sin(a)*60,x2=1300+Math.cos(a)*82,y2=64+Math.sin(a)*82;r+=`<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="#FFDE9A" stroke-width="4" stroke-linecap="round" opacity=".6"/>`;}return r;})()}</g>
<circle cx="1300" cy="64" r="50" fill="#FFE7A6"/><circle cx="1300" cy="64" r="40" fill="${C.sun}"/>

<rect x="0" y="${GY-22}" width="${W}" height="12" fill="${C.water}"/><rect x="0" y="${GY-10}" width="${W}" height="10" fill="#C9A56E"/>
<g><circle cx="120" cy="150" r="56" fill="#B7B45E"/><circle cx="80" cy="178" r="38" fill="#9FA24E"/><circle cx="158" cy="180" r="36" fill="#A7AC55"/><rect x="116" y="196" width="9" height="56" fill="${C.cocoa}"/></g>

${houses.map(house).join('')}
<rect x="876" y="${GY-40}" width="524" height="40" fill="#2A1810"/>
${(function(){let s='';for(let i=0;i<18;i++)s+=`<rect x="${878+i*29}" y="${GY-58}" width="29" height="18" fill="${i%2?C.awnB:C.awnA}"/>`;return s;})()}
<rect x="900" y="${GY-34}" width="90" height="34" rx="3" fill="#20130C"/><rect x="1330" y="${GY-34}" width="30" height="34" rx="3" fill="${C.cocoa}"/>

<rect x="0" y="${GY}" width="${W}" height="${H-GY}" fill="${C.paveShade}"/>
<g clip-path="url(#ground)"><rect x="720" y="${GY}" width="700" height="${H-GY}" fill="${C.paveShadeDk}"/></g>
<polygon points="0,${GY} ${SLtopX},${GY} ${SLbotX},${H} 0,${H}" fill="url(#pv)"/>
<polygon points="${SLtopX},${GY} ${SLtopX-11},${GY} ${SLbotX-11},${H} ${SLbotX},${H}" fill="#FFF0C0" opacity=".5"/>

${chair(1050,GY+70,0.8)}${table(1020,GY+50,false,0.8)}${chair(990,GY+70,0.8)}

${parasol(360,GY+72)}
${group(360,GY+72,[C.burnt,C.mustard,C.terra,C.cocoa],0.82)}
${group(180,GY+140,[C.terra,C.burnt,C.mustard,C.cocoa],0.82)}

<g stroke="${C.ink}" stroke-width="4" fill="none" opacity=".8"><circle cx="1180" cy="${GY+95}" r="22"/><circle cx="1244" cy="${GY+95}" r="22"/><path d="M1180 ${GY+95} L1212 ${GY+62} L1244 ${GY+95} M1212 ${GY+62} L1198 ${GY+95}"/><path d="M1198 ${GY+60} h30"/></g>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(OUT);
const svg2=svg.replace(`width="${W}" height="${H}"`,`width="${W*2}" height="${H*2}"`);
await sharp(Buffer.from(svg2)).webp({quality:88}).toFile(WEBP);
console.log('rendered '+OUT+' + docs/assets/terrace-hero.webp (compact strip '+W+'x'+H+')');
