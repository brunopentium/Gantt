/* Restore an authorized session and attempt prompt=none SSO without opening windows. */
window.ChatSession=(()=>{
 'use strict';
 function create({workspace,server,onToken,onStatus,exchange,canConnect=()=>true}){
  const key='projectflow:chat:session:v1:'+workspace,pausedKey='projectflow:chat:paused:v1:'+workspace;
  let config=null,frame=null,transaction=null,timer=null,expiryTimer=null,generation=0,lastAttempt=0,stopped=false,current=null;
  const read=k=>{try{return localStorage.getItem(k)}catch{return null}},write=(k,v)=>{try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch{}};
  const realm=()=>JSON.stringify([server,workspace,config.issuer,config.clientId,config.audience]);
  const paused=()=>read(pausedKey)==='true';
  function cancel(){generation++;transaction=null;clearTimeout(timer);timer=null;frame?.remove();frame=null}
  function schedule(){clearTimeout(expiryTimer);if(current&&!stopped&&!paused())expiryTimer=setTimeout(()=>{if(!canConnect()){expiryTimer=setTimeout(schedule,15000);return}current=null;onToken(null);connect()},Math.max(1000,current.expiresAt-Date.now()+1000))}
  function valid(value){return value?.realm===realm()&&typeof value.access_token==='string'&&value.access_token.length>0&&value.access_token.length<=20000&&Number.isFinite(value.expiresAt)&&value.expiresAt>Date.now()&&value.expiresAt<=Date.now()+86400000}
  function restore(){let value;try{value=JSON.parse(read(key)||'null')}catch{}if(valid(value)){current=value;onToken(value);schedule();return true}write(key,null);return false}
  function save(value){cancel();stopped=false;current={realm:realm(),access_token:value.access_token,expiresAt:value.expiresAt};if(!valid(current))throw Error('Sessão de login inválida.');write(pausedKey,null);write(key,JSON.stringify(current));schedule()}
  function clear({pause=false}={}){cancel();clearTimeout(expiryTimer);current=null;write(key,null);write(pausedKey,pause?'true':null)}
  function stop(){stopped=true;cancel();clearTimeout(expiryTimer)}
  const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
  async function connect(){
   if(stopped||!config?.enabled||!config?.clientId||!config.features?.session?.silent||!(config.workspaces||['work']).includes(workspace)||paused()||transaction||!canConnect()||Date.now()-lastAttempt<60000)return;
   if(current&&valid(current))return;lastAttempt=Date.now();const epoch=++generation,t={state:random(),verifier:random(),epoch};transaction=t;onStatus('Reconectando ao assistente em segundo plano…');
   try{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t.verifier));if(transaction!==t||stopped)return;const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const url=new URL('/authorize',config.issuer);url.search=new URLSearchParams({client_id:config.clientId,response_type:'code',redirect_uri:config.redirectUri,audience:config.audience,scope:'projectflow:read projectflow:write',state:t.state,code_challenge:challenge,code_challenge_method:'S256',prompt:'none'});
    frame=document.createElement('iframe');frame.hidden=true;frame.title='Reconexão do assistente';frame.setAttribute('aria-hidden','true');frame.setAttribute('sandbox','allow-scripts allow-same-origin');frame.src=url.href;document.body.append(frame);timer=setTimeout(()=>fail(t),12000);
   }catch{fail(t)}
  }
  function fail(t){if(transaction!==t)return;cancel();onStatus('Entre para conversar. A reconexão silenciosa não ficou disponível neste navegador ou a sessão expirou.')}
  async function receive(event){const t=transaction;if(!t||stopped||event.origin!==server||event.source!==frame?.contentWindow||event.data?.type!=='projectflow-chat-auth'||event.data.state!==t.state)return;if(event.data.error||typeof event.data.code!=='string'||!event.data.code){fail(t);return}if(t.exchanging)return;t.exchanging=true;clearTimeout(timer);timer=setTimeout(()=>fail(t),30000);
   try{const token=await exchange({code:event.data.code,verifier:t.verifier});if(transaction!==t||generation!==t.epoch||stopped||paused())return;const value={access_token:token.access_token,expiresAt:Date.now()+Math.max(0,Math.min(Number(token.expires_in)||0,86400)-60)*1000};save(value);onToken(current)}catch{fail(t)}
  }
  function configure(value){config=value;stopped=false;if(paused())return;if(!restore())connect()}
  function resume(){if(!config||stopped||paused())return;if(current&&valid(current))return;current=null;onToken(null);connect()}
  window.addEventListener('message',receive);window.addEventListener('online',resume);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume()});window.addEventListener('storage',event=>{if(stopped||!config)return;if(event.key===pausedKey&&paused()||event.key===key&&!event.newValue){cancel();clearTimeout(expiryTimer);current=null;onToken(null)}else if(event.key===key&&!paused())restore()});
  return {configure,save,clear,stop,resume};
 }
 return {create};
})();
