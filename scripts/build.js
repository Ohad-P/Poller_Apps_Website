import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(projectRoot, 'dist');
const assetRoot = path.join(outputRoot, 'assets');
const tableCloseBuild = path.join(projectRoot, 'public', 'apps', 'table-close');
const tableCloseOutput = path.join(outputRoot, 'apps', 'table-close');

await access(path.join(tableCloseBuild, 'index.html'));
await access(path.join(tableCloseBuild, 'service-worker.js'));

await rm(outputRoot, { recursive: true, force: true });
await mkdir(assetRoot, { recursive: true });

const sourceHtml = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
const productionHtml = sourceHtml
  .replace('./src/styles.css', './assets/styles.css')
  .replace('./src/site.js', './assets/site.js');

await writeFile(path.join(outputRoot, 'index.html'), productionHtml);
const source404 = await readFile(path.join(projectRoot, '404.html'), 'utf8');
await writeFile(
  path.join(outputRoot, '404.html'),
  source404.replace('/src/styles.css', '/assets/styles.css'),
);
await cp(path.join(projectRoot, 'public'), outputRoot, { recursive: true });
await cp(path.join(projectRoot, 'src', 'styles.css'), path.join(assetRoot, 'styles.css'));
await cp(path.join(projectRoot, 'src', 'site.js'), path.join(assetRoot, 'site.js'));

console.log(`Built Poller Apps site in ${outputRoot}`);
console.log(`Included versioned Table Close release at ${tableCloseOutput}`);
