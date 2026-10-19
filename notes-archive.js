/* Portable ZIP (stored entries) with strict CRC/size/path validation; no remote service. */
window.NotesArchive=(()=>{
 'use strict';
 const te=new TextEncoder(),td=new TextDecoder('utf-8',{fatal:true}),MAX=200*1024*1024;
 const crc=b=>{let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1}return (c^0xffffffff)>>>0};
 function zip(files){let offset=0;const parts=[],central=[];for(const [name,b]of files){const n=te.encode(name),c=crc(b),h=new Uint8Array(30+n.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,c,true);v.setUint32(18,b.length,true);v.setUint32(22,b.length,true);v.setUint16(26,n.length,true);h.set(n,30);parts.push(h,b);const a=new Uint8Array(46+n.length),d=new DataView(a.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,c,true);d.setUint32(20,b.length,true);d.setUint32(24,b.length,true);d.setUint16(28,n.length,true);d.setUint32(42,offset,true);a.set(n,46);central.push(a);offset+=h.length+b.length}const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,central.reduce((s,a)=>s+a.length,0),true);e.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'})}
 async function unzip(file){if(file.size>MAX)throw Error('Backup maior que 200 MB.');const b=new Uint8Array(await file.arrayBuffer()),v=new DataView(b.buffer),files=new Map();let p=0,total=0;
  while(p+4<=b.length&&v.getUint32(p,true)===0x04034b50){if(p+30>b.length||v.getUint16(p+8,true)!==0||v.getUint16(p+6,true)&9)throw Error('ZIP incompatível. Use um backup ZIP criado pelo ProjectFlow.');const len=v.getUint32(p+18,true),n=v.getUint16(p+26,true),extra=v.getUint16(p+28,true),start=p+30+n+extra,end=start+len;if(end>b.length||len!==v.getUint32(p+22,true))throw Error('Backup truncado.');const name=td.decode(b.slice(p+30,p+30+n)),bytes=b.slice(start,end);total+=len;if(total>MAX||files.size>10000||files.has(name)||!(/^(backup\.json|assets\/[a-f0-9]{64}\.json)$/.test(name))||crc(bytes)!==v.getUint32(p+14,true))throw Error('Arquivo corrompido ou inválido no ZIP.');files.set(name,bytes);p=end}
  if(!files.has('backup.json')||p+4>b.length||v.getUint32(p,true)!==0x02014b50)throw Error('Backup ZIP inválido.');return files;
 }
 function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(WorkspaceProfile.personal?'pessoal-':'')+name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
 async function exportData(data,name='projectflow-backup-geral'){
  const refs=NotesData.imageRefs(data.notes||NotesData.empty());
  if(!refs.length){downloadJSON(data,name+'.json');return}
  const files=[['backup.json',te.encode(JSON.stringify(data,null,2))]];
  for(const o of refs){const a=await NotesData.resolveAsset(o);files.push(['assets/'+a.id+'.json',te.encode(JSON.stringify(a))])}
  const size=files.reduce((s,[,b])=>s+b.length,0);if(size>MAX)throw Error('Backup maior que 200 MB. Exporte por partes.');download(zip(files),name+'.zip');
 }
 async function readFile(file){
  if(!file.name.toLowerCase().endsWith('.zip'))return {data:JSON.parse(await file.text()),assets:[]};
  const files=await unzip(file),data=JSON.parse(td.decode(files.get('backup.json')));window.WorkspaceBackup.validate(data);
  const assets=[];for(const o of NotesData.imageRefs(data.notes||NotesData.empty())){const b=files.get('assets/'+o.assetId+'.json');if(!b)throw Error('O backup não contém todas as imagens.');const a=JSON.parse(td.decode(b));if(a.id!==o.assetId||a.mime!==o.mime||await crypto.subtle.digest('SHA-256',NotesData.bytes(a.base64)).then(x=>Array.from(new Uint8Array(x),v=>v.toString(16).padStart(2,'0')).join(''))!==o.assetId)throw Error('Imagem corrompida no backup.');assets.push(a)}return {data,assets};
 }
 return {exportData,readFile,zip,unzip,download};
})();
