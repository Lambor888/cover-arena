import {getStore} from '@netlify/blobs';
import {createHandler,type Store} from '../../server/netlify/handler';
// A single strong-consistency room blob is the commit boundary for both players.
// No timer, process cache, environment variables or client-provided combat state.
export default async function game(request:Request){
 const blobs=getStore({name:'cover-arena-v1',consistency:'strong'});
 const store:Store={
  async read(key){const value=await blobs.getWithMetadata(key,{type:'text',consistency:'strong'});if(value&&!value.etag)throw new Error('Storage read is missing its version tag');return value?{data:value.data as string,etag:value.etag!}:null;},
  async write(key,data,etag){const result=await blobs.set(key,data,etag?{onlyIfMatch:etag}:{onlyIfNew:true});if(result.modified&&!result.etag)throw new Error('Storage did not acknowledge a committed revision');return result.modified;},
 };
 return createHandler(store)(request);
}
