import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
const assets={};for(const name of await readdir('dist')){if(!/\.(html|css|js)$/.test(name))continue;assets['/'+name]={body:await readFile('dist/'+name,'utf8'),type:name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'};}
const service=(await readFile('src/data-service.mjs','utf8')).replaceAll('export ','');
const worker=(await readFile('src/worker.mjs','utf8')).replace(/import[^\n]+\n/,'');
await mkdir('dist/server',{recursive:true});await writeFile('dist/server/index.mjs',`const ASSETS=${JSON.stringify(assets)};\n${service}\n${worker}`);
await writeFile('dist/server/index.js',await readFile('dist/server/index.mjs'));
console.log('Built self-contained Worker with '+Object.keys(assets).length+' embedded assets.');
