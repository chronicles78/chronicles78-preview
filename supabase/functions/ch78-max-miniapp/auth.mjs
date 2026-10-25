const encoder=new TextEncoder();
const bytes=x=>typeof x==='string'?encoder.encode(x):x;
export async function hmac(key,value){
 const k=await crypto.subtle.importKey('raw',bytes(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',k,bytes(value)));
}
export async function validateLaunch(raw,token,now=Date.now()){
 if(typeof raw!=='string'||raw.length<10||raw.length>16384||!token)throw Error('invalid_launch');
 const pairs=[],keys=new Set();
 for(const piece of raw.split('&')){
  const at=piece.indexOf('=');if(at<1)throw Error('invalid_launch');
  let key,value;try{key=decodeURIComponent(piece.slice(0,at));value=decodeURIComponent(piece.slice(at+1));}catch{throw Error('invalid_launch');}
  if(!/^[a-z_]+$/.test(key)||keys.has(key)||/[\r\n]/.test(value))throw Error('invalid_launch');
  keys.add(key);pairs.push([key,value]);
 }
 const params=Object.fromEntries(pairs),hash=params.hash;
 if(!/^[a-f0-9]{64}$/.test(hash??'')||!/^\d{1,12}$/.test(params.auth_date??''))throw Error('invalid_launch');
 const age=Math.floor(now/1000)-Number(params.auth_date);
 if(age>3600||age< -30)throw Error('launch_expired');
 const secret=await hmac('WebAppData',token);
 const actual=await hmac(secret,pairs.filter(([k])=>k!=='hash').sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n'));
 let diff=0;for(let i=0;i<32;i++)diff|=actual[i]^parseInt(hash.slice(i*2,i*2+2),16);
 if(diff)throw Error('invalid_launch');
 let user;try{user=JSON.parse(params.user);}catch{throw Error('invalid_launch');}
 if(!Number.isSafeInteger(user?.id)||user.id<=0||user.is_bot===true)throw Error('invalid_launch');
 return {userId:String(user.id)};
}
