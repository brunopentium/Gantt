import { IntegrationError } from './store.mjs';
const fail = message => { throw new IntegrationError('invalid_schedule', message); };
const date = value => value ? new Date(value + 'T12:00:00Z') : null;
const iso = value => value ? value.toISOString().slice(0,10) : '';
const move = (d,n) => { const next=new Date(d);next.setUTCDate(next.getUTCDate()+n);return next; };
const weekend = d => [0,6].includes(d.getUTCDay());
const skip = d => { while(weekend(d))d=move(d,1);return d; };
function edge(d,n,unit,direction=1) {
  if(!d)return null;
  if(unit==='cd')return move(d,direction*Math.max(0,n-1));
  d=skip(d);let left=Math.max(0,n-1);
  while(left>0){d=move(d,direction);if(!weekend(d))left--;}
  return d;
}
const summary = (tasks,i) => !!tasks[i+1]&&tasks[i+1].indent>tasks[i].indent;
export function scheduleDependencies(tasks, value) {
  if(!value?.trim())return [];
  return value.split(/[;,]/).map(part=>{
    const m=part.trim().match(/^(\d+)\s*(FS|SS|FF|SF)?\s*([+-]\d+)?d?\s*$/i);
    if(!m||!tasks[+m[1]-1]||Math.abs(+(m[3]||0))>10000)fail('Há uma dependência inválida. Corrija o cronograma antes de alterar suas datas pelo chat.');
    return { index:+m[1]-1,type:(m[2]||'FS').toUpperCase(),lag:+(m[3]||0) };
  });
}
export function recalculateSchedule(project, {dates=true,summaryDates=dates}={}) {
  const tasks=project.tasks;
  if(tasks.length>5000)fail('Divida este cronograma antes de alterar datas pelo chat.');
  const deps=tasks.map(t=>scheduleDependencies(tasks,t.pred)),state=new Map();
  function check(i){if(state.get(i)===1)fail('A alteração criaria um ciclo de dependências.');if(state.get(i)===2)return;state.set(i,1);for(const p of deps[i])check(p.index);state.set(i,2);}
  tasks.forEach((_,i)=>check(i));
  if(dates&&deps.some(list=>list.some(p=>summary(tasks,p.index))))fail('Datas que dependem de linhas de resumo ainda precisam ser ajustadas na interface do cronograma.');
  const done=new Set();
  function one(i){
    if(done.has(i))return;const t=tasks[i];
    if(summary(tasks,i)||!dates){done.add(i);return;}
    if(t.dur>10000)fail('Duração muito grande para recalcular pelo chat.');
    let start=null,end=null;
    for(const p of deps[i]){
      one(p.index);const previous=tasks[p.index];
      let ref=date(p.type==='FS'||p.type==='FF'?previous.end:previous.start);
      if(ref&&p.type==='FS')ref=move(ref,1);
      if(ref&&p.lag)ref=move(ref,p.lag);
      if(ref&&t.unit!=='cd')ref=skip(ref);
      if(ref){if(p.type==='FF'||p.type==='SF'){if(!end||ref>end)end=ref;}else if(!start||ref>start)start=ref;}
    }
    if(!deps[i].length){start=date(t.start);if(start&&t.unit!=='cd')start=skip(start);end=start?(t.mile?new Date(start):edge(start,t.dur||1,t.unit)):null;}
    else if(t.mile){start=!start||end&&end>start?end:start;end=start?new Date(start):null;}
    else if(start){const calculated=edge(start,t.dur||1,t.unit);if(end&&calculated<end)start=edge(end,t.dur||1,t.unit,-1);else end=calculated;}
    else if(end)start=edge(end,t.dur||1,t.unit,-1);
    if(start)t.start=iso(start);if(end)t.end=iso(end);done.add(i);
  }
  tasks.forEach((_,i)=>one(i));
  for(let i=tasks.length-1;i>=0;i--)if(summary(tasks,i)){
    const children=[];for(let j=i+1;j<tasks.length&&tasks[j].indent>tasks[i].indent;j++)children.push(tasks[j]);
    const t=tasks[i];t.pct=Math.round(children.reduce((n,c)=>n+(c.pct||0),0)/children.length);
    if(summaryDates){const starts=children.map(c=>c.start).filter(Boolean).sort(),ends=children.map(c=>c.end).filter(Boolean).sort();
      if(starts.length)t.start=starts[0];if(ends.length)t.end=ends.at(-1);
      if(t.start&&t.end){let d=date(t.start),count=0;while(d<=date(t.end)){if(t.unit==='cd'||!weekend(d))count++;d=move(d,1);}t.dur=Math.max(1,count);}
    }
  }
  return project;
}
