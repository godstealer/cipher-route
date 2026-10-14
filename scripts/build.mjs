import {cp,mkdir,readFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
if(manifest.manifest_version!==3)throw Error('Manifest V3 required');
await mkdir('dist',{recursive:true});await cp('extension','dist/extension',{recursive:true});
console.log('Load unpacked extension: '+new URL('../dist/extension',import.meta.url).pathname);
