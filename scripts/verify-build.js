import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, 'dist');
await access(path.join(projectRoot, 'wrangler.jsonc'));
const expectedFiles = [
  'index.html',
  '404.html',
  'assets/site.js',
  'assets/styles.css',
  'favicon.svg',
  'poller-symbol.svg',
  'theme-init.js',
  'theme-init.js',
  'social-card.png',
  'robots.txt',
  'sitemap.xml',
  '_headers',
  '_redirects',
  'apps/sogrim/index.html',
  'apps/sogrim/manifest.webmanifest',
  'apps/sogrim/service-worker.js',
  'apps/sogrim/assets/app.js',
  'apps/sogrim/assets/settlement.js',
  'apps/sogrim/assets/styles.css',
];

for (const relativePath of expectedFiles) {
  await access(path.join(outputRoot, relativePath));
}

const homepage = await readFile(path.join(outputRoot, 'index.html'), 'utf8');
if (homepage.includes('./src/')) {
  throw new Error('Production homepage still references source asset paths.');
}
if (!homepage.includes('./apps/sogrim/')) {
  throw new Error('Production homepage does not link to Sogrim.');
}
if (!homepage.includes('./poller-symbol.svg')) {
  throw new Error('Production homepage does not include the Poller emblem.');
}
if (!homepage.includes('./theme-init.js') || !homepage.includes('id="themeToggle"')) {
  throw new Error('Production homepage is missing theme initialization or controls.');
}
if (!homepage.includes('./theme-init.js') || !homepage.includes('id="themeToggle"')) {
  throw new Error('Production homepage is missing theme initialization or controls.');
}
if (/P \/ 01|A \/ 26|Ideas in motion/i.test(homepage)) {
  throw new Error('Production homepage still contains the retired Poller composition.');
}
if (!homepage.includes('Poller Apps') || !homepage.includes('https://pollerapps.com/')) {
  throw new Error('Production homepage is missing the Poller Apps name or canonical domain.');
}

for (const relativePath of ['index.html', '404.html', 'robots.txt', 'sitemap.xml']) {
  const content = await readFile(path.join(outputRoot, relativePath), 'utf8');
  if (/Poller Labs|pollerlabs\.com/i.test(content)) {
    throw new Error(`${relativePath} still contains old Poller Labs branding.`);
  }
}

const sogrimWorker = await readFile(
  path.join(outputRoot, 'apps', 'sogrim', 'service-worker.js'),
  'utf8',
);
if (sogrimWorker.includes('__BUILD_VERSION__')) {
  throw new Error('Sogrim service worker was copied before its production build completed.');
}

const sogrimManifest = JSON.parse(await readFile(
  path.join(outputRoot, 'apps', 'sogrim', 'manifest.webmanifest'),
  'utf8',
));
if (sogrimManifest.id !== '/apps/sogrim/' || !sogrimManifest.name.includes('Sogrim')) {
  throw new Error('Sogrim install metadata has an incorrect identity.');
}

const redirects = await readFile(path.join(outputRoot, '_redirects'), 'utf8');
if (!redirects.includes('/apps/table-close') || !redirects.includes('/apps/sogrim/')) {
  throw new Error('Legacy Table Close URLs do not redirect to Sogrim.');
}

console.log(`Verified ${expectedFiles.length} production files and Sogrim integration.`);
