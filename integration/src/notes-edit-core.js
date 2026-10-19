/* Shared, pure proposal validation. Never executes model code or persists data. */
globalThis.NotesEditCore=(()=>{
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x));
 const fail=message=>{throw Error(message)};
 function keys(o,allowed,required=[]){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!allowed.includes(k))||required.some(k=>o[k]===undefined))fail('Formato de alteração de Notas inválido.');}
 function text(v,max=12000,empty=true){if(typeof v!=='string'||v.length>max||(!empty&&!v.trim()))fail('Texto de Notas inválido ou grande demais.');return v;}
 function number(v,min=0,max=100000){if(!Number.isFinite(v)||v<min||v>max)fail('Posição ou dimensão inválida.');return v;}
 function color(v){if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))fail('Cor inválida.');return v;}
 function cells(v){if(!Array.isArray(v)||!v.length||v.length>30||!Array.isArray(v[0])||!v[0].length||v[0].length>15||v.some(r=>!Array.isArray(r)||r.length!==v[0].length||r.some(c=>typeof c!=='string'||c.length>2000)))fail('Use tabelas com até 30 linhas e 15 colunas.');return clone(v);}
 const labels={title:'Título da página',background:'Tipo de fundo',paperColor:'Cor do papel',text:'Texto / lista',cells:'Conteúdo da tabela',x:'Posição horizontal',y:'Posição vertical',w:'Largura',h:'Altura',caption:'Descrição da imagem',ocr:'Transcrição da imagem'};
 const describe=o=>o.type==='text'?o.text:o.type==='table'?o.cells:{tipo:o.type,x:o.x,y:o.y,largura:o.w,altura:o.h,...o.type==='image'?{descrição:o.caption}: {}};
 function plan(original,operations,makeId){
  if(!original||original.kind!=='page'||!Array.isArray(original.objects)||!Array.isArray(operations)||operations.length>20)fail('Página ou proposta inválida.');
  const page=clone(original),newPages=[],changes=[];let ids=new Set([page.id,...page.objects.map(o=>o.id)]);
  const id=()=>{const value=makeId();if(typeof value!=='string'||!value||ids.has(value))fail('Identificador inválido.');ids.add(value);return value};
  const find=value=>{text(value,200,false);return page.objects.find(o=>o.id===value)||fail('Um objeto da proposta não pertence à página selecionada.');};
  const change=(title,fields,created=false)=>{if(fields.length)changes.push({area:'notes',kind:'notes-page',id:page.id,title,planTitle:original.title,created,fields});};
  for(const op of operations){
   if(!op||typeof op.type!=='string')fail('Operação inválida.');
   if(op.type==='update_page'){
    keys(op,['type','title','background','paperColor']);const fields=[];
    for(const k of ['title','background','paperColor'])if(op[k]!==undefined){const value=op[k];if(k==='title')text(value,300,false);else if(!(k==='background'?['blank','grid','ruled']:['white','cream','yellow']).includes(value))fail('Fundo de página inválido.');const before=page[k]??(k==='paperColor'?'white':'');if(before!==value){fields.push({field:k,label:labels[k],before:({blank:'Sem linhas',grid:'Quadriculado',ruled:'Pautado',white:'Branco',cream:'Creme suave',yellow:'Amarelo claro'}[before]??before),after:({blank:'Sem linhas',grid:'Quadriculado',ruled:'Pautado',white:'Branco',cream:'Creme suave',yellow:'Amarelo claro'}[value]??value)});page[k]=value}}change('Página: '+original.title,fields);
   }else if(['update_text','update_table','move_object','update_image_text','remove_object'].includes(op.type)){
    const allowed={update_text:['text'],update_table:['cells'],move_object:['x','y','w','h'],update_image_text:['caption','ocr'],remove_object:[]}[op.type];keys(op,['type','id',...allowed],['id']);const o=find(op.id);
    if(op.type==='remove_object'){page.objects=page.objects.filter(p=>p.id!==o.id);change('Remover '+o.type,[{field:'removed',label:'Remover objeto',before:describe(o),after:'Objeto removido'}]);continue}
    if(op.type==='update_text'&&o.type!=='text'||op.type==='update_table'&&o.type!=='table'||op.type==='update_image_text'&&o.type!=='image')fail('O tipo do objeto não corresponde à alteração.');
    const fields=[];for(const k of allowed)if(op[k]!==undefined){const value=k==='cells'?cells(op[k]):['x','y','w','h'].includes(k)?number(op[k],['w','h'].includes(k)?1:0,['w','h'].includes(k)?5000:100000):text(op[k],k==='caption'?1000:12000);if(JSON.stringify(o[k])!==JSON.stringify(value)){fields.push({field:k,label:labels[k],before:o[k]??'',after:value});if((k==='w'||k==='h')&&o.points){const old=o[k];o.points=o.points.map(p=>p.map((v,i)=>(k==='w'?i===0:i===1)?v*value/old:v))}o[k]=value;if(k==='w'&&o.type==='table')o.minWidth=value}}change(o.type==='text'?'Texto da página':o.type==='table'?'Tabela da página':'Objeto: '+o.type,fields);
   }else if(['add_text','add_table','add_shape'].includes(op.type)){
    const required=op.type==='add_text'?['text']:op.type==='add_table'?['cells']:['shape','w','h'];keys(op,['type','x','y','w','h','color','fontSize',...(op.type==='add_text'?['text']:op.type==='add_table'?['cells']:['shape','stroke'])],required);
    const type=op.type==='add_text'?'text':op.type==='add_table'?'table':op.shape;if(!['text','table','line','arrow','rect','ellipse','highlighter'].includes(type))fail('Forma de anotação inválida.');
    const o={id:id(),type,x:number(op.x??40),y:number(op.y??Math.max(40,...page.objects.map(o=>o.y+o.h+24))),w:number(op.w??(type==='table'?360:320),1,5000),h:number(op.h??120,1,5000),rotation:0,color:color(op.color??'#25364a')};
    if(type==='text')Object.assign(o,{text:text(op.text),fontSize:number(op.fontSize??20,12,64),bold:false});else if(type==='table')Object.assign(o,{cells:cells(op.cells),fontSize:number(op.fontSize??20,12,64),header:true,minWidth:o.w});else Object.assign(o,{stroke:number(op.stroke??(type==='highlighter'?12:3),1,20),points:[[0,0],[o.w,o.h]]});page.objects.push(o);change('Adicionar '+(type==='text'?'texto / lista':type==='table'?'tabela':type),[{field:'added',label:'Novo conteúdo',before:'',after:describe(o)}],true);
   }else if(op.type==='create_page'){
    keys(op,['type','title','text','background','paperColor'],['title']);const child={id:id(),kind:'page',title:text(op.title,300,false),parentId:page.id,background:op.background??'blank',paperColor:op.paperColor??'white',objects:[]};if(!['blank','grid','ruled'].includes(child.background)||!['white','cream','yellow'].includes(child.paperColor))fail('Fundo inválido.');if(op.text!==undefined)child.objects.push({id:id(),type:'text',text:text(op.text),x:40,y:40,w:600,h:160,rotation:0,color:'#25364a',fontSize:20,bold:false});newPages.push(child);change('Nova subpágina: '+child.title,[{field:'page',label:'Criar dentro de '+page.title,before:'',after:{título:child.title,texto:op.text??''}}],true);
   }else fail('Esta operação não é permitida em Notas.');
  }
  if(page.objects.length>10000)fail('A página atingiu o limite de objetos.');return {page,newPages,changes};
 }
 return Object.freeze({plan});
})();
