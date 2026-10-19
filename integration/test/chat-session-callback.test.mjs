import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {chatCallback,chatConfig} from '../src/chat-http.mjs';
const config={origins:['https://app.example','https://other-app.example'],publicUrl:'https://integration.example',issuer:'https://issuer.example',audience:'https://integration.example/mcp'};
test('silent callback posts only to configured origins and clears code/state from the frame URL',async()=>{
 const response=chatCallback(config),html=await response.text(),script=html.match(/<script>([\s\S]*)<\/script>/)[1],sent=[],history=[];
 const parent={postMessage:(data,origin)=>sent.push({data,origin})},window={opener:null,parent};
 vm.runInNewContext(script,{window,location:{search:'?code=synthetic-code&state=synthetic-state'},history:{replaceState:(...args)=>history.push(args)},URLSearchParams,document:{getElementById:()=>({textContent:''})}});
 assert.deepEqual(sent.map(m=>m.origin),config.origins);assert(sent.every(m=>m.data.code==='synthetic-code'&&m.data.state==='synthetic-state'));assert.equal(history[0][2],'/chat/callback');
 assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors https:\/\/app.example https:\/\/other-app.example$/);assert(!response.headers.get('Content-Security-Policy').includes('*'));
 const metadata=chatConfig({CHAT_CLIENT_ID:'public'},config);assert.equal(metadata.features.session.silent,true);
});
