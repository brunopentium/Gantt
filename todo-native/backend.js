/* Same-origin bridge: data never depends on the Google iframe or Apps Script. */
(() => {
  const store=window.parent.NativeTodo;
  window.TaskBackend={personal:!!window.parent.WorkspaceProfile?.personal,read:store.data,write:store.commit,subscribe:store.subscribe,parseBackup:store.parseBackup,restore:store.restoreData};
  const phone=window.parent.matchMedia('(max-width:767px) and (pointer:coarse), (max-height:600px) and (max-width:1024px) and (pointer:coarse)');
  let queued=false;
  function measure(){
    queued=false;
    document.documentElement.dataset.taskPhone=String(phone.matches);
    const frame=window.frameElement;
    if(frame){
      document.documentElement.style.setProperty('--task-visible-top',Math.max(0,-frame.getBoundingClientRect().top)+'px');
      document.documentElement.style.setProperty('--task-viewport-height',window.parent.innerHeight+'px');
    }
    const root=document.getElementById('root');
    window.parent.postMessage({type:'projectflow:task-layout',phone:phone.matches,height:Math.ceil(root.getBoundingClientRect().height)},location.origin);
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(measure)}}
  new ResizeObserver(schedule).observe(document.getElementById('root'));
  new MutationObserver(schedule).observe(document.getElementById('root'),{childList:true,subtree:true});
  phone.addEventListener('change',schedule);
  window.parent.addEventListener('resize',schedule,{passive:true});
  window.parent.addEventListener('scroll',schedule,{passive:true});
  document.addEventListener('click',event=>{
    if(phone.matches&&event.target.closest('.task-sidebar nav button'))requestAnimationFrame(()=>window.frameElement?.scrollIntoView({block:'start'}));
  });
  schedule();
})();
