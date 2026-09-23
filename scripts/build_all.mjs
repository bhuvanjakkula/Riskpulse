import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const riskpulseDist = path.join(root, 'riskpulse', 'dist');
const rootDist = path.join(root, 'dist');

console.log('Running RiskPulse build...');
execSync('node scripts/build.mjs', { cwd: path.join(root, 'riskpulse'), stdio: 'inherit' });

console.log('Copying distribution assets to root dist directory for Vercel...');
fs.mkdirSync(rootDist, { recursive: true });
fs.cpSync(riskpulseDist, rootDist, { recursive: true });
console.log('Build completed successfully!');
