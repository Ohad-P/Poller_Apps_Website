import { cp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sogrimRoot = path.resolve(projectRoot, '..', 'Poker_Stattle_App');
const sogrimBuild = path.join(sogrimRoot, 'dist');
const versionedRelease = path.join(projectRoot, 'public', 'apps', 'sogrim');
const legacyRelease = path.join(projectRoot, 'public', 'apps', 'table-close');
const npmCommand = 'npm';

await run(npmCommand, ['run', 'check'], sogrimRoot);
await rm(versionedRelease, { recursive: true, force: true });
await rm(legacyRelease, { recursive: true, force: true });
await cp(sogrimBuild, versionedRelease, { recursive: true });

console.log(`Updated versioned Sogrim release in ${versionedRelease}`);

function run(command, argumentsList, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}
