import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {initialConfig,validateProfile,validateConfig,proxyValue} from '../extension/core.js';
import {createController,activeLabel} from '../extension/controller.js';
const profile=()=>initialConfig().profiles[0];
function mock(){let effective={levelOfControl:'controllable_by_this_extension',value:{mode:'system'}};const data={};let sets=0,fail=false;const api={proxy:{settings:{get:async()=>structuredClone(effective),set:async({value})=>{sets++;effective={levelOfControl:'controlled_by_this_extension',value}},clear:async()=>{effective={levelOfControl:'controllable_by_this_extension',value:{mode:'system'}}}}},storage:{local:{get:async()=>structuredClone(data),set:async v=>{if(fail)throw Error('disk full');Object.assign(data,structuredClone(v))},remove:async keys=>keys.forEach(k=>delete data[k])}}};return {api,data,get sets(){return sets},setEffective:v=>effective=v,fail:()=>fail=true}}
test('fixed proxy and loopback bypass',()=>{const v=proxyValue(profile());assert.equal(v.mode,'fixed_servers');assert.equal(v.rules.singleProxy.port,8080);assert.ok(v.rules.bypassList.includes('127.0.0.1'))});
test('PAC exact/subdomain boundaries and no fail-open proxy fallback',()=>{const p={...profile(),scheme:'socks5',domains:['example.com','*.test.com']};const v=proxyValue(p);const context={};vm.createContext(context);vm.runInContext(v.pacScript.data,context);const call=h=>context.FindProxyForURL('https://'+h,h);assert.equal(call('EXAMPLE.COM'),'SOCKS5 127.0.0.1:8080');assert.equal(call('a.test.com'),'SOCKS5 127.0.0.1:8080');for(const h of ['test.com','badexample.com','test.com.evil','localhost','127.0.0.1','[::1]'])assert.equal(call(h),'DIRECT');assert.equal(v.pacScript.mandatory,true)});
test('reject injection and malformed config',()=>{for(const patch of [{host:'x; DIRECT'},{host:'http://x'},{port:0},{port:1.5},{port:65536},{domains:['x";alert(1)']},{domains:['https://x']},{tls:{preset:'bogus',version:'auto'}}])assert.throws(()=>validateProfile({...profile(),...patch}));assert.throws(()=>validateConfig({version:1,profiles:[profile(),profile()]}))});
test('TLS unsupported modes cannot silently change browser proxy',async()=>{const m=mock();const c=createController(m.api);const p={...profile(),tls:{preset:'chrome',version:'150'}};await c.save({version:1,profiles:[p]});await assert.rejects(c.apply(p.id),/尚未接入/);assert.equal(m.sets,0)});
test('apply, edit pending, release retain original policy control',async()=>{const m=mock();const c=createController(m.api);let s=await c.apply('local');assert.equal(activeLabel(s),'HTTP Capture');const changed=profile();changed.port=9000;s=await c.save({version:1,profiles:[changed]});assert.match(activeLabel(s),/需重新应用/);assert.equal(m.sets,1);s=await c.apply('local');assert.equal(s.effective.value.rules.singleProxy.port,9000);s=await c.apply('release');assert.equal(s.applied,null);assert.equal(s.effective.levelOfControl,'controllable_by_this_extension')});
test('policy conflicts refuse mutation',async()=>{const m=mock();m.setEffective({levelOfControl:'controlled_by_other_extensions',value:{mode:'direct'}});await assert.rejects(createController(m.api).apply('local'),/其他扩展/);assert.equal(m.sets,0)});
test('storage failure restores previous proxy',async()=>{const m=mock();const c=createController(m.api);await c.apply('system');m.fail();await assert.rejects(c.apply('direct'),/disk full/);assert.equal((await m.api.proxy.settings.get()).value.mode,'system')});
test('saved config survives new controller instance',async()=>{const m=mock();const p=profile();p.name='业务 A';await createController(m.api).save({version:1,profiles:[p]});assert.equal((await createController(m.api).snapshot()).config.profiles[0].name,'业务 A')});

test('disabled TLS preserves custom settings and uses ordinary proxy',async()=>{const m=mock();const c=createController(m.api);const p={...profile(),tls:{enabled:false,preset:'custom',version:'unfinished',helloHex:'draft'}};await c.save({version:1,profiles:[p]});const s=await c.apply(p.id);assert.equal(s.effective.value.mode,'fixed_servers');for(const [k,v] of Object.entries(p.tls))assert.deepEqual(s.config.tlsProfiles[0][k],v);assert.equal(s.config.modes[0].tlsId,null);assert.equal(profile().tls.enabled,false)});
test('enabled TLS refuses activation without changing previous proxy',async()=>{const m=mock();const c=createController(m.api);await c.apply('direct');const p={...profile(),tls:{enabled:true,preset:'chrome',version:'150'}};await c.save({version:1,profiles:[p]});await assert.rejects(c.apply(p.id),/尚未接入/);assert.equal((await m.api.proxy.settings.get()).value.mode,'direct')});

test('shared resources compose independently and changes require reapply',async()=>{const m=mock(),c=createController(m.api);let cfg=initialConfig();cfg.modes.push({id:'secure',name:'TLS 模式',proxyId:'local',tlsId:'local',domains:[]});cfg=validateConfig(cfg);await c.save(cfg);await c.apply('local');await assert.rejects(c.apply('secure'),/尚未接入/);assert.equal(m.sets,1);cfg.proxies[0].port=9001;const state=await c.save(cfg);assert.match(activeLabel(state),/需重新应用/);assert.equal(state.config.profiles[1].port,9001);assert.equal(state.config.profiles[0].tls.enabled,false);assert.equal(state.config.profiles[1].tls.enabled,true);assert.equal(m.data.config.version,2);assert.equal(m.data.config.profiles,undefined)});
test('missing references and duplicate resources rejected',()=>{let c=initialConfig();c.proxies=[];assert.throws(()=>validateConfig(c),/代理配置不存在/);c=initialConfig();c.modes[0].tlsId='missing';assert.throws(()=>validateConfig(c),/TLS 配置不存在/);c=initialConfig();c.proxies.push(c.proxies[0]);assert.throws(()=>validateConfig(c),/重复/)});

test('v1 migration preserves long names and disabled drafts without mutating input',()=>{
 const p={...profile(),name:'长'.repeat(80),tls:{enabled:false,preset:'custom',version:'draft',helloHex:'unfinished'}};
 const old={version:1,profiles:[p]},before=structuredClone(old);
 const migrated=validateConfig(old);
 assert.deepEqual(old,before);assert.equal(migrated.modes[0].name,p.name);
 assert.equal(migrated.modes[0].tlsId,null);assert.equal(migrated.tlsProfiles[0].helloHex,'unfinished');
 assert.deepEqual(validateConfig(migrated),migrated);
});
test('domain rules belong to each mode, not shared proxy',()=>{
 const c=initialConfig();c.modes[0].domains=['a.example.com'];
 c.modes.push({...c.modes[0],id:'second',name:'第二模式',domains:['b.example.com']});
 const resolved=validateConfig(c);
 for(const [index,match,other] of [[0,'a.example.com','b.example.com'],[1,'b.example.com','a.example.com']]){
  const ctx={};vm.createContext(ctx);vm.runInContext(proxyValue(resolved.profiles[index]).pacScript.data,ctx);
  assert.equal(ctx.FindProxyForURL('',match),'PROXY 127.0.0.1:8080');assert.equal(ctx.FindProxyForURL('',other),'DIRECT');
 }
});
test('unreferenced TLS edits do not change active ordinary mode',async()=>{
 const m=mock(),c=createController(m.api);await c.apply('local');const cfg=(await c.snapshot()).config;
 cfg.tlsProfiles[0].version='150';const s=await c.save(cfg);
 assert.equal(activeLabel(s),'HTTP Capture');assert.equal(m.sets,1);assert.equal(s.config.profiles[0].tls.enabled,false);
});
test('invalid reference deletion does not overwrite persisted config or active proxy',async()=>{
 const m=mock(),c=createController(m.api);await c.save(initialConfig());await c.apply('local');const before=structuredClone(m.data);
 const cfg=(await c.snapshot()).config;cfg.proxies=[];
 await assert.rejects(c.save(cfg),/代理配置不存在/);assert.deepEqual(m.data,before);assert.equal(m.sets,1);
});
test('v2 reload resolves references and ignores stale derived profiles',async()=>{
 const m=mock(),c=createController(m.api),cfg=initialConfig();cfg.proxies[0].port=9123;
 cfg.profiles[0].port=1;await c.save(cfg);const next=createController(m.api),s=await next.apply('local');
 assert.equal(s.effective.value.rules.singleProxy.port,9123);assert.equal(m.data.config.profiles,undefined);
});

import {webcrypto} from 'node:crypto';
import {importOmega} from '../extension/omega-import.js';
globalThis.crypto??=webcrypto;
test('ZeroOmega imports fixed proxy and exact bypass list without enabling TLS',()=>{
 const c=initialConfig();const raw=JSON.stringify({schemaVersion:2,'+test':{name:'Imported',profileType:'FixedProfile',fallbackProxy:{scheme:'http',host:'127.0.0.1',port:9000},bypassList:[{conditionType:'BypassCondition',pattern:'localhost'}]},'+auto':{name:'Auto',profileType:'SwitchProfile',rules:[],defaultProfileName:'direct'}});
 const result=importOmega(raw,c);assert.equal(result.count,1);assert.equal(result.warnings.length,1);assert.equal(c.modes.length,1);
 const p=result.config.profiles.at(-1);assert.equal(p.tls.enabled,false);assert.deepEqual(proxyValue(p).rules.bypassList,['localhost']);
 assert.throws(()=>proxyValue({...p,domains:['example.com']}),/暂不支持域名分流/);
 assert.equal(importOmega(raw,result.config).config.modes.length,3);
});
test('ZeroOmega rejects invalid input and skips unsupported auth',()=>{
 assert.throws(()=>importOmega('bad',initialConfig()),/JSON/);
 assert.throws(()=>importOmega('{}',initialConfig()),/ZeroOmega/);
 const result=importOmega(JSON.stringify({schemaVersion:2,'+secret':{name:'Auth',profileType:'FixedProfile',auth:{username:'test',password:'test'}}}),initialConfig());assert.equal(result.count,0);assert.equal(result.warnings.length,1);
});

test('native TLS resource remains an ordinary proxy without a local host',async()=>{const m=mock(),c=createController(m.api),cfg=initialConfig();cfg.tlsProfiles[0].preset='browser';cfg.modes[0].tlsId='local';await c.save(cfg);assert.equal((await c.apply('local')).effective.value.mode,'fixed_servers')});
test('TLS protocol settings persist and invalid selections are rejected',()=>{const cfg=initialConfig();cfg.tlsProfiles[0]={...cfg.tlsProfiles[0],enabled:true,protocol:'h2',tlsVersion:'1.3'};cfg.modes[0].tlsId='local';assert.equal(validateConfig(cfg).profiles[0].tls.protocol,'h2');cfg.tlsProfiles[0].protocol='h3';assert.throws(()=>validateConfig(cfg),/HTTP 协议/);cfg.tlsProfiles[0].protocol='auto';cfg.tlsProfiles[0].tlsVersion='1.0';assert.throws(()=>validateConfig(cfg),/TLS 协议版本/)});

test('native preparation commits after browser update and rolls back storage failure',async()=>{
 const m=mock(),calls=[];m.api.native={call:async(type)=>{calls.push(type);return type==='prepare'?{sessionId:'s',host:'127.0.0.1',port:32123}:{}}};const c=createController(m.api),cfg=initialConfig();cfg.modes[0].tlsId='local';await c.save(cfg);await c.apply('local');assert.deepEqual(calls,['prepare','commit']);assert.equal((await c.snapshot()).effective.value.rules.singleProxy.port,32123);await c.apply('direct');assert.equal(calls.at(-1),'deactivate');m.fail();await assert.rejects(c.apply('local'),/disk full/);assert.equal(calls.at(-1),'abort');assert.equal((await m.api.proxy.settings.get()).value.mode,'direct');
});
test('ordinary activation never starts native host',async()=>{const m=mock();m.api.native={call:async()=>{throw Error('should not run')}};await createController(m.api).apply('local')});

import {readFileSync} from 'node:fs';
import {createHash,createPublicKey} from 'node:crypto';
test('fixed extension identity agrees with native installer',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../extension/manifest.json',import.meta.url),'utf8'));
 const key=Buffer.from(manifest.key,'base64');assert.equal(createPublicKey({key,format:'der',type:'spki'}).asymmetricKeyType,'rsa');
 const id=[...createHash('sha256').update(key).digest('hex').slice(0,32)].map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
 assert.equal(id,'kejpkbdliekmgpagfceglikahmchoabg');
 const installer=readFileSync(new URL('../native/install-windows.ps1',import.meta.url),'utf8');assert.ok(installer.includes("$ExtensionId='"+id+"'"));assert.ok(!installer.includes('[string]$ExtensionId'));
});

// Regression: options pages opened as tabs must be able to read/save configuration.
const {trustedMessageSource}=await import('../extension/message-source.js');
test('options tab is trusted, content scripts and foreign pages are rejected',()=>{
 const id='kejpkbdliekmgpagfceglikahmchoabg';
 const runtime={id,getURL:p=>`chrome-extension://${id}/${p}`};
 assert.equal(trustedMessageSource({id,url:runtime.getURL('options.html'),tab:{id:7}},runtime),true);
 assert.equal(trustedMessageSource({id,url:runtime.getURL('options.html')+'?section=proxy#edit',tab:{id:7}},runtime),true);
 assert.equal(trustedMessageSource({id,url:runtime.getURL('popup.html')},runtime),true);
 for(const sender of [{id,url:'https://example.com',tab:{id:7}},{id:'other',url:runtime.getURL('options.html')},{id,url:runtime.getURL('other.html')},{id},{id,url:'invalid'}]) assert.equal(trustedMessageSource(sender,runtime),false);
});

test('background accepts options-tab create, edit, reload and delete requests',async()=>{
 const prior=globalThis.chrome;let listener;const data={};
 const id='kejpkbdliekmgpagfceglikahmchoabg';
 globalThis.chrome={runtime:{id,getURL:p=>`chrome-extension://${id}/${p}`,onMessage:{addListener:fn=>listener=fn}},
 storage:{local:{get:async keys=>Object.fromEntries(keys.filter(k=>k in data).map(k=>[k,structuredClone(data[k])])),set:async values=>Object.assign(data,structuredClone(values))}},
 proxy:{settings:{get:(_d,cb)=>cb({levelOfControl:'controllable_by_this_extension',value:{mode:'system'}}),onChange:{addListener(){}}},onProxyError:{addListener(){}}},action:{setBadgeText:async()=>{}}};
 try{
  await import('../extension/background.js?options-tab-test');
  const sender={id,url:chrome.runtime.getURL('options.html'),tab:{id:8}};
  const call=message=>new Promise((resolve,reject)=>{const accepted=listener(message,sender,r=>r.ok?resolve(r.value):reject(Error(r.error)));if(!accepted)reject(Error('Options message rejected'));});
  let s=await call({type:'snapshot'});
  s.config.proxies.push({id:'test-proxy',name:'Test proxy',scheme:'http',host:'127.0.0.1',port:9000});
  s.config.modes.push({id:'test-mode',name:'Test mode',proxyId:'test-proxy',tlsId:null,domains:[]});
  s=await call({type:'save',config:s.config});assert.equal(s.config.modes.at(-1).name,'Test mode');
  s.config.modes.at(-1).name='Edited mode';await call({type:'save',config:s.config});
  s=await call({type:'snapshot'});assert.equal(s.config.modes.at(-1).name,'Edited mode');
  s.config.modes=s.config.modes.filter(p=>p.id!=='test-mode');s.config.proxies=s.config.proxies.filter(p=>p.id!=='test-proxy');
  await call({type:'save',config:s.config});s=await call({type:'snapshot'});assert.equal(s.config.modes.some(p=>p.id==='test-mode'),false);
 }finally{globalThis.chrome=prior;}
});

test('Auto ordered routing, default, domain boundaries and no native TLS',async()=>{
 const cfg=initialConfig();cfg.proxies.push({id:'second',name:'Second',scheme:'socks5',host:'127.0.0.1',port:9000});
 cfg.modes.push({id:'auto-test',name:'Auto',type:'auto',tlsId:null,defaultProxyId:'second',rules:[{domain:'private.example.com',proxyId:null},{domain:'*.example.com',proxyId:'local'},{domain:'example.com',proxyId:'second'}]});
 const m=mock();m.api.native={call:async()=>{throw Error('Native must not be started')}};const c=createController(m.api);await c.save(cfg);const applied=await c.apply('auto-test');
 const ctx={};vm.createContext(ctx);vm.runInContext(applied.effective.value.pacScript.data,ctx);const route=h=>ctx.FindProxyForURL('https://'+h,h);
 assert.equal(route('private.example.com'),'DIRECT');assert.equal(route('A.EXAMPLE.COM'),'PROXY 127.0.0.1:8080');assert.equal(route('example.com'),'SOCKS5 127.0.0.1:9000');assert.equal(route('example.com.evil'),'SOCKS5 127.0.0.1:9000');assert.equal(route('localhost'),'DIRECT');
 assert.equal(applied.config.profiles.at(-1).tls.enabled,false);
 cfg.proxies[0].port=8888;assert.match(activeLabel(await c.save(cfg)),/需重新应用/);
 cfg.modes.at(-1).defaultProxyId=null;const direct=proxyValue(validateConfig(cfg).profiles.at(-1));vm.runInContext(direct.pacScript.data,ctx);assert.equal(route('other.test'),'DIRECT');
});
test('Auto rejects TLS, dangling proxy references and invalid rules',()=>{
 const cfg=initialConfig();const mode={id:'auto-test',name:'Auto',type:'auto',tlsId:null,defaultProxyId:null,rules:[]};cfg.modes.push(mode);
 assert.equal(proxyValue(validateConfig(cfg).profiles.at(-1)).mode,'pac_script');
 mode.tlsId='local';assert.throws(()=>validateConfig(cfg),/不能设置/);mode.tlsId=null;
 mode.rules=[{domain:'a.com',proxyId:'missing'}];assert.throws(()=>validateConfig(cfg),/不存在/);
 mode.rules=[{domain:'https://a.com',proxyId:null}];assert.throws(()=>validateConfig(cfg),/域名规则/);
 mode.rules=[];mode.defaultProxyId='missing';assert.throws(()=>validateConfig(cfg),/不存在/);
});

test('storage property order does not report pending edits; real edits can reapply',async()=>{
 const {pendingApplyAction}=await import('../extension/controller.js');
 const m=mock(),c=createController(m.api);let s=await c.apply('local');
 const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,v])=>[k,reorder(v)])):v;
 s.applied=reorder(s.applied);s.effective=reorder(s.effective);
 assert.equal(activeLabel(s),'HTTP Capture');assert.equal(pendingApplyAction(s),null);
 s.config.proxies[0].port=9001;s=await c.save(s.config);
 assert.equal(pendingApplyAction(s),'local');s=await c.apply(pendingApplyAction(s));
 assert.equal(s.effective.value.rules.singleProxy.port,9001);assert.equal(pendingApplyAction(s),null);
 s.effective.levelOfControl='controlled_by_other_extensions';assert.equal(pendingApplyAction(s),null);
});

test('popup selection tracks effective action, not unsaved edits or failed switches',async()=>{
 const {activeAction}=await import('../extension/controller.js');const m=mock(),c=createController(m.api);
 assert.equal(activeAction(await c.snapshot()),null);
 assert.equal(activeAction(await c.apply('direct')),'direct');assert.equal(activeAction(await c.apply('system')),'system');
 let s=await c.apply('local');assert.equal(activeAction(s),'local');s.config.proxies[0].port=9002;s=await c.save(s.config);assert.equal(activeAction(s),'local');
 await assert.rejects(c.apply('missing'));assert.equal(activeAction(await c.snapshot()),'local');
 s.effective={levelOfControl:'controlled_by_this_extension',value:{mode:'direct'}};assert.equal(activeAction(s),null);
 assert.equal(activeAction(await c.apply('release')),null);
});
