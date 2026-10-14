/* Separate browser data and cloud paths; this is a local UI lock, not server authentication. */
window.WorkspaceProfile=(()=>{
 'use strict';
 const SESSION='pf_personal_session_v1',ACTIVE='pf_workspace_active_v1',PREFIX='pf_personal__';
 const SALT='bb75f8134349d3b021adca54843010f6',VERIFIER='82b730d2f305dcbf98fefd10415f9cfd790457a7d47a17398a2ea0081f7302c9';
 function authorized(){try{return /^[a-f0-9]{64}$/.test(localStorage.getItem(SESSION)||'')}catch{return false}}
 let personal=false;
 try{personal=localStorage.getItem(ACTIVE)==='personal'&&authorized()}catch{}
 const mode=personal?'personal':'work';
 const key=name=>personal?PREFIX+name:name;
 const path=name=>personal?name.replace(/^backups\//,'backups/pessoal/'):name;
 const db=name=>personal?name+'-personal':name;
 let switching=false,dialog=null;
 function seedConnection(){
  const target=PREFIX+'pf_github_backup_v1';
  if(localStorage.getItem(target)!==null)return;
  let work={};try{work=JSON.parse(localStorage.getItem('pf_github_backup_v1')||'{}')}catch{return}
  if(work.repo){localStorage.setItem(target,JSON.stringify({repo:work.repo,enabled:work.enabled!==false}));
   const token=localStorage.getItem('pf_github_backup_v1_token')||sessionStorage.getItem('pf_github_backup_v1_token');
   if(token)(localStorage.getItem('pf_github_backup_v1_token')?localStorage:sessionStorage).setItem(PREFIX+'pf_github_backup_v1_token',token);
  }
 }
 async function verify(password){
  const bytes=hex=>Uint8Array.from(hex.match(/../g),x=>parseInt(x,16));
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const derived=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(SALT),iterations:210000,hash:'SHA-256'},material,256));
  const expected=bytes(VERIFIER);let difference=0;for(let i=0;i<expected.length;i++)difference|=derived[i]^expected[i];return difference===0;
 }
 async function prepareSwitch(){
  if(switching)throw new Error('Aguarde a troca de ambiente.');switching=true;
  try{
   await window.WorkspaceAutosave?.suspend();
   window.WorkspaceBackup?.snapshot();
   if(window.WorkspaceAutosave?.state().areas.some(area=>area.busy))throw new Error('Aguarde o salvamento em andamento antes de trocar de ambiente.');
  }catch(error){switching=false;window.WorkspaceAutosave?.resume();throw error}
 }
 function switchPage(){
  // Clear handled unload guards only after all local edits were flushed.
  window.dispatchEvent(new Event('projectflow:workspace-switch'));
  location.reload();
 }
 async function exit(){
  try{await prepareSwitch();localStorage.setItem(ACTIVE,'work');localStorage.removeItem(SESSION);switchPage()}
  catch(error){switching=false;window.WorkspaceAutosave?.resume();alert(error.message)}
 }
 function openLogin(){
  if(personal||switching)return;
  if(!dialog){
   dialog=document.createElement('dialog');dialog.id='personalLoginDialog';dialog.lang='pt-BR';dialog.setAttribute('aria-labelledby','personalLoginTitle');
   dialog.innerHTML='<form><h2 id="personalLoginTitle">Ambiente pessoal</h2><p>Digite sua senha para acessar seus dados pessoais.</p><label>Senha<input type="password" id="personalPassword" autocomplete="current-password" required></label><p id="personalLoginError" role="alert"></p><div><button type="button" id="personalLoginCancel">Cancelar</button><button type="submit" id="personalLoginSubmit">Entrar</button></div></form>';
   document.body.append(dialog);dialog.querySelector('#personalLoginCancel').onclick=()=>dialog.close();
   dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const input=dialog.querySelector('input'),submit=dialog.querySelector('[type=submit]'),error=dialog.querySelector('[role=alert]');submit.disabled=true;error.textContent='';
    try{
     const valid=await verify(input.value);input.value='';
     if(!valid){error.textContent='Senha incorreta.';input.focus();return}
     await prepareSwitch();seedConnection();
     const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
     localStorage.setItem(SESSION,token);localStorage.setItem(ACTIVE,'personal');switchPage();
    }catch(e){switching=false;window.WorkspaceAutosave?.resume();error.textContent=e.message||'Não foi possível abrir o ambiente pessoal.'}
    finally{submit.disabled=false}
   };
  }
  dialog.querySelector('input').value='';dialog.querySelector('[role=alert]').textContent='';dialog.showModal();dialog.querySelector('input').focus();
 }
 function guard(){
  if(personal&&!authorized()){document.documentElement.style.visibility='hidden';switching=true;try{window.WorkspaceBackup?.snapshot()}catch{}switchPage()}
 }
 window.addEventListener('storage',event=>{if(event.key===SESSION)guard()});
 window.addEventListener('pageshow',guard);window.addEventListener('focus',guard);
 document.documentElement.dataset.workspace=mode;
 document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('openPersonal').hidden=personal;document.getElementById('exitPersonal').hidden=!personal;document.getElementById('personalWorkspaceBadge').hidden=!personal;
  document.getElementById('openPersonal').onclick=openLogin;document.getElementById('exitPersonal').onclick=exit;
  if(personal)document.title='ProjectFlow — Pessoal';
 });
 return {personal,mode,key,path,db,isSwitching:()=>switching};
})();
