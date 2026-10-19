/* Capture the rendered note, including text, tables, images and SVG annotations. */
window.NotesCapture=(()=>{
 'use strict';
 const engineURL=new URL('vendor/html2canvas.min.js?v=1.4.1',document.currentScript.src).href;let loading=null;
 function engine(){if(window.html2canvas)return Promise.resolve(window.html2canvas);if(loading)return loading;
  loading=new Promise((resolve,reject)=>{const script=document.createElement('script');const timer=setTimeout(()=>{script.remove();loading=null;reject(Error('A preparação da captura demorou demais. Tente novamente.'))},30000);script.src=engineURL;script.onload=()=>{clearTimeout(timer);resolve(window.html2canvas)};script.onerror=()=>{clearTimeout(timer);script.remove();loading=null;reject(Error('Não foi possível carregar a captura de Notas. Verifique a conexão.'))};document.head.append(script)});return loading;
 }
 function bounds(paper,viewport,zoom,mode){const rect=paper.getBoundingClientRect(),width=parseFloat(paper.style.width),height=parseFloat(paper.style.height);
  if(mode==='visible'){const view=viewport.getBoundingClientRect(),left=Math.max(0,(view.left-rect.left)/zoom),top=Math.max(0,(view.top-rect.top)/zoom),right=Math.min(width,(view.left+viewport.clientWidth-rect.left)/zoom),bottom=Math.min(height,(view.top+viewport.clientHeight-rect.top)/zoom);if(right-left<20||bottom-top<20)throw Error('A área visível está vazia. Navegue até o conteúdo desejado.');return {left,top,width:Math.ceil(right-left),height:Math.ceil(bottom-top)}}
  let right=600,bottom=300;for(const el of paper.querySelectorAll('.notes-object,.notes-object path,.notes-object rect,.notes-object ellipse,.notes-text-content,.notes-table-content')){const r=el.getBoundingClientRect();right=Math.max(right,(r.right-rect.left)/zoom+32);bottom=Math.max(bottom,(r.bottom-rect.top)/zoom+32)}return {left:0,top:0,width:Math.ceil(Math.min(width,right)),height:Math.ceil(Math.min(height,bottom))};
 }
 async function encode(canvas){
  let current=canvas,blob=await new Promise(r=>current.toBlob(r,'image/png'));let reduced=false;if(!blob)throw Error('Não foi possível gerar a captura. Tente a área visível.');
  for(let attempt=0;blob.size>900000&&attempt<6;attempt++){
   for(const quality of [.88,.72,.58]){blob=await new Promise(r=>current.toBlob(r,'image/jpeg',quality));if(blob.size<=900000)break}
   if(blob.size<=900000)break;const smaller=document.createElement('canvas');smaller.width=Math.max(1,Math.round(current.width*.8));smaller.height=Math.max(1,Math.round(current.height*.8));smaller.getContext('2d').drawImage(current,0,0,smaller.width,smaller.height);current=smaller;reduced=true;
  }
  if(!blob||blob.size>900000)throw Error('A captura ficou grande demais. Use a área visível para analisar uma parte da nota.');
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return {record:{mime:blob.type,base64:btoa(binary)},width:current.width,height:current.height,reduced};
 }
 async function capture({node,paper,viewport,zoom,mode='page'}){
  if(!node?.objects?.length)throw Error('A página está vazia.');const fingerprint=JSON.stringify(node),area=bounds(paper,viewport,zoom,mode);const scale=Math.min(1,4000/area.width,4000/area.height,Math.sqrt(4000000/(area.width*area.height)));
  const included=mode==='visible'?node.objects.filter(o=>o.x+o.w>=area.left&&o.x<=area.left+area.width&&o.y+o.h>=area.top&&o.y<=area.top+area.height):node.objects;
  for(const o of included.filter(o=>o.type==='image')){const record=await NotesData.resolveAsset(o),img=paper.querySelector(`[data-object="${CSS.escape(o.id)}"] img`);if(img){img.src='data:'+record.mime+';base64,'+record.base64;await img.decode()}}
  if(document.fonts?.ready)await document.fonts.ready;const render=await engine();if(!paper.isConnected)throw Error('A página mudou durante a captura. Tente novamente.');
  const canvas=await render(paper,{logging:false,backgroundColor:'#ffffff',scale,x:area.left,y:area.top,width:area.width,height:area.height,useCORS:false,allowTaint:false,imageTimeout:15000,onclone:(cloned,copy)=>{
   copy.style.transform='none';copy.querySelector('.notes-preview')?.remove();copy.querySelectorAll('.notes-move,.notes-resize').forEach(el=>el.remove());copy.querySelectorAll('.notes-object').forEach(el=>{el.classList.remove('is-selected');el.style.setProperty('outline','none','important')});copy.querySelectorAll('.notes-image-state').forEach(el=>el.remove());
   let parent=copy.parentElement;while(parent){parent.style.overflow='visible';parent.scrollLeft=0;parent.scrollTop=0;parent=parent.parentElement}
  }});
  const encoded=await encode(canvas);const current=NotesData.snapshot().nodes.find(n=>n.id===node.id);if(!current||JSON.stringify(current)!==fingerprint)throw Error('A nota mudou durante a captura. Capture novamente para incluir as alterações.');
  return {nodeId:node.id,mode,fingerprint,record:encoded.record,width:encoded.width,height:encoded.height,area,capturedAt:new Date().toISOString(),warning:scale<.7||encoded.reduced?'A página foi reduzida. Para ler detalhes pequenos, capture também a área visível.':''};
 }
 return {capture};
})();
