import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {initialConfig,validateConfig,proxyValue} from '../extension/core.js';

// Opt-in live test. Never changes browser or OS proxy settings.
const proxyUrl=new URL(process.env.CIPHER_ROUTE_TEST_PROXY??'http://127.0.0.1:9000');
if(proxyUrl.username||proxyUrl.password)throw Error('Test proxy authentication is not supported');
const scheme=proxyUrl.protocol.slice(0,-1);
assert.ok(['http','https','socks5'].includes(scheme),'Unsupported proxy protocol');
const cfg=initialConfig();
cfg.proxies[0]={id:'local',name:'Live test proxy',scheme,host:proxyUrl.hostname,port:Number(proxyUrl.port||(scheme==='https'?443:80))};
cfg.modes=[
 {id:'all',name:'All traffic',proxyId:'local',tlsId:null,domains:[]},
 {id:'match',name:'Match httpbin',proxyId:'local',tlsId:null,domains:['httpbin.org']},
 {id:'bypass',name:'Unmatched direct',proxyId:'local',tlsId:null,domains:['example.invalid']}
];
const resolved=validateConfig(cfg);
function route(profile,url){
 const value=proxyValue(profile);
 if(value.mode==='fixed_servers')return proxyUrl.href;
 const context={};vm.createContext(context);vm.runInContext(value.pacScript.data,context,{timeout:1000});
 const result=context.FindProxyForURL(url,new URL(url).hostname);
 if(result==='DIRECT')return null;
 const expected=({http:'PROXY',https:'HTTPS',socks5:'SOCKS5'})[scheme]+' '+cfg.proxies[0].host+':'+cfg.proxies[0].port;
 assert.equal(result,expected);return proxyUrl.href;
}
const cases=[['all','http:',true],['all','https:',true],['match','https:',true],['bypass','https:',false]];
let failed=0;
for(const [id,protocol,proxied]of cases){
 const marker=`cipher-route-${id}-${protocol.slice(0,-1)}`;
 const url=`${protocol}//httpbin.org/get?hello_proxy_test=${marker}`;
 try{
  const selected=route(resolved.profiles.find(p=>p.id===id),url);
  assert.equal(Boolean(selected),proxied);
  const args=['--silent','--show-error','--fail','--connect-timeout','8','--max-time','25','--proxy',selected??'','--noproxy',selected?'':'*','--header',`X-CipherRoute-Test: ${marker}`,url];
  if(process.env.CIPHER_ROUTE_REVOCATION_BEST_EFFORT==='1')args.unshift('--ssl-revoke-best-effort');
  const body=execFileSync(process.platform==='win32'?'curl.exe':'curl',args,{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});
  const result=JSON.parse(body);
  assert.equal(result.args.hello_proxy_test,marker);
  const headers=Object.fromEntries(Object.entries(result.headers).map(([k,v])=>[k.toLowerCase(),v]));
  assert.equal(headers['x-helloproxy-test'],marker);assert.equal(result.url,url);assert.ok(result.origin);
  console.log(`PASS ${id} ${protocol} route=${selected?'proxy':'direct'} origin=${result.origin}`);
 }catch(error){failed++;console.error(`FAIL ${id} ${protocol}: ${error.stderr?.toString().trim()||error.message}`)}
}
console.log(`${cases.length-failed}/${cases.length} passed. Config/PAC + curl only; browser extension activation is NOT covered.`);
process.exitCode=failed?1:0;
