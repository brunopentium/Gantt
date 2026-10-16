/* Authenticated chat. Secrets and model tool execution stay in the Worker. */
window.MyDayChat=(()=>{
  'use strict';
  const SERVER='https://projectflow-integration.brunocesardesouza26.workers.dev';
  let dialog,config,accessToken='',expires=0,pending=null,history=[],busy=false,blockedSync=false,popup=null,loginTransaction=null,lastFocus=null;
  const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e};
  const find=id=>dialog.querySelector('#'+id);
  const fmt=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):String(value??'')||'Sem valor';
  const logged=()=>!!accessToken&&Date.now()<expires;
  const adapters=()=>({todo:window.TodoCloud,plans:window.PlanCloud,schedules:window.GanttBackup});
  function status(message,error=false){find('mdChatStatus').textContent=message;find('mdChatStatus').classList.toggle('is-error',error)}
  function controls(){
    find('mdChatLogin').hidden=logged();find('mdChatLogout').hidden=!logged();
    find('mdChatSend').disabled=busy||!logged()||!config?.enabled||window.WorkspaceProfile.personal||blockedSync;
    find('mdChatInput').disabled=busy||blockedSync;
    find('mdChatLogin').disabled=busy||!config?.clientId;
    find('mdChatApply').disabled=busy||!pending||blockedSync;
    find('mdChatDiscard').disabled=busy;find('mdChatClose').disabled=busy;
    find('mdChatReload').hidden=!blockedSync;find('mdChatReload').disabled=busy;
    find('mdChatDraft').hidden=!pending;
  }
  async function request(path,body,{auth=true,timeout=120000}={}){
    if(auth&&!logged()){accessToken='';controls();throw new Error('Entre no chat para continuar.');}
    let response;
    try{response=await fetch(SERVER+path,{method:body===undefined?'GET':'POST',credentials:'omit',redirect:'error',cache:'no-store',
      signal:AbortSignal.timeout(timeout),headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(auth?{Authorization:'Bearer '+accessToken}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});}
    catch{throw new Error('A conexão não confirmou o resultado. Confira o estado atual antes de repetir uma alteração.');}
    let data;try{data=await response.json()}catch{throw new Error('O servidor não retornou uma resposta válida.');}
    if(!response.ok){if(response.status===401){accessToken='';controls()}throw new Error(data.error?.message||'Não foi possível concluir o pedido.');}
    return data;
  }
  function append(role,text){const e=node('div','md-chat-message md-chat-'+role);e.append(node('span','md-chat-role',role==='user'?'Você':'Assistente ProjectFlow'),node('div','md-chat-text',text));find('mdChatMessages').append(e);e.scrollIntoView({block:'nearest'});}
  function showDraft(draft){
    pending=draft;const list=find('mdChatChanges');list.replaceChildren();
    if(draft){
      find('mdChatDraftTitle').textContent=draft.changes.length+' '+(draft.changes.length===1?'item para alterar':'itens para alterar');
      for(const change of draft.changes){const item=node('li');item.append(node('strong','',change.title));
        item.append(node('div','md-chat-context',change.planTitle|| (change.area==='todo'?'Tarefas':'Plano de ação')));
        for(const field of change.fields)item.append(node('div','md-chat-field',field.label+': '+(change.created?'':fmt(field.before)+' → ')+fmt(field.after)));
        list.append(item);
      }
    }
    controls();
  }
  async function send(event){
    event.preventDefault();if(busy||blockedSync||!config?.enabled||window.WorkspaceProfile.personal)return;
    if(!logged()){controls();status('Sua sessão expirou. Entre novamente para continuar.',true);return;}
    const field=find('mdChatInput'),text=field.value.trim();if(!text)return;
    showDraft(null);append('user',text);history.push({role:'user',content:text});field.value='';busy=true;controls();status('Consultando seus dados salvos…');
    try{
      const result=await request('/chat',{workspace:'work',day:window.MyDay.date(),messages:history.slice(-15)});
      append('assistant',result.reply);history.push({role:'assistant',content:result.reply});history=history.slice(-14);showDraft(result.draft);
      status(result.draft?'Revise as mudanças e toque em Aplicar.':'Consulta concluída.');
    }catch(error){history.pop();append('assistant',error.message);status(error.message,true);field.value=text;}
    finally{busy=false;controls();field.focus();}
  }
  function assertClean(){
    window.MyDayData.flush();
    const areas=Object.entries(adapters()).map(([area,a])=>({area,...a.state()}));
    if(areas.some(a=>a.busy))throw new Error('Aguarde a sincronização em andamento.');
    if(areas.some(a=>!a.connected||!a.ready||a.blocked))throw new Error('Conecte e carregue as três áreas do GitHub antes de aplicar pelo chat.');
    if(areas.some(a=>a.repo!==config.repository))throw new Error('O chat e o aplicativo estão conectados a repositórios diferentes.');
    if(areas.some(a=>a.dirty))throw new Error('Há edições locais pendentes. Salve no GitHub antes de aplicar esta proposta.');
  }
  async function synchronize(results){
    for(const area of [...new Set(results.map(r=>r.area))]){
      const result=await adapters()[area]?.refreshRemote();
      if(!result?.ok||result.pending)throw new Error('A alteração foi salva, mas a tela ainda não carregou a versão atual. Use Atualizar após salvamento.');
    }
    window.MyDay.refresh();window.WorkspaceAutosave.refresh();
  }
  async function apply(){
    if(busy||!pending||blockedSync)return;
    busy=true;controls();let suspended=false,sent=false,confirmed=false;const token=pending.token;
    try{
      await window.WorkspaceAutosave.suspend();suspended=true;assertClean();
      status('Aplicando as alterações revisadas…');sent=true;
      const result=await request('/chat/apply',{token});confirmed=true;showDraft(null);
      const saved=result.results||[];
      if(saved.length){blockedSync=true;dialog.dataset.savedAreas=JSON.stringify(saved);await synchronize(saved);blockedSync=false;delete dialog.dataset.savedAreas;}
      if(!result.saved)throw new Error((result.partial?'Parte das alterações foi salva. ':'Nenhum salvamento completo foi confirmado. ')+(result.error?.message||result.message||''));
      const message=result.changed+' '+(result.changed===1?'item atualizado':'itens atualizados')+' no GitHub e no Meu Dia.';
      append('assistant',message);history.push({role:'assistant',content:message});status(message);
    }catch(error){
      if(sent&&!confirmed){showDraft(null);blockedSync=true;dialog.dataset.savedAreas=JSON.stringify([{area:'todo'},{area:'plans'}]);}
      status(error.message,true);append('assistant',error.message);
    }finally{if(suspended)window.WorkspaceAutosave.resume();busy=false;controls();}
  }
  async function reload(){
    if(busy)return;busy=true;controls();let suspended=false;
    try{await window.WorkspaceAutosave.suspend();suspended=true;assertClean();await synchronize(JSON.parse(dialog.dataset.savedAreas||'[]'));blockedSync=false;delete dialog.dataset.savedAreas;status('Tela atualizada. Confira os itens antes de fazer outro pedido.');}
    catch(error){status(error.message,true)}finally{if(suspended)window.WorkspaceAutosave.resume();busy=false;controls()}
  }
  const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
  async function login(){
    if(busy||!config?.clientId)return;
    popup=window.open('about:blank','projectflow-chat-login','width=520,height=720');
    if(!popup){status('Permita abrir a janela de login para entrar no chat.',true);return;}
    const transaction={state:random(),verifier:random(),started:Date.now()};loginTransaction=transaction;busy=true;controls();status('Conclua o login na janela aberta.');
    try{
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(transaction.verifier));
      const challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const url=new URL('/authorize',config.issuer);
      url.search=new URLSearchParams({client_id:config.clientId,response_type:'code',redirect_uri:config.redirectUri,
        audience:config.audience,scope:'openid projectflow:read projectflow:write',state:transaction.state,code_challenge:challenge,code_challenge_method:'S256'});
      popup.location=url.href;
      const timer=setInterval(()=>{if(loginTransaction!==transaction||popup?.closed||Date.now()-transaction.started>300000){clearInterval(timer);if(loginTransaction===transaction){loginTransaction=null;busy=false;controls();status('Login encerrado. Clique em Entrar para tentar novamente.')}}},500);
    }catch(error){loginTransaction=null;popup.close();busy=false;controls();status('Não foi possível abrir o login.',true);}
  }
  async function receiveLogin(event){
    if(event.origin!==SERVER||event.source!==popup||event.data?.type!=='projectflow-chat-auth'||!loginTransaction||event.data.state!==loginTransaction.state)return;
    const transaction=loginTransaction;loginTransaction=null;
    try{
      if(event.data.error||!event.data.code)throw new Error('Não foi possível concluir o login.');
      const token=await request('/chat/token',{code:event.data.code,verifier:transaction.verifier},{auth:false,timeout:25000});
      accessToken=token.access_token;expires=Date.now()+Math.max(0,token.expires_in-60)*1000;
      status(config.enabled?'Conectado. Como posso ajudar?':'Login pronto. Falta configurar a chave OpenRouter no servidor.');
    }catch(error){status(error.message,true)}finally{popup?.close();popup=null;busy=false;controls()}
  }
  function close(){if(busy)return;dialog.close();lastFocus?.focus();}
  function init(){
    if(dialog)return;
    dialog=node('dialog','md-chat');dialog.id='mdChatPanel';dialog.setAttribute('aria-labelledby','mdChatTitle');
    dialog.innerHTML='<header class="md-chat-header"><div><h2 id="mdChatTitle">Assistente ProjectFlow</h2><p>Seu dia, organizado em uma conversa</p></div><button type="button" id="mdChatClose" aria-label="Fechar chat">×</button></header><div class="md-chat-connection"><span id="mdChatStatus" role="status">Conectando…</span><button type="button" id="mdChatLogin">Entrar</button><button type="button" id="mdChatLogout" hidden>Sair</button></div><div class="md-chat-scroll"><div id="mdChatMessages" role="log" aria-label="Conversa"></div><section id="mdChatDraft" class="md-chat-draft" hidden><h3 id="mdChatDraftTitle"></h3><ul id="mdChatChanges"></ul><div class="md-chat-draft-actions"><button type="button" id="mdChatDiscard">Descartar</button><button type="button" id="mdChatApply">Aplicar alterações</button></div></section></div><button type="button" id="mdChatReload" hidden>Atualizar após salvamento</button><form id="mdChatForm" class="md-chat-composer"><label class="sr-only" for="mdChatInput">Seu pedido</label><textarea id="mdChatInput" rows="3" maxlength="8000" placeholder="Ex.: passe a tarefa da roda fônica para segunda-feira" required></textarea><button id="mdChatSend" type="submit">Enviar</button><small>Trabalho · Consulta a última versão salva no GitHub</small></form>';
    document.body.append(dialog);find('mdChatClose').onclick=close;find('mdChatLogin').onclick=login;
    find('mdChatLogout').onclick=()=>{accessToken='';expires=0;showDraft(null);controls();status('Desconectado do chat.');};
    find('mdChatForm').onsubmit=send;find('mdChatApply').onclick=apply;find('mdChatDiscard').onclick=()=>{showDraft(null);status('Proposta descartada.');};find('mdChatReload').onclick=reload;
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();else lastFocus?.focus()});window.addEventListener('message',receiveLogin);
    window.addEventListener('projectflow:workspace-switch',()=>{accessToken='';history=[];loginTransaction=null;popup?.close();dialog.close()});
    append('assistant','Posso consultar suas tarefas, ações e cronogramas e preparar alterações para você revisar. O que vamos organizar?');
    request('/chat/config',undefined,{auth:false,timeout:15000}).then(value=>{config=value;status(window.WorkspaceProfile.personal?'Esta versão do chat está disponível em Trabalho.':value.enabled?'Entre para conversar sobre seu dia.':'Falta configurar a chave OpenRouter no servidor.');controls()}).catch(error=>{status(error.message,true);controls()});controls();
  }
  function open(){init();lastFocus=document.activeElement;dialog.showModal();controls();find(logged()?'mdChatInput':'mdChatLogin').focus();}
  return {init,open,close};
})();
