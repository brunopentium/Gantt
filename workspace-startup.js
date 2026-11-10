/* A failed local area must not leave the entire application on its opening label. */
window.WorkspaceStartup=(()=>{
  'use strict';
  const issues=new Map();let complete=false;
  function summary(){return [...issues.values()].join(' ')}
  function render(){
    if(!document.body)return;
    let panel=document.getElementById('workspaceStartupNotice');
    if(!issues.size)return;
    if(!panel){
      panel=document.createElement('section');panel.id='workspaceStartupNotice';panel.setAttribute('role','alert');
      Object.assign(panel.style,{padding:'12px',background:'#fff4dd',color:'#613b0b',borderBottom:'1px solid #d8bb82',font:'14px system-ui',flexShrink:'0'});
      const message=document.createElement('p');message.style.margin='0 0 8px';message.dataset.startupMessage='';
      const retry=document.createElement('button');retry.type='button';retry.textContent='Tentar abrir novamente';retry.onclick=()=>location.reload();
      const download=document.createElement('button');download.type='button';download.textContent='Baixar cópia dos dados locais';download.style.marginLeft='8px';download.onclick=exportLocal;
      panel.append(message,retry,download);document.getElementById('appTabs')?.after(panel);
      if(!panel.isConnected)document.body.prepend(panel);
    }
    panel.querySelector('[data-startup-message]').textContent=summary();
    const status=document.getElementById('autosaveStatus');
    if(status&&(!complete||status.textContent==='Abrindo dados…')){status.textContent='A abertura encontrou um problema local. Veja o aviso acima.';status.dataset.state='blocked'}
  }
  function report(area,error){
    const storage=['QuotaExceededError','SecurityError'].includes(error?.name);
    issues.set(area,storage?'O navegador não permitiu salvar os dados locais ('+area+'). Confira o espaço disponível antes de continuar editando.':area==='Inicialização'?'Não foi possível concluir a abertura. Seus dados locais foram preservados; baixe uma cópia e tente abrir novamente.':area+': não foi possível abrir esta área. Os dados locais foram preservados; as outras guias continuam disponíveis.');
    render();return false;
  }
  function run(area,operation){try{return {ok:true,value:operation()}}catch(error){report(area,error);return {ok:false,error}}}
  function exportLocal(){
    const data={version:1,type:'projectflow-local-recovery',workspace:WorkspaceProfile.mode,exportedAt:new Date().toISOString(),records:{}};
    for(const name of ['pf_projects_v1','pf2','pf_todo_v1','pf_notes_v1']){const value=localStorage.getItem(WorkspaceProfile.key(name));if(value!==null)data.records[name]=value}
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');
    link.href=url;link.download='projectflow-recuperacao-local-'+WorkspaceProfile.mode+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  window.addEventListener('error',event=>{if(!complete&&event.error)report('Inicialização',event.error)});
  document.addEventListener('DOMContentLoaded',render);
  return {run,report,summary,finish(){complete=true;render()}};
})();
