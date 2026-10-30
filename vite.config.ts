import {defineConfig} from 'vite';
import {attachGameServer} from './server/network';
export default defineConfig({plugins:[{name:'arena-server',configureServer(server){if(server.httpServer){const close=attachGameServer(server.httpServer as import('node:http').Server);server.httpServer.once('close',close);}},configurePreviewServer(server){const close=attachGameServer(server.httpServer as import('node:http').Server);server.httpServer.once('close',close);}}]});

