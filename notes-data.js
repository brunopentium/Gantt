/* Structured pages and immutable raster attachments, isolated by workspace. */
window.NotesData=(()=>{
 'use strict';
 const KEY=WorkspaceProfile.key('pf_notes_v1'),DB=WorkspaceProfile.db('projectflow-notes-assets-v1');
 const clone=x=>JSON.parse(JSON.stringify(x)),id=()=>crypto.randomUUID();
 const empty=()=>({version:1,type:'notes',nodes:[]});
 let data=empty(),loadError='',hasLocal=false,databasePromise;
 function validate(raw){
  if(raw?.version!==1||raw.type!=='notes'||!Array.isArray(raw.nodes)||raw.nodes.length>10000)throw Error('Arquivo de notas inválido.');
  const map=new Map();
  for(const n of raw.nodes){
   if(!n||typeof n.id!=='string'||!n.id||map.has(n.id)||!['folder','notebook','page'].includes(n.kind)||typeof n.title!=='string'||n.title.length>300||n.parentId!==null&&typeof n.parentId!=='string')throw Error('Estrutura das notas inválida.');
   map.set(n.id,n);
   if(n.kind==='page'){
    if(!['blank','grid','ruled'].includes(n.background)||!Array.isArray(n.objects)||n.objects.length>10000)throw Error('Página inválida.');
    if(n.paperColor!==undefined&&!['white','cream','yellow'].includes(n.paperColor))throw Error('Cor do papel inválida.');
    const ids=new Set();
    for(const o of n.objects){
     if(!o||typeof o.id!=='string'||ids.has(o.id)||!['text','image','table','pen','highlighter','line','arrow','rect','ellipse'].includes(o.type))throw Error('Objeto inválido.');ids.add(o.id);
     if(o.groupId!==undefined&&(typeof o.groupId!=='string'||!o.groupId||o.groupId.length>200))throw Error('Grupo de objetos inválido.');
     for(const k of ['x','y','w','h','rotation'])if(!Number.isFinite(o[k])||Math.abs(o[k])>100000)throw Error('Posição inválida.');
     if(o.w<1||o.h<1)throw Error('Dimensão inválida.');
     if(['text','table'].includes(o.type)&&((o.type==='text'&&(typeof o.text!=='string'||o.text.length>200000))||!Number.isFinite(o.fontSize)||o.fontSize<10||o.fontSize>120))throw Error('Texto inválido.');
     if(o.type==='table'&&(!Array.isArray(o.cells)||!o.cells.length||o.cells.length>100||!Array.isArray(o.cells[0])||!o.cells[0].length||o.cells[0].length>30||o.cells.some(row=>!Array.isArray(row)||row.length!==o.cells[0].length||row.some(cell=>typeof cell!=='string'||cell.length>10000))||typeof o.header!=='boolean'||o.minWidth!=null&&(!Number.isFinite(o.minWidth)||o.minWidth<1||o.minWidth>100000)))throw Error('Tabela inválida: use até 100 linhas e 30 colunas.');
     if(typeof o.color!=='string'||!/^#[0-9a-f]{6}$/i.test(o.color))throw Error('Cor inválida.');
     if(o.type==='image'&&(!/^[a-f0-9]{64}$/.test(o.assetId)||!['image/png','image/jpeg','image/webp'].includes(o.mime)||typeof o.ocr!=='string'||o.ocr.length>200000||typeof o.caption!=='string'||o.caption.length>10000))throw Error('Imagem inválida.');
     if(o.ocrInfo!=null&&(o.type!=='image'||o.ocrInfo.engine!=='tesseract.js@6.0.1'||!['por+eng','por','eng'].includes(o.ocrInfo.languages)||!Number.isFinite(o.ocrInfo.confidence)||o.ocrInfo.confidence<0||o.ocrInfo.confidence>100||typeof o.ocrInfo.reviewedAt!=='string'||!Number.isFinite(Date.parse(o.ocrInfo.reviewedAt))))throw Error('Informações de OCR inválidas.');
     if(!['text','image','table'].includes(o.type)&&(!Number.isFinite(o.stroke)||o.stroke<1||o.stroke>40||!Array.isArray(o.points)||o.points.length>50000||o.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||Math.abs(v)>100000)) ))throw Error('Desenho inválido.');
    }
   }
  }
  for(const n of raw.nodes){
   const seen=new Set([n.id]);let p=n;
   while(p.parentId!==null){const parent=map.get(p.parentId);if(!parent||seen.has(parent.id))throw Error('Pasta ou página com vínculo circular ou ausente.');seen.add(parent.id);p=parent}
   const parent=map.get(n.parentId);
   if(n.kind==='folder'&&parent&&parent.kind!=='folder'||n.kind==='notebook'&&parent&&parent.kind!=='folder'||n.kind==='page'&&(!parent||!['notebook','page'].includes(parent.kind)))throw Error('Hierarquia inválida nas notas.');
  }
  return raw;
 }
 try{const raw=localStorage.getItem(KEY);if(raw){data=clone(validate(JSON.parse(raw)));hasLocal=true}}catch(e){loadError=e.message}
 function snapshot(){if(loadError)throw Error('Não foi possível abrir as notas locais: '+loadError);return clone(data)}
 function restoreData(raw){const next=clone(validate(raw));localStorage.setItem(KEY,JSON.stringify(next));data=next;hasLocal=true;loadError='';changed()}
 function commit(raw){const cached=localStorage.getItem(KEY);if(cached&&JSON.stringify(JSON.parse(cached))!==JSON.stringify(data))throw Error('As notas mudaram em outra aba. Reabra a guia antes de continuar.');restoreData(raw)}
 function changed(){window.NotesCloud?.changed();window.dispatchEvent(new CustomEvent('projectflow:datachange',{detail:{source:'notes'}}))}
 function database(){
  if(!databasePromise)databasePromise=new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('assets',{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result)}).catch(e=>{databasePromise=null;throw e});
  return databasePromise;
 }
 async function asset(id){const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction('assets').objectStore('assets').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
 const bytes=base64=>Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('')}
 async function storeAsset(record){
  if(!record||!['image/png','image/jpeg','image/webp'].includes(record.mime)||typeof record.base64!=='string')throw Error('Anexo inválido.');
  const b=bytes(record.base64);if(b.length>900000||await digest(b)!==record.id)throw Error('Anexo corrompido ou muito grande.');
  const db=await database();await new Promise((resolve,reject)=>{const tx=db.transaction('assets','readwrite');tx.objectStore('assets').put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});return record;
 }
 async function imageFile(file,{persist=true}={}){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>25000000)throw Error('Use uma imagem PNG, JPEG ou WebP de até 25 MB.');
  const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');let scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  let blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
  if(blob.size>850000)blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.8));
  if(blob.size>900000)throw Error('Imagem muito detalhada. Reduza seu tamanho e tente novamente.');
  const array=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<array.length;i+=16384)binary+=String.fromCharCode(...array.subarray(i,i+16384));
  const record={id:await digest(array),mime:blob.type,name:file.name||'Imagem colada',base64:btoa(binary)};if(persist)await storeAsset(record);return {record,width:canvas.width,height:canvas.height};
 }
 function paperStyle(n){const color={white:'#ffffff',cream:'#fff8e7',yellow:'#fff2b3'}[n.paperColor||'white']||'#ffffff';const image=n.background==='grid'?'linear-gradient(#cfd8e3 1px,transparent 1px),linear-gradient(90deg,#cfd8e3 1px,transparent 1px)':n.background==='ruled'?'linear-gradient(to bottom,transparent 0px,transparent 27px,#b4c3d3 27px,#b4c3d3 28px)':'none';return `background-color:${color};background-image:${image};background-size:${n.background==='grid'?'24px 24px':'100% 28px'};print-color-adjust:exact;-webkit-print-color-adjust:exact;`}
 function imageRefs(raw=snapshot()){const refs=new Map();for(const n of raw.nodes)for(const o of n.objects||[])if(o.type==='image')refs.set(o.assetId,o);return [...refs.values()]}
 async function resolveAsset(o){let a=await asset(o.assetId);if(!a&&window.NotesCloud?.asset)a=await window.NotesCloud.asset(o);if(!a)throw Error('Imagem indisponível neste navegador. Conecte as Notas ao GitHub ou restaure o backup ZIP.');return a}
 return {empty,validate,paperStyle,snapshot,commit,restoreData,hasLocalData:()=>hasLocal&&data.nodes.length>0,flush:()=>{},id,asset,storeAsset,imageFile,imageRefs,resolveAsset,bytes};
})();
