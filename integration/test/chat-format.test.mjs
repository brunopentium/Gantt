import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../../chat-format.js',import.meta.url),'utf8');
function render(text){
  const node=tag=>({tag,children:[],textContent:'',append(...items){this.children.push(...items);}});
  const context={window:{},document:{createElement:node,createTextNode:text=>({tag:'#text',textContent:text,children:[]})}};
  vm.createContext(context);vm.runInContext(source,context);const root=node('div');context.window.MyDayChatFormat.render(root,text);return root;
}
const all=(node,tag)=>[...(node.tag===tag?[node]:[]),...node.children.flatMap(child=>all(child,tag))];
const text=node=>node.textContent+node.children.map(text).join('');
test('responses separate paragraphs, responsible groups and individual task list items',()=>{
  const root=render('No plano **Câmara**, temos:\n\n- **Vitória**\n  - Emitir licença — 15/10/2026.\n  - Cotar o transporte.\n\n- **Pierre**\n  - Transferir o equipamento.\n\nPróximo passo.');
  assert.equal(root.children.filter(n=>n.tag==='p').length,2);assert.equal(all(root,'strong').length,3);
  assert.equal(all(root,'li').length,5);assert.equal(all(root,'ul').length,3);assert(!text(root).includes('**'));
});
test('headings and numbered lists render and untrusted HTML remains inert text',()=>{
  const root=render('## Hoje\n\n1. Tarefa **A**\n2. Tarefa `B`\n\n<img src=x onerror=alert(1)>\n<script>bad()</script>');
  assert.equal(all(root,'ol').length,1);assert.equal(all(root,'code').length,1);assert.equal(all(root,'script').length,0);
  assert.match(text(root),/<img src=x onerror=alert\(1\)>/);assert.match(text(root),/<script>bad\(\)<\/script>/);
});
