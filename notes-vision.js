/* Explicit, temporary selection of existing Notes images. Never added to backups/history. */
window.NotesVision=(()=>{
 'use strict';
 let selection=[],active=true,panel,config,busy=false,dialog,previewDialog,previewSequence=0,sequence=0,capturing=false;
 const element=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el};
 const notify=()=>window.dispatchEvent(new Event('projectflow:visionchange'));
 function images(){const data=NotesData.snapshot(),locations=new Map(NotesSearch.scopes(data).map(n=>[n.id,n.path]));return data.nodes.flatMap(p=>(p.objects||[]).filter(o=>o.type==='image').map(o=>({nodeId:p.id,objectId:o.id,assetId:o.assetId,caption:o.caption,path:locations.get(p.id),mime:o.mime,ocr:o.ocr})));}
 function add(nodeId,objectId){
  if(!active||busy)return false;const item=images().find(i=>i.nodeId===nodeId&&i.objectId===objectId);if(!item)throw Error('A imagem não está disponível neste ambiente.');
  if(selection.some(i=>i.assetId===item.assetId))return true;
  if(selection.length>=2)throw Error('Selecione até duas imagens por pergunta. Remova uma antes de adicionar outra.');
  selection.push(item);notify();return true;
 }
 function addCapture(capture){if(!active||busy)return false;if(selection.length>=2)throw Error('Remova uma seleção antes de adicionar a captura.');const page=NotesData.snapshot().nodes.find(n=>n.id===capture.nodeId);if(!page||JSON.stringify(page)!==capture.fingerprint)throw Error('A nota mudou. Capture novamente.');const location=NotesSearch.scopes().find(n=>n.id===capture.nodeId);selection.push({nodeId:page.id,objectId:'page-capture',assetId:crypto.randomUUID(),caption:(capture.mode==='visible'?'Área visível: ':'Página inteira: ')+page.title,path:location.path,mime:capture.record.mime,ocr:'',capture});notify();return true}
 function clear(){selection=[];++sequence;if(panel)panel.open=false;notify()}
 function available(currentConfig,model){return currentConfig?.features?.vision?.version===1&&currentConfig?.models?.some(m=>m.id===model&&m.vision===true)}
 function choose(){
  if(!active||busy)return;
  if(!dialog){dialog=element('dialog');dialog.className='notes-dialog notes-vision-picker';document.body.append(dialog)}
  dialog.replaceChildren();const header=element('header'),title=element('h2','Imagens das Notas'),close=element('button','×');close.type='button';close.setAttribute('aria-label','Fechar seleção de imagens');close.onclick=()=>dialog.close();header.append(title,close);
  const fields=element('div');fields.className='notes-fields';const input=element('input');input.type='search';input.placeholder='Buscar descrição ou caminho da imagem';input.setAttribute('aria-label','Buscar imagem das Notas');
  const list=element('div'),notice=element('p','Selecione até duas imagens deste ambiente. Elas só serão enviadas à IA ao clicar em Enviar na conversa.'),feedback=element('p');feedback.setAttribute('role','status');
  function render(){list.replaceChildren();let records;try{records=images()}catch(e){feedback.textContent=e.message;return}const query=input.value.toLocaleLowerCase('pt-BR');records=records.filter(i=>(i.caption+' '+i.path).toLocaleLowerCase('pt-BR').includes(query));
   for(const item of records.slice(0,80)){const button=element('button',item.caption+' — '+item.path);button.type='button';button.className='notes-vision-choice';button.setAttribute('aria-pressed',String(selection.some(i=>i.assetId===item.assetId)));button.onclick=()=>{try{if(add(item.nodeId,item.objectId)){feedback.textContent='Imagem adicionada à conversa. '+selection.length+' de 2 selecionadas.';render()}}catch(e){feedback.textContent=e.message}};list.append(button)}
   if(!records.length)list.append(element('p','Nenhuma imagem encontrada nas Notas disponíveis neste navegador.'));if(records.length>80)list.append(element('p','Há mais imagens. Use a busca para restringir a lista.'));
  }
  input.oninput=render;fields.append(notice,input,list,feedback);const footer=element('footer'),done=element('button','Voltar à conversa');done.type='button';done.onclick=()=>dialog.close();footer.append(done);dialog.append(header,fields,footer);render();dialog.showModal();input.focus();Promise.resolve().then(()=>window.NotesCloud?.start()).then(()=>{if(dialog.open&&active)render()}).catch(e=>{if(dialog.open)feedback.textContent=e.message});
 }
 async function preview(item){if(!active||busy)return;if(!previewDialog){previewDialog=element('dialog');previewDialog.className='notes-dialog notes-vision-preview';previewDialog.addEventListener('close',()=>{previewSequence++;previewDialog.replaceChildren()});document.body.append(previewDialog)}const target=previewDialog,id=++previewSequence;target.replaceChildren();const header=element('header'),title=element('h2',item.caption),close=element('button','×'),size=element('button','Tamanho real'),download=element('button','Baixar'),view=element('div');close.type=size.type=download.type='button';download.disabled=true;close.setAttribute('aria-label','Fechar prévia');close.onclick=()=>target.close();header.append(title,size,download,close);view.className='notes-image-view';view.textContent='Carregando prévia…';target.append(header,view);target.showModal();try{const record=item.capture?item.capture.record:await NotesData.resolveAsset(item);if(!active||!target.open||id!==previewSequence)return;const img=element('img');img.alt=item.caption;img.src='data:'+record.mime+';base64,'+record.base64;view.replaceChildren(img);download.disabled=false;download.onclick=()=>{const url=URL.createObjectURL(new Blob([NotesData.bytes(record.base64)],{type:record.mime})),link=element('a');link.href=url;link.download='nota-captura.'+(record.mime==='image/jpeg'?'jpg':record.mime==='image/webp'?'webp':'png');document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};size.onclick=()=>{const real=size.textContent==='Tamanho real';img.style.maxWidth=real?'none':'100%';size.textContent=real?'Ajustar à tela':'Tamanho real'}}catch(e){view.textContent=e.message}}
 function captureControls(parent){
  let box=document.getElementById('mdChatNoteCapture');
  if(!box){box=element('div');box.id='mdChatNoteCapture';box.className='md-chat-note-capture';const label=element('label','Analisar visualmente uma nota'),select=element('select'),actions=element('div'),feedback=element('small');select.id='mdChatCapturePage';select.setAttribute('aria-label','Página para análise visual');label.append(select);feedback.id='mdChatCaptureStatus';feedback.setAttribute('role','status');
   for(const [mode,title] of [['page','Capturar nota inteira'],['visible','Capturar área visível']]){const button=element('button',title);button.type='button';button.dataset.noteCapture=mode;button.onclick=async()=>{if(capturing||busy||!active)return;capturing=true;feedback.textContent='Preparando somente a folha da nota, sem menus ou botões…';captureControls(parent);try{await window.Notes.captureNode(select.value,mode);feedback.textContent='Captura adicionada. Confira a prévia abaixo antes de enviar.'}catch(e){feedback.textContent=e.message}finally{capturing=false;captureControls(parent)}};actions.append(button)}
   box.append(label,actions,feedback);parent.before(box);
  }
  const select=box.querySelector('select'),pages=NotesSearch.scopes().filter(n=>n.kind==='page'),chosen=select.value||window.Notes?.currentPageId?.();select.replaceChildren();for(const p of pages){const option=element('option',p.path);option.value=p.id;select.append(option)}if(pages.some(p=>p.id===chosen))select.value=chosen;
  if(!pages.length){const option=element('option','Nenhuma página de Notas disponível');option.value='';select.append(option)}
  function update(){select.disabled=busy||capturing||!active||!pages.length;box.querySelectorAll('button').forEach(b=>b.disabled=busy||capturing||!active||!pages.length||selection.length>=2)}
  update();
 }
 function render(parent,state){
  panel=parent;config=state.config;busy=state.busy;const model=state.model;if(!panel)return;captureControls(panel);
  if(!panel.dataset.bound){panel.dataset.bound='true';const summary=element('summary','Imagens das Notas · IA'),body=element('div'),chooseButton=element('button','Selecionar imagens'),list=element('div'),hint=element('small');
   chooseButton.type='button';chooseButton.id='mdChatVisionChoose';chooseButton.onclick=choose;list.id='mdChatVisionList';hint.id='mdChatVisionHint';hint.setAttribute('role','status');body.append(chooseButton,list,hint);panel.append(summary,body);
  }
  const list=panel.querySelector('#mdChatVisionList'),hint=panel.querySelector('#mdChatVisionHint');panel.querySelector('#mdChatVisionChoose').disabled=busy;
  hint.textContent=config?.features?.vision?.version!==1?'Você pode preparar a seleção. O envio visual aguarda a atualização do serviço do assistente.':!available(config,model)?'Escolha um modelo identificado com Imagens para enviar a seleção.':'Ao clicar em Enviar, as imagens selecionadas serão compartilhadas com o modelo escolhido. A análise pode consumir créditos; não altera seus dados. Capturas de página incluem as anotações; imagens avulsas enviam somente o original.';
  list.replaceChildren();panel.querySelector('summary').textContent=selection.length?'Imagens das Notas · '+selection.length+' selecionada(s)':'Imagens das Notas · IA';const seq=++sequence;if(selection.length)panel.open=true;
  for(const [index,item] of selection.entries()){
   const row=element('div');row.className='md-chat-vision-item';const img=element('img');img.alt=item.caption;const description=element('span','[I'+(index+1)+'] '+item.caption+' · '+item.path+(item.capture?' · '+item.capture.width+' × '+item.capture.height+' px. '+item.capture.warning:'')),remove=element('button','Remover');remove.type='button';remove.disabled=busy;remove.onclick=()=>{selection=selection.filter(i=>i!==item);notify()};const enlarge=element('button');enlarge.type='button';enlarge.className='md-chat-vision-preview';enlarge.disabled=busy;enlarge.setAttribute('aria-label','Ampliar seleção I'+(index+1));enlarge.onclick=()=>preview(item);enlarge.append(img);row.append(enlarge,description,remove);list.append(row);
   (item.capture?Promise.resolve(item.capture.record):NotesData.resolveAsset(item)).then(record=>{if(seq===sequence&&active)img.src='data:'+record.mime+';base64,'+record.base64}).catch(()=>{if(seq===sequence){img.alt='Imagem ainda não carregada';description.textContent+=' · Abra a origem ou conecte as Notas ao GitHub para carregar a imagem.'}});
  }
 }
 async function prepare(){
  if(!active||!selection.length)throw Error('Selecione uma imagem das Notas.');const source=images(),chosen=[...selection],result=[];
  for(const item of chosen){if(item.capture){const page=NotesData.snapshot().nodes.find(n=>n.id===item.nodeId);if(!page||JSON.stringify(page)!==item.capture.fingerprint)throw Error('A nota mudou após a captura. Remova a captura e refaça antes de enviar.');result.push({nodeId:item.nodeId,objectId:item.objectId,path:item.path.slice(0,1500),caption:(item.caption+' · '+item.capture.width+' × '+item.capture.height+' px · '+item.capture.capturedAt).slice(0,1000),ocr:'',mime:item.capture.record.mime,base64:item.capture.record.base64});continue}const current=source.find(i=>i.nodeId===item.nodeId&&i.objectId===item.objectId&&i.assetId===item.assetId);if(!current)throw Error('Uma imagem foi removida ou substituída. Remova-a da seleção e escolha novamente.');const record=await NotesData.resolveAsset(current);if(!active)throw Error('O ambiente mudou.');if(NotesData.bytes(record.base64).length>900000)throw Error('A imagem excede 900 KB.');result.push({nodeId:current.nodeId,objectId:current.objectId,path:current.path.slice(0,1500),caption:current.caption.slice(0,1000),ocr:current.ocr.slice(0,2000),mime:record.mime,base64:record.base64})}
  return result;
 }
 window.addEventListener('projectflow:workspace-switch',()=>{active=false;selection=[];sequence++;dialog?.close();previewDialog?.close();notify()});
 return {add,addCapture,clear,count:()=>selection.length,available,choose,render,prepare};
})();
