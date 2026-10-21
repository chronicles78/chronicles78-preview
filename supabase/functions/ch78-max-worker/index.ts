import {createHandler} from './handler.mjs';
import {MAX_ROOT_CA} from './max-ca.mjs';
// The additional root is used only for the exact MAX origin; TLS stays verified.
const maxClient=Deno.createHttpClient({caCerts:[MAX_ROOT_CA]});
Deno.serve(createHandler({env:(name:string)=>Deno.env.get(name),fetchImpl:(input:RequestInfo|URL,options?:RequestInit)=>{
 const url=input instanceof Request?input.url:String(input);
 return fetch(input,url.startsWith('https://platform-api2.max.ru/')?{...options,client:maxClient}:options);
}}));
