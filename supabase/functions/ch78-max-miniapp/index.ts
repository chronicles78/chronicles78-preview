import {createHandler} from './handler.mjs';
import {MAX_ROOT_CA} from '../ch78-max-worker/max-ca.mjs';
const maxClient=Deno.createHttpClient({caCerts:[MAX_ROOT_CA]});
Deno.serve(createHandler({env:(name:string)=>Deno.env.get(name),fetchImpl:(input:RequestInfo|URL,options?:RequestInit)=>{
 const url=input instanceof Request?input.url:String(input);
 return fetch(input,url.startsWith('https://platform-api2.max.ru/')?{...options,client:maxClient}:options);
}}));
