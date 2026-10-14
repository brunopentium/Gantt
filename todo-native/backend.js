/* Same-origin bridge: data never depends on the Google iframe or Apps Script. */
(() => {
  const store=window.parent.NativeTodo;
  window.TaskBackend={personal:!!window.parent.WorkspaceProfile?.personal,read:store.data,write:store.commit,subscribe:store.subscribe,parseBackup:store.parseBackup,restore:store.restoreData};
})();
