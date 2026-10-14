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
