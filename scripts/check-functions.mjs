import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
// Windows on some volumes returns EISDIR for readlink on regular files.
// Normalize that documented non-symlink case for NFT's file tracer only.
import fsp from 'node:fs/promises';
if(process.platform==='win32'){const readlink=fsp.readlink.bind(fsp);fsp.readlink=async(...args)=>{try{return await readlink(...args);}catch(error){if(error.code==='EISDIR'&&!(await fsp.lstat(args[0])).isSymbolicLink())error.code='EINVAL';throw error;}};}
const {zipFunctions}=await import('@netlify/zip-it-and-ship-it');
await mkdir('release-check/functions',{recursive:true});
const functions=await zipFunctions('netlify/functions','release-check/functions',{basePath:process.cwd(),repositoryRoot:process.cwd(),config:{'*':{nodeBundler:'esbuild',nodeVersion:'22'}},manifest:resolve('release-check/function-manifest.json')});
if(functions.length!==1||functions[0].name!=='game')throw new Error('Expected exactly one game function');
await writeFile('release-check/function-result.json',JSON.stringify(functions,null,2));
console.log(JSON.stringify(functions.map(f=>({name:f.name,path:f.path,runtime:f.runtime,runtimeAPIVersion:f.runtimeAPIVersion})),null,2));
