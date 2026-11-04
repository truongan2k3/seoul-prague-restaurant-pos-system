/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS VM harness loads the actual TypeScript modules with mocked devices. */
const fs=require('fs'), vm=require('vm'), ts=require('typescript'), assert=require('node:assert/strict');
const effects=[],timers=[],messages=[],tickets=[];let insert;
const cfg={kitchenPrintEnabled:true,kitchenPrintViaStation:true,kitchenFulfillmentMode:'both',silentPrintEnabled:true};
const react={useState:v=>[v,()=>{}],useRef:v=>({current:v}),useCallback:f=>f,useEffect:f=>effects.push(f)};
const mock={...react,jsx:()=>null,jsxs:()=>null,useApp:()=>({translate:k=>k,language:'en',setLanguage:()=>{}}),useSettings:()=>({settings:cfg}),shouldPrintKitchenOnSend:s=>s.kitchenPrintEnabled,
 isKitchenMessageOrder:o=>Boolean(o?.modifiers?.kitchenMessage),normalizeOrderItemStatus:s=>s,
 loadPendingKitchenPrints:()=>[],subscribeToPosSoftRefresh:()=>()=>{},subscribePosSoftRefresh:()=>()=>{},subscribeToKitchenPrintMessage:()=>()=>{},subscribeToPostgresRowChanges:()=>()=>{},subscribeToMenuChanges:()=>()=>{},
 subscribeToOrderItemInserts:fn=>{insert=fn;return ()=>{};},fetchTableSummaries:async()=>({data:[]}),loadMenuItemsResolved:async()=>({data:[]}),pingPrintBridge:async()=>({ok:true,message:'OK'}),
 mapTableRow:row=>row,mapOrderItemRow:row=>({...row,notesTranslated:row.notes_translated,createdAt:row.created_at}),
 printKitchenMessage:async job=>messages.push(job),printKitchenTicket:async job=>tickets.push(job),broadcastPrintOk:async()=>{},broadcastPrintFailed:async()=>{},};
const componentExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/print-station-view.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:componentExports,require:()=>mock,Date,Map,Set,console,window:{setInterval:()=>1,clearInterval:()=>{},setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout:()=>{}}});
(async()=>{
 componentExports.PrintStationView();effects.forEach(f=>f());
 const message={id:'msg-1',table_id:'table-a',status:'preparing',skip_print:true,modifiers:{kitchenMessage:true},notes:'No chilli',notes_translated:'不要辣',name:'不要辣'};
 insert(message);insert(message);
 insert({id:'skip',table_id:'table-a',status:'preparing',skip_print:true});
 insert({id:'dish',table_id:'table-a',status:'preparing',skip_print:false,name:'Hunan'});
 timers.forEach(f=>f());
 for(let i=0;i<25;i++) await Promise.resolve();
 assert.equal(messages.length,1);assert.equal(messages[0].message,'No chilli');assert.equal(messages[0].messageZh,'不要辣');
 assert.equal(tickets.length,1);assert.equal(tickets[0].orders.length,1);assert.equal(tickets[0].orders[0].name,'Hunan');
 console.log('PASS: persisted table message prints once despite skip_print, preserves translation, avoids duplicate insert, leaves skipped lines unprinted, and ordinary dishes still print.');
})().catch(e=>{console.error(e);process.exitCode=1;});
