import {validateConfig} from './core.js';
export function importOmega(text,current){
 if(text.length>5*1024*1024)throw Error('备份超过 5 MiB');
 let source;try{source=JSON.parse(text.replace(/^\uFEFF/,''))}catch{throw Error('备份不是有效 JSON')}
 if(!source||typeof source!=='object'||!('schemaVersion' in source))throw Error('不是可识别的 ZeroOmega 备份');
 const config=validateConfig(current),warnings=[];let count=0;
 for(const [key,p]of Object.entries(source)){
  if(!key.startsWith('+')||!p||typeof p!=='object')continue;
  const name=typeof p.name==='string'?p.name:key.slice(1);
  if(p.profileType!=='FixedProfile'){warnings.push(name+'：未导入自动切换/PAC 等配置；若无规则且默认 direct，请使用直连按钮。');continue}
  if(p.proxyForHttp||p.proxyForHttps||p.proxyForFtp||p.auth||p.fallbackProxy?.username||p.fallbackProxy?.password){warnings.push(name+'：分协议代理或认证暂不支持，已跳过。');continue}
  if(!p.fallbackProxy||!Array.isArray(p.bypassList)||p.bypassList.some(b=>b.conditionType!=='BypassCondition'||typeof b.pattern!=='string')){warnings.push(name+'：缺少代理或绕过规则不支持，已跳过。');continue}
  const id=crypto.randomUUID();const proxy={id,name,scheme:p.fallbackProxy.scheme,host:p.fallbackProxy.host,port:p.fallbackProxy.port,bypassList:p.bypassList.map(b=>b.pattern)};
  try{const next=validateConfig({...config,proxies:[...config.proxies,proxy],modes:[...config.modes,{id,name,proxyId:id,tlsId:null,domains:[]}]});config.proxies=next.proxies;config.modes=next.modes;count++}catch{warnings.push(name+'：代理类型、地址或绕过规则不支持，已跳过。')}
 }
 return {config:validateConfig(config),count,warnings};
}
