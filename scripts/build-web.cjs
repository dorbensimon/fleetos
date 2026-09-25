#!/usr/bin/env node
// Builds the web version into dist/ for Netlify.
// Netlify never publishes folders named node_modules, but `expo export` puts
// fonts and icon fonts under dist/assets/node_modules — without them the app
// waits for fonts forever. So after exporting, move that folder to
// dist/assets/vendor and point every reference at the new path.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
execSync('npx expo export --platform web', { cwd: root, stdio: 'inherit' });

const from = path.join(dist, 'assets', 'node_modules');
const to = path.join(dist, 'assets', 'vendor');
if (fs.existsSync(from)) {
  fs.renameSync(from, to);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(js|html|css|json)$/.test(entry.name)) {
        const text = fs.readFileSync(file, 'utf8');
        if (text.includes('assets/node_modules')) {
          fs.writeFileSync(file, text.split('assets/node_modules').join('assets/vendor'));
        }
      }
    }
  };
  walk(dist);
}

const indexFile = path.join(dist, 'index.html');
const html = fs.readFileSync(indexFile, 'utf8');
fs.writeFileSync(indexFile, html.split('%WEB_TITLE%').join('icar'));
