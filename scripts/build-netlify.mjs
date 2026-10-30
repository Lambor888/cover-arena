import {spawnSync} from 'node:child_process';
process.env.VITE_GAME_TRANSPORT='netlify';
const check=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],{stdio:'inherit'});
if(check.status!==0)process.exit(check.status??1);
const {build}=await import('vite');await build();
