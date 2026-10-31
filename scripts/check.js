// Syntaxkontroll av alla JavaScript-filer (fungerar på både Windows och Linux).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
}

for (const file of walk(path.join(__dirname, '..', 'src'))) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log('Alla filer ok.');
