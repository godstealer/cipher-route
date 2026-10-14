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
