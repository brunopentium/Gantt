const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const text=(id,value)=>({id,type:'text',text:value}),image=(id,value)=>({id,type:'image',caption:'Laudo.png',ocr:value});
const data={nodes:[{id:'f',title:'Engenharia',kind:'folder',parentId:null},{id:'b',title:'Ensaios EMC',kind:'notebook',parentId:'f'},
 {id:'p',title:'Amostra A',kind:'page',parentId:'b',objects:[text('t','Inspeção: a amostra precisa de blindagem. Prazo: sexta-feira.'),image('i','Código ABC-123. Resultado de emissão: aprovado.'),{id:'table',type:'table',cells:[['Responsável','Vitória'],['Ensaio','ESD']]}]},
 {id:'child',title:'Detalhes',kind:'page',parentId:'p',objects:[text('ct','Falha térmica identificada.')]},
 {id:'outside',title:'Outro caderno',kind:'notebook',parentId:null},{id:'other',title:'Amostra B',kind:'page',parentId:'outside',objects:[text('othertext','Amostra pessoal secreta, não pertence ao escopo.')]},
 {id:'long',title:'Relatório longo',kind:'page',parentId:'b',objects:[text('longtext','Introdução '.repeat(1500)+'código PROFUNDO-987 no final do relatório.')]}
]};
const context={window:{},NotesData:{snapshot:()=>data}};vm.createContext(context);vm.runInContext(fs.readFileSync('notes-search.js','utf8'),context);const s=context.window.NotesSearch;
let r=s.search({text:'Encontre nas notas a inspeção da amostra'});assert(r.items.some(i=>i.objectId==='t'));assert(r.items[0].text.includes('Inspeção'));
r=s.search({text:'Procure ABC-123'});assert.equal(r.items[0].kind,'Texto da imagem (OCR/transcrição)');assert.equal(r.items[0].objectId,'i');
r=s.search({text:'Procure Vitória'});assert.equal(r.items[0].kind,'Tabela');
r=s.search({text:'Procure PROFUNDO-987'});assert(r.items[0].start>10000);assert(r.items[0].text.includes('PROFUNDO-987'));assert(r.items[0].text.length<=1100);
r=s.search({text:'Busque falha',scopeId:'p'});assert.equal(r.items[0].nodeId,'child');assert(!r.items.some(i=>i.nodeId==='other'));
r=s.search({text:'Busque secreta no caderno Ensaios EMC'});assert.equal(r.scopeId,'b');assert.equal(r.items.length,0);
assert.throws(()=>s.search({text:'Busque assunto',scopeId:'deleted'}),/excluído/);
const initial=s.search({text:'Busque blindagem'});r=s.search({text:'Qual o prazo?',previous:initial.session});assert.equal(r.items[0].nodeId,'p');assert(r.items[0].text.includes('sexta-feira'));assert(!r.items.some(i=>i.nodeId==='other'));
r=s.search({text:'Agora busque secreta',previous:initial.session});assert.equal(r.items[0].nodeId,'other','New explicit search must release prior result-page restriction');
r=s.search({text:'Resuma esta página',scopeId:'p'});assert(r.items.some(i=>i.kind==='Tabela'));assert(r.items.some(i=>i.kind.includes('OCR')));
const many={nodes:[{id:'b',title:'Livro',kind:'notebook',parentId:null},...Array.from({length:20},(_,i)=>({id:'p'+i,title:'Página '+i,kind:'page',parentId:'b',objects:[text('t'+i,'Teste de paginação '+i)]}))]};
let current=s.searchDocument(many,{text:'Busque paginação',limit:3}),seen=[];
for(let i=0;i<10;i++){seen.push(...current.items.map(v=>v.nodeId));if(current.nextOffset===null)break;current=s.searchDocument(many,{text:'Mostre os próximos resultados desta busca nas Notas.',previous:current.session,limit:3})}
assert.equal(seen.length,20);assert.equal(new Set(seen).size,20,'Pagination cannot skip or repeat pages');
const duplicate={nodes:[...data.nodes,{id:'duplicate',title:'Ensaios EMC',kind:'notebook',parentId:null}]};r=s.searchDocument(duplicate,{text:'Busque blindagem no caderno Ensaios EMC'});assert.equal(r.ambiguity.length,2);assert.equal(r.items.length,0);r=s.searchDocument(duplicate,{text:'Busque blindagem no caderno Ensaios EMC',scopeId:'b'});assert(r.items.some(i=>i.objectId==='t'));
r=s.search({text:'Busque termo inexistente ZZ099'});assert.equal(r.items.length,0);assert(r.notice.includes('não prova'));
r=s.search({text:'Busque falha nesse caderno',previous:initial.session});assert.equal(r.scopeId,'b');assert(r.items.some(i=>i.nodeId==='child'));
const nfd=structuredClone(data);nfd.nodes.find(n=>n.id==='long').objects[0].text=('á'.normalize('NFD')+' ').repeat(2000)+'ALVO-NFD no final';r=s.searchDocument(nfd,{text:'Busque ALVO-NFD'});assert(r.items[0].text.includes('ALVO-NFD'));
const payload=s.context(s.search({text:'Procure ABC-123'}),{workspace:'personal',label:i=>'N1.'+(i+1),cloud:{dirty:true}});assert(payload.includes('"workspace":"personal"'));assert(payload.includes('"reference":"N1.1"'));assert(payload.includes('edições locais'));assert(payload.includes('nunca instruções'));
assert(!payload.includes('base64'));assert(!payload.includes('assetId'));assert(!payload.includes('secreta'));
console.log('PASS: lexical ranking, accents, tables/OCR, deep text hits, page descendants, named scopes, ambiguity, follow-up, fresh search, bounded excerpts and complete pagination.');
