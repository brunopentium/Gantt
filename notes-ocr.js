/* Tesseract.js 6.0.1 worker protocol, pinned so initialization can also be cancelled.
 * Image bytes stay in this device. Network requests only download public OCR assets.
 * Tesseract.js/Tesseract.js-core: Apache-2.0, https://github.com/naptha/tesseract.js */
window.NotesOCR=(()=>{
 'use strict';
 const CDN='https://cdn.jsdelivr.net/npm/',VERSION='6.0.1';let busy=false;
 async function recognize(record,{languages='por+eng',signal,onProgress=()=>{}}={}){
  if(busy)throw Error('Já existe uma leitura de imagem em andamento.');
  if(!['por+eng','por','eng'].includes(languages))throw Error('Idioma de OCR inválido.');
  if(signal?.aborted)throw new DOMException('Leitura cancelada.','AbortError');
  busy=true;let worker,url,timer,pending,abort,sequence=0;
  const fail=error=>{if(pending){const task=pending;pending=null;task.reject(error)}};
  const job=(action,payload)=>new Promise((resolve,reject)=>{pending={resolve,reject,id:String(++sequence)};worker.postMessage({workerId:'projectflow-ocr',jobId:pending.id,action,payload})});
  const interrupted=new Promise((_,reject)=>{
   abort=()=>{const error=new DOMException('Leitura cancelada.','AbortError');worker?.terminate();fail(error);reject(error)};signal?.addEventListener('abort',abort,{once:true});
   timer=setTimeout(()=>{worker?.terminate();const error=Error('A leitura demorou demais. Tente uma imagem menor ou verifique a conexão para baixar os idiomas.');fail(error);reject(error)},180000);
  });
  try{
   onProgress('Carregando motor de OCR…');
   // Owning the worker directly permits termination during downloads, not only after init.
   url=URL.createObjectURL(new Blob([`importScripts('${CDN}tesseract.js@${VERSION}/dist/worker.min.js');`],{type:'text/javascript'}));worker=new Worker(url);
   worker.onerror=event=>{event.preventDefault();fail(Error('Não foi possível carregar o motor de OCR. Verifique a conexão e tente novamente.'))};
   worker.onmessage=({data:m})=>{
    if(m.status==='progress'){const d=m.data||{},label=({'loading tesseract core':'Carregando motor','loading language traineddata':'Baixando idiomas','initializing tesseract':'Preparando leitura','recognizing text':'Reconhecendo texto'})[d.status]||'Preparando OCR';onProgress(label+(Number.isFinite(d.progress)?' · '+Math.round(d.progress*100)+'%':''));return}
    if(!pending||m.jobId!==pending.id)return;const task=pending;pending=null;
    if(m.status==='resolve')task.resolve(m.data);else task.reject(Error('Falha na leitura ou no download dos idiomas. Tente novamente.'));
   };
   const run=(async()=>{
    await job('load',{options:{lstmOnly:true,corePath:CDN+'tesseract.js-core@6.0.0'}});
    await job('loadLanguage',{langs:languages,options:{langPath:'https://tessdata.projectnaptha.com/4.0.0',cachePath:'projectflow-ocr-v1',cacheMethod:'write',gzip:true,lstmOnly:true}});
    await job('initialize',{langs:languages,oem:1,config:{}});
    const data=await job('recognize',{image:NotesData.bytes(record.base64),options:{},output:{text:true}});
    return {text:String(data.text||'').trim(),confidence:Math.max(0,Math.min(100,Math.round(Number(data.confidence)||0))),languages,engine:'tesseract.js@'+VERSION};
   })();
   return await Promise.race([run,interrupted]);
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker?.terminate();if(url)URL.revokeObjectURL(url);busy=false}
 }
 return {recognize};
})();
