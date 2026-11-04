/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS VM harness loads the actual TypeScript modules with mocked devices. */
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const code = ts.transpileModule(fs.readFileSync('lib/pos-notifications.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function harness(result='ok') {
 const handlers = {}, timers = new Map(), sent=[]; let seq=0, removed=0, status;
 const channel={on(_type,{event},fn){handlers[event]=fn;return this;},subscribe(fn){status=fn;return this;},async send(p){sent.push(p);return result;}};
 const exports={};
 vm.runInNewContext(code,{exports,require:()=>({supabase:{channel:()=>channel,removeChannel:()=>{removed++;return Promise.resolve();}}}),crypto:{randomUUID:()=> 'job-1'},setTimeout:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;},clearTimeout:id=>timers.delete(id),Date});
 return {api:exports,sent,timers,handlers,status:s=>status(s),removed:()=>removed};
}
const input={message:'No chilli',messageZh:'No chilli'};
(async()=>{
 let h=harness(), done=false;
 let pending=h.api.broadcastKitchenPrintMessage(input).then(()=>done=true);
 h.status('SUBSCRIBED');await Promise.resolve();
 assert.equal(done,false);
 h.handlers.kitchen_print_message_result({payload:{jobId:'another-job'}});await Promise.resolve();assert.equal(done,false);
 h.handlers.kitchen_print_message_result({payload:{jobId:'job-1'}});await pending;
 assert.equal(done,true);assert.equal(h.removed(),1);assert.equal(h.timers.size,0);
 for(const result of ['error','timed out']) {
  h=harness(result);pending=h.api.broadcastKitchenPrintMessage(input);h.status('SUBSCRIBED');
  await assert.rejects(pending,/send failed/);assert.equal(h.removed(),1);
 }
 h=harness();pending=h.api.broadcastKitchenPrintMessage(input);h.status('SUBSCRIBED');
 h.handlers.kitchen_print_message_result({payload:{jobId:'job-1',error:'Printer offline'}});
 await assert.rejects(pending,/Printer offline/);assert.equal(h.removed(),1);
 h=harness();pending=h.api.broadcastKitchenPrintMessage(input);h.status('SUBSCRIBED');
 [...h.timers.values()].find(t=>t.ms===30000).fn();
 await assert.rejects(pending,/did not confirm/);assert.equal(h.removed(),1);
 h=harness();pending=h.api.broadcastKitchenPrintMessage(input);h.status('CHANNEL_ERROR');
 await assert.rejects(pending,/CHANNEL_ERROR/);assert.equal(h.removed(),1);assert.equal(h.timers.size,0);
 h=harness();h.api.subscribeToKitchenPrintMessage((_payload,ack)=>ack('Paper out'));
 h.handlers.kitchen_print_message({payload:{jobId:'job-1',...input}});
 assert.equal(h.sent[0].event,'kitchen_print_message_result');assert.equal(h.sent[0].payload.jobId,'job-1');assert.equal(h.sent[0].payload.error,'Paper out');
 h.handlers.kitchen_print_message({payload:input});assert.equal(h.sent.length,1);
 console.log('PASS: message waits for matching station confirmation; send failure, printer failure, offline timeout and channel failure reject; cleanup always runs; receiver responds by job ID and handles older senders.');
})().catch(e=>{console.error(e);process.exitCode=1;});
