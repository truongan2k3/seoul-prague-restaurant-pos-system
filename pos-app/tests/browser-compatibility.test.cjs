/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser API mocks validate the actual TypeScript compatibility helpers. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const ts=require('typescript');
const api={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/browser-compatibility.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api});
function browser(native=false){
 const values=new Map(),events=new Map();
 const doc={documentElement:{clientHeight:640,style:{getPropertyValue:k=>values.get(k)||'',getPropertyPriority:()=>'',setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)}},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 const win={innerHeight:768,CSS:{supports:()=>native},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 return {win,doc,values,events};
}
test('native dvh keeps browser sizing and installs no fallback listeners',()=>{
 const b=browser(true);api.installLegacyViewportHeight(b.win,b.doc)();
 assert.equal(b.events.size,0);assert.equal(b.values.size,0);
});
test('old browser viewport follows resize, rotation and standard/prefixed fullscreen changes',()=>{
 const b=browser();const stop=api.installLegacyViewportHeight(b.win,b.doc);
 assert.equal(b.values.get('--legacy-viewport-height'),'768px');
 for(const event of ['resize','orientationchange','fullscreenchange','webkitfullscreenchange']){
  b.win.innerHeight+=20;b.events.get(event)();assert.equal(b.values.get('--legacy-viewport-height'),`${b.win.innerHeight}px`);
 }
 stop();assert.equal(b.events.size,0);assert.equal(b.values.size,0);
});
test('fallback works without CSS.supports and uses clientHeight if innerHeight is unavailable',()=>{
 const b=browser();b.win.CSS=undefined;b.win.innerHeight=0;
 const stop=api.installLegacyViewportHeight(b.win,b.doc);assert.equal(b.values.get('--legacy-viewport-height'),'640px');stop();
});
test('cleanup restores a pre-existing viewport variable',()=>{
 const b=browser();b.values.set('--legacy-viewport-height','123px');
 api.installLegacyViewportHeight(b.win,b.doc)();assert.equal(b.values.get('--legacy-viewport-height'),'123px');
});
test('media queries use legacy addListener/removeListener when event methods are missing',()=>{
 let registered,removed;const listener=()=>{};
 const stop=api.listenMediaQueryChange({addListener:fn=>registered=fn,removeListener:fn=>removed=fn},listener);
 assert.equal(registered,listener);stop();assert.equal(removed,listener);
});
test('modern media query listeners use the change event and clean up',()=>{
 const calls=[];const listener=()=>{};
 api.listenMediaQueryChange({addEventListener:(...args)=>calls.push(args),removeEventListener:(...args)=>calls.push(args)},listener)();
 assert.equal(calls.length,2);assert.equal(calls[0][0],'change');assert.equal(calls[1][1],listener);
});

test('legacy CSS fallback flattens layers without changing modern stylesheet layers',async()=>{
 const postcss=require('postcss');
 const plugin=require('../postcss.legacy-browser.cjs');
 const source='@layer theme,base,utilities; @layer theme{:root{--ink:oklch(50% .1 40)}} @layer utilities{.flex{display:flex}.ink{color:oklch(50% .1 40)}} @property --test{syntax:"<number>";inherits:false;initial-value:0}';
 const result=await postcss([plugin()]).process(source,{from:path.resolve(__dirname,'../app/globals.css')});
 const fallback=result.root.nodes.find(node=>node.type==='atrule'&&node.name==='supports'&&node.params.includes('100dvh'));
 assert.ok(fallback);
 assert.ok(result.root.nodes.some(node=>node.type==='atrule'&&node.name==='layer'));
 fallback.walkAtRules('layer',()=>assert.fail('Legacy CSS still contains cascade layers'));
 fallback.walkAtRules('property',()=>assert.fail('Legacy CSS still requires property registration'));
 assert.ok(fallback.toString().includes('display:flex'));
 assert.match(fallback.toString(),/color:(?:#[0-9a-f]+|rgb\()/i);
 const other=await postcss([plugin()]).process('.dialog{color:red}',{from:path.resolve(__dirname,'../components/dialog.css')});
 assert.equal(other.css,'.dialog{color:red}');
});
