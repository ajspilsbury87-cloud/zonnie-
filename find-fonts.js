const fs = require('fs');
const path = require('path');
const root = 'C:\\Users\\andys\\OneDrive\\Documents\\SunBae_Claude\\SunBae\\node_modules';
const want = ['Fraunces_700Bold.ttf','Fraunces_600SemiBold.ttf','Fraunces_500Medium.ttf','Fraunces_500Medium_Italic.ttf','Fraunces_700Bold_Italic.ttf','Inter_400Regular.ttf','Inter_500Medium.ttf','Inter_600SemiBold.ttf','Inter_700Bold.ttf'];
const found = {};
function walk(dir, depth) {
  if (depth > 6) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' && depth > 0) continue; // avoid deep nesting blowups
      walk(fp, depth + 1);
    } else if (want.includes(e.name) && !found[e.name]) {
      found[e.name] = fp;
    }
  }
}
// search both .pnpm and top-level
walk(path.join(root, '.pnpm'), 0);
walk(path.join(root, '@expo-google-fonts'), 0);
fs.writeFileSync('C:\\Users\\andys\\OneDrive\\Documents\\SunBae_Claude\\SunBae\\font-paths.json', JSON.stringify(found, null, 2));
console.log(JSON.stringify(found, null, 2));
