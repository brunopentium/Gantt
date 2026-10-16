/* Authenticated chat. Secrets and model tool execution stay in the Worker. */
window.MyDayChat=(()=>{
  'use strict';
  const SERVER='https://projectflow-integration.brunocesardesouza26.workers.dev';
  const WORKSPACE=window.WorkspaceProfile.personal?'personal':'work',WORKSPACE_LABEL=WORKSPACE==='personal'?'Pessoal':'Trabalho';
  let workspaceActive=true;
  const workspaceAllowed=()=>workspaceActive&&(config?.workspaces||['work']).includes(WORKSPACE);
  const MODEL_KEY='projectflow:chat:model:v1';
  let selectedModel='',modelSaved=true;
  try{selectedModel=localStorage.getItem(MODEL_KEY)||'';}catch{modelSaved=false;}
  let dialog,config,accessToken='',expires=0,pending=null,history=[],busy=false,blockedSync=false,popup=null,loginTransaction=null,lastFocus=null,connectionArea='';
  const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e};
  const find=id=>dialog.querySelector('#'+id);
  const fmt=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):(value&&typeof value==='object'?JSON.stringify(value,null,2):String(value??''))||'Sem valor';
  const logged=()=>!!accessToken&&Date.now()<expires;
  const adapters=()=>({todo:window.TodoCloud,plans:window.PlanCloud,schedules:window.GanttBackup});
  const areaLabels={todo:'Tarefas',plans:'Planos de ação',schedules:'Cronogramas'};
  function status(message,error=false){find('mdChatStatus').textContent=message;find('mdChatStatus').classList.toggle('is-error',error)}
  function controls(){
    find('mdChatLogin').hidden=logged();find('mdChatLogout').hidden=!logged();
    find('mdChatSend').disabled=busy||!logged()||!config?.enabled||!config?.models?.some(m=>m.id===selectedModel)||!workspaceAllowed()||blockedSync;
    find('mdChatInput').disabled=busy||blockedSync;
    find('mdChatModel').disabled=busy||!config?.models?.length;
    find('mdChatLogin').disabled=busy||!config?.clientId;
    find('mdChatApply').disabled=busy||!pending||!workspaceAllowed()||blockedSync;
    find('mdChatDiscard').disabled=busy;find('mdChatClose').disabled=busy;
    find('mdChatReload').hidden=!blockedSync;find('mdChatReload').disabled=busy;
    find('mdChatConnect').hidden=!connectionArea;find('mdChatConnect').disabled=busy;
    find('mdChatConnect').textContent='Configurar GitHub de '+(areaLabels[connectionArea]||'Tarefas');
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
  function modelHint(){const model=config?.models?.find(m=>m.id===selectedModel);find('mdChatModelHint').textContent=!model?'O modelo salvo não está disponível. Selecione outro para continuar.':(model.free?'Gratuito · sujeito a limites e disponibilidade.':'Pago · usa os créditos da sua OpenRouter.')+(modelSaved?' Escolha salva neste navegador.':' Escolha válida só nesta sessão; o navegador bloqueou o armazenamento.');}
  function setupModels(){
    const select=find('mdChatModel');select.replaceChildren();
    if(!config.models?.length)config.models=[{id:config.model||'openai/gpt-6-luna',name:config.model||'GPT-6 Luna',free:false}];
    for(const free of [false,true]){const group=node('optgroup');group.label=free?'Gratuitos':'Pagos';
      for(const model of config.models.filter(m=>m.free===free)){const option=node('option','',model.name);option.value=model.id;group.append(option);}
      if(group.children.length)select.append(group);
    }
    if(!selectedModel)selectedModel=config.model||config.models[0].id;
    if(!config.models.some(m=>m.id===selectedModel)){const unavailable=node('option','','Modelo salvo indisponível — escolha outro');unavailable.value=selectedModel;unavailable.disabled=true;select.append(unavailable);}
    select.value=selectedModel;modelHint();
    select.onchange=()=>{if(busy){select.value=selectedModel;return;}selectedModel=select.value;try{localStorage.setItem(MODEL_KEY,selectedModel);modelSaved=true;}catch{modelSaved=false;}modelHint();controls();};
  }
  function append(role,text){const e=node('div','md-chat-message md-chat-'+role),content=node('div','md-chat-text');if(role==='assistant')window.MyDayChatFormat.render(content,text);else content.textContent=text;e.append(node('span','md-chat-role',role==='user'?'Você':'Assistente ProjectFlow'),content);find('mdChatMessages').append(e);e.scrollIntoView({block:'nearest'});}
  function showDraft(draft){
    pending=draft;connectionArea='';const list=find('mdChatChanges');list.replaceChildren();
    if(draft){
      find('mdChatDraftTitle').textContent=draft.changes.length+' '+(draft.changes.length===1?'item para alterar':'itens para alterar')+' em '+WORKSPACE_LABEL;
      for(const change of draft.changes){const item=node('li');item.append(node('strong','',change.title));
        item.append(node('div','md-chat-context',change.kind==='task-project'?'Projetos de tarefas':change.planTitle|| ({'action-plan':'Plano de ação','schedule-summary':'Grupo de atividades',schedule:'Cronograma','schedule-group':'Grupo de cronogramas'}[change.kind]||areaLabels[change.area])));
        for(const field of change.fields)item.append(node('div','md-chat-field',field.label+': '+(change.created?'':fmt(field.before)+' → ')+fmt(field.after)));
        list.append(item);
      }
    }
    controls();
  }
  async function send(event){
    event.preventDefault();if(busy||blockedSync||!config?.enabled||!config.models?.some(m=>m.id===selectedModel)||!workspaceAllowed())return;
    if(!logged()){controls();status('Sua sessão expirou. Entre novamente para continuar.',true);return;}
    const field=find('mdChatInput'),text=field.value.trim();if(!text)return;
    showDraft(null);append('user',text);history.push({role:'user',content:text});field.value='';busy=true;controls();status('Consultando seus dados salvos…');
    try{
      const result=await request('/chat',{workspace:WORKSPACE,day:window.MyDay.date(),model:selectedModel,messages:history.slice(-15)});
      if(!workspaceActive)return;
      if(result.workspace!==WORKSPACE)throw new Error('A resposta pertence a outro ambiente. Faça o pedido novamente no ambiente atual.');
      append('assistant',result.reply);history.push({role:'assistant',content:result.reply});history=history.slice(-14);showDraft(result.draft);
      status(result.draft?'Revise as mudanças e toque em Aplicar.':'Consulta concluída.');
    }catch(error){if(!workspaceActive)return;history.pop();append('assistant',error.message);status(error.message,true);field.value=text;}
    finally{busy=false;controls();if(dialog.open&&(document.activeElement===document.body||dialog.contains(document.activeElement)))field.focus();}
  }
  function assertClean(required){
    window.MyDayData.flush();
    connectionArea='';
    const all=Object.entries(adapters()).map(([area,a])=>({area,...a.state()}));
    if(!required.length||required.some(area=>!Object.hasOwn(areaLabels,area)))throw new Error('A proposta contém uma área inválida. Faça o pedido novamente.');
    const areas=all.filter(a=>required.includes(a.area));
    if(all.some(a=>a.busy))throw new Error('Aguarde a sincronização em andamento.');
    const missing=areas.find(a=>!a.connected||!a.ready||a.blocked);
    if(missing){connectionArea=missing.area;throw new Error('Conecte e carregue '+areaLabels[missing.area]+' do GitHub antes de aplicar. Configure a conexão neste navegador.');}
    if(areas.some(a=>a.repo!==config.repository))throw new Error('O chat e o aplicativo estão conectados a repositórios diferentes.');
    if(areas.some(a=>a.dirty))throw new Error('Há edições locais pendentes. Salve no GitHub antes de aplicar esta proposta.');
    if(required.includes('schedules')&&window.PlanCloud.state().linkedDirty)throw new Error('Salve as edições das ações vinculadas antes de alterar o cronograma pelo chat.');
  }
  async function synchronize(results){
    for(const area of [...new Set(results.map(r=>r.area))]){
      const result=await adapters()[area]?.refreshRemote();
      if(!result?.ok||result.pending)throw new Error('A alteração foi salva, mas a tela ainda não carregou a versão atual. Use Atualizar após salvamento.');
    }
    window.MyDay.refresh();window.WorkspaceAutosave.refresh();
  }
  async function apply(){
    if(busy||!pending||blockedSync||!workspaceAllowed())return;
    busy=true;controls();let suspended=false,sent=false,confirmed=false,unlock=()=>{};const token=pending.token,required=[...new Set(pending.changes.map(c=>c.area))];
    try{
      await window.WorkspaceAutosave.suspend();suspended=true;assertClean(required);unlock=lockApp();
      status('Aplicando as alterações revisadas…');sent=true;
      const result=await request('/chat/apply',{token,workspace:WORKSPACE});confirmed=true;showDraft(null);if(!workspaceActive)return;
      const saved=result.results||[];
      if(saved.length){blockedSync=true;dialog.dataset.savedAreas=JSON.stringify(saved);await synchronize(saved);blockedSync=false;delete dialog.dataset.savedAreas;}
      if(!result.saved)throw new Error((result.partial?'Parte das alterações foi salva. ':'Nenhum salvamento completo foi confirmado. ')+(result.error?.message||result.message||''));
      const message=result.changed+' '+(result.changed===1?'item atualizado':'itens atualizados')+' no GitHub e no Meu Dia.';
      append('assistant',message);history.push({role:'assistant',content:message});status(message);
    }catch(error){
      if(sent&&!confirmed){showDraft(null);blockedSync=true;dialog.dataset.savedAreas=JSON.stringify(required.map(area=>({area})));}
      status(error.message,true);append('assistant',error.message);
    }finally{unlock();if(suspended)window.WorkspaceAutosave.resume();busy=false;controls();}
  }
  async function reload(){
    if(busy||!workspaceAllowed())return;busy=true;controls();let suspended=false,unlock=()=>{};
    try{await window.WorkspaceAutosave.suspend();suspended=true;const saved=JSON.parse(dialog.dataset.savedAreas||'[]');assertClean(saved.map(r=>r.area));unlock=lockApp();await synchronize(saved);blockedSync=false;delete dialog.dataset.savedAreas;status('Tela atualizada. Confira os itens antes de fazer outro pedido.');}
    catch(error){status(error.message,true)}finally{unlock();if(suspended)window.WorkspaceAutosave.resume();busy=false;controls()}
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
        audience:config.audience,scope:'projectflow:read projectflow:write',state:transaction.state,code_challenge:challenge,code_challenge_method:'S256'});
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
      status(!workspaceAllowed()?'O ambiente '+WORKSPACE_LABEL+' não está habilitado no servidor.':config.enabled?'Conectado ao ambiente '+WORKSPACE_LABEL+'. Como posso ajudar?':'Login pronto. Falta configurar a chave OpenRouter no servidor.');
    }catch(error){status(error.message,true)}finally{popup?.close();popup=null;busy=false;controls()}
  }
  function lockApp(){const app=document.getElementById('app');if(!app)return()=>{};const previous=app.inert;app.inert=true;return()=>{app.inert=previous};}
  function hide(){dialog.close();document.body.classList.toggle('md-chat-open',false);}
  function close(){if(busy)return;hide();if(lastFocus?.isConnected&&lastFocus.getClientRects().length)lastFocus.focus();}
  function init(){
    if(dialog)return;
    dialog=node('dialog','md-chat');dialog.id='mdChatPanel';dialog.setAttribute('aria-labelledby','mdChatTitle');
    dialog.innerHTML='<header class="md-chat-header"><div><h2 id="mdChatTitle">Assistente ProjectFlow</h2><p>Seu dia, organizado em uma conversa</p></div><button type="button" id="mdChatClose" aria-label="Fechar chat">×</button></header><div class="md-chat-connection"><span id="mdChatStatus" role="status">Conectando…</span><button type="button" id="mdChatLogin">Entrar</button><button type="button" id="mdChatLogout" hidden>Sair</button></div><div class="md-chat-model"><label for="mdChatModel">Modelo</label><select id="mdChatModel" aria-describedby="mdChatModelHint"></select><small id="mdChatModelHint">Carregando modelos…</small></div><div class="md-chat-scroll"><div id="mdChatMessages" role="log" aria-label="Conversa"></div><section id="mdChatDraft" class="md-chat-draft" hidden><h3 id="mdChatDraftTitle"></h3><ul id="mdChatChanges"></ul><div class="md-chat-draft-actions"><button type="button" id="mdChatDiscard">Descartar</button><button type="button" id="mdChatApply">Aplicar alterações</button></div></section></div><button type="button" id="mdChatReload" hidden>Atualizar após salvamento</button><button type="button" id="mdChatConnect" hidden>Configurar GitHub de Tarefas</button><form id="mdChatForm" class="md-chat-composer"><label class="sr-only" for="mdChatInput">Seu pedido</label><textarea id="mdChatInput" rows="3" maxlength="8000" placeholder="Ex.: passe a tarefa da roda fônica para segunda-feira" required></textarea><button id="mdChatSend" type="submit">Enviar</button><small><span id="mdChatWorkspace"></span> · Enter quebra a linha · Shift + Enter envia</small></form>';
    document.body.append(dialog);find('mdChatClose').onclick=close;find('mdChatLogin').onclick=login;
    find('mdChatLogout').onclick=()=>{accessToken='';expires=0;showDraft(null);controls();status('Desconectado do chat.');};
    find('mdChatForm').onsubmit=send;find('mdChatInput').onkeydown=event=>{if(event.key==='Enter'&&event.shiftKey&&!event.isComposing){event.preventDefault();if(!event.repeat&&!find('mdChatSend').disabled)find('mdChatForm').requestSubmit();}};find('mdChatApply').onclick=apply;find('mdChatDiscard').onclick=()=>{showDraft(null);status('Proposta descartada.');};find('mdChatReload').onclick=reload;
    find('mdChatConnect').onclick=()=>{if(busy||!connectionArea)return;const area=connectionArea;close();document.getElementById({todo:'tabTodoNative',plans:'tabActions',schedules:'tabGantt'}[area])?.click();document.getElementById({todo:'ntCloudSettings',plans:'apCloudSettings',schedules:'btnCloudBackup'}[area])?.click();};
    dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();close();}});window.addEventListener('message',receiveLogin);
    window.addEventListener('projectflow:workspace-switch',()=>{workspaceActive=false;accessToken='';expires=0;history=[];showDraft(null);loginTransaction=null;popup?.close();hide();controls()});
    append('assistant','Posso consultar suas tarefas, ações e cronogramas e preparar alterações para você revisar. O que vamos organizar?');
    find('mdChatWorkspace').textContent=WORKSPACE_LABEL;
    request('/chat/config',undefined,{auth:false,timeout:15000}).then(value=>{config=value;setupModels();status(!workspaceAllowed()?'O ambiente '+WORKSPACE_LABEL+' não está habilitado no servidor.':value.enabled?'Entre para conversar sobre seus dados de '+WORKSPACE_LABEL+'.':'Falta configurar a chave OpenRouter no servidor.');controls()}).catch(error=>{status(error.message,true);controls()});controls();
  }
  function open(){init();lastFocus=document.activeElement;if(!dialog.open)dialog.show();document.body.classList.toggle('md-chat-open',true);controls();find(logged()?'mdChatInput':'mdChatLogin').focus();}
  return {init,open,close};
})();
