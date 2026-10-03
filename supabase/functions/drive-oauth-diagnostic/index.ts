import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(async()=>{
 const clientId=Deno.env.get("GOOGLE_DRIVE_CLIENT_ID");
 const clientSecret=Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET");
 const refreshToken=Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN");
 if(!clientId||!clientSecret||!refreshToken)return Response.json({ok:false,error:"oauth_secrets_missing",present:{client_id:!!clientId,client_secret:!!clientSecret,refresh_token:!!refreshToken}},{status:200});
 try{
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:"refresh_token"})});
  const j=await r.json();
  return Response.json({ok:r.ok&&!!j?.access_token,http_status:r.status,error:j?.error||null,error_description:j?.error_description||null});
 }catch(e){return Response.json({ok:false,error:"network_error",error_description:String(e)})}
});