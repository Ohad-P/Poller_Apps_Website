import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, 'dist');
const expectedFiles = [
  'index.html',
  '404.html',
  'assets/site.js',
  'assets/styles.css',
  'favicon.svg',
  'social-card.png',
  'robots.txt',
  'sitemap.xml',
  '_headers',
  '_redirects',
  'apps/table-close/index.html',
  'apps/table-close/manifest.webmanifest',
  'apps/table-close/service-worker.js',
  'apps/table-close/assets/app.js',
  'apps/table-close/assets/settlement.js',
  'apps/table-close/assets/styles.css',
];

for (const relativePath of expectedFiles) {
  await access(path.join(outputRoot, relativePath));
}

const homepage = await readFile(path.join(outputRoot, 'index.html'), 'utf8');
if (homepage.includes('./src/')) {
  throw new Error('Production homepage still references source asset paths.');
}
if (!homepage.includes('./apps/table-close/')) {
  throw new Error('Production homepage does not link to Table Close.');
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

const tableCloseWorker = await readFile(
  path.join(outputRoot, 'apps', 'table-close', 'service-worker.js'),
  'utf8',
);
if (tableCloseWorker.includes('__BUILD_VERSION__')) {
  throw new Error('Table Close service worker was copied before its production build completed.');
}

console.log(`Verified ${expectedFiles.length} production files and Table Close integration.`);
