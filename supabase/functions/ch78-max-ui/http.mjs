// Bound streamed API responses before decoding, including chunked bodies.
export async function readJSON(response,max=262144){
 const reader=response.body?.getReader();if(!reader)throw Error('invalid_response');let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('large_response');chunks.push(value);}
 const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));}
 finally{reader.cancel().catch(()=>{});}
}
