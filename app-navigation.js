/* The legacy Google app is preserved and loaded only when explicitly opened. */
window.AppNavigation=(()=>{
  'use strict';
  const KEY=window.WorkspaceProfile.key('pf_legacy_todo_visible_v1');
  const isLegacyVisible=()=>!document.getElementById('tabTodo').hidden;
  function setLegacyVisible(visible){
    if(window.WorkspaceProfile.personal)visible=false;
    localStorage.setItem(KEY,String(!!visible));
    const tab=document.getElementById('tabTodo');tab.hidden=!visible;
    if(!visible&&document.documentElement.dataset.appView==='todo')window.ActionPlans.switchView('my-day');
    return isLegacyVisible();
  }
  function init(){
    let visible=false;try{visible=localStorage.getItem(KEY)==='true'}catch(_){/* The legacy tab stays hidden by default. */}
    document.getElementById('tabTodo').hidden=window.WorkspaceProfile.personal||!visible;
  }
  return {init,setLegacyVisible,isLegacyVisible};
})();
