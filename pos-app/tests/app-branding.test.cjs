/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS VM harness validates routes with isolated branding data. */
const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const moduleExports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,{exports:moduleExports,require:id=>mocks[id]||require(id),URL,URLSearchParams,Response,Request,AbortSignal,Buffer,process:{env:{NEXT_PUBLIC_SUPABASE_URL:"https://branding-test.supabase.co"}},console});return moduleExports;}
(async()=>{
 const {buildBrandedManifest,appBrandingUrls}=load('lib/app-branding.ts');
 const business={id:'12345678-1234-1234-1234-123456789012',name:'Seoul Korean BBQ Prague - Vaclavske Namesti',logoUrl:'https://example.com/logo.svg?v=2&x=1'};
 const manifest=buildBrandedManifest(business);
 assert.equal(manifest.id,'/app');assert.equal(manifest.icons.length,4);
 for(const icon of manifest.icons){const url=new URL(icon.src,'https://pos.example');assert.equal(url.searchParams.get('v'),business.logoUrl);assert.equal(url.searchParams.get('business'),business.id);assert.equal(icon.type,'image/png');}
 assert.notEqual(appBrandingUrls(business.id,'a').icon(32),appBrandingUrls(business.id,'b').icon(32));
 const security=load('src/lib/app-branding.ts',{'@/src/lib/supabase-admin':{}});
 const origin="https://branding-test.supabase.co";
 assert.equal(security.isBusinessLogoUrl(`${origin}/storage/v1/object/public/business_branding/${business.id}/logo.svg`,business.id),true);
 assert.equal(security.isBusinessLogoUrl('http://127.0.0.1:39100/health',business.id),false);
 assert.equal(security.isBusinessLogoUrl(`${origin}/storage/v1/object/public/business_branding/other/logo.svg`,business.id),false);
 const output={};
 const source=ts.transpileModule(fs.readFileSync('app/api/app-branding/icon/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText.replace('catch {', 'catch(error) { console.error(error);');
 vm.runInNewContext(source,{exports:output,require:id=>id==='@/src/lib/app-branding'?{readPublicAppBranding:async()=>business,isBusinessLogoUrl:()=>true}:require(id),URL,Response,AbortSignal,Buffer,console,fetch:async()=>new Response('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="white"/></svg>',{headers:{'Content-Type':'image/svg+xml'}})});
 for(const size of [32,180,192,512]){
  const response=await output.GET(new Request(`https://pos.example/api/app-branding/icon?business=${business.id}&size=${size}`));
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
  const png=Buffer.from(await response.arrayBuffer());assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
 }
 console.log('PASS: branded manifest, stable app ID, versioned logo URLs, restricted logo sources, and SVG logo rasterization to PNG at 32/180/192/512px.');
})().catch(e=>{console.error(e);process.exitCode=1;});
