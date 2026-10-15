export function resolveAuto(mode, proxies) {
 if(mode.tlsId!=null)throw Error('Auto 模式不能设置自定义 TLS');
 if(!Array.isArray(mode.rules)||mode.rules.length>500)throw Error('Auto 最多支持 500 条规则');
 const target=id=>{if(id===null)return null;const p=proxies.find(p=>p.id===id);if(!p)throw Error('Auto 引用的代理配置不存在');return {id:p.id,scheme:p.scheme,host:p.host,port:p.port};};
 const rules=mode.rules.map(r=>{
  if(!r||typeof r.domain!=='string'||r.domain.length>253||! /^(\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(r.domain)||r.domain.includes('..'))throw Error('Auto 域名规则使用 example.com 或 *.example.com');
  return {domain:r.domain,proxy:target(r.proxyId)};
 });
 return {id:mode.id,name:mode.name,type:'auto',rules,defaultProxy:target(mode.defaultProxyId),tls:{enabled:false,preset:'browser',version:'auto'}};
}
export function autoProxyValue(p){
 if(p.tls?.enabled||p.tls?.preset!=='browser')throw Error('Auto 仅使用浏览器原生 TLS');
 const target=proxy=>{
  if(proxy===null)return 'DIRECT';
  if(!proxy||!['http','https','socks5'].includes(proxy.scheme)||!Number.isInteger(proxy.port)||proxy.port<1||proxy.port>65535||typeof proxy.host!=='string'||! /^[a-zA-Z0-9.:[\]-]+$/.test(proxy.host))throw Error('Auto 代理目标无效');
  return ({http:'PROXY',https:'HTTPS',socks5:'SOCKS5'})[proxy.scheme]+' '+proxy.host+':'+proxy.port;
 };
 const rules=p.rules.map(r=>({domain:r.domain,target:target(r.proxy)}));
 return {mode:'pac_script',pacScript:{mandatory:true,data:`function FindProxyForURL(url,host){host=host.toLowerCase();if(host==='localhost'||host==='127.0.0.1'||host==='::1'||host==='[::1]'||host.indexOf('.')<0)return 'DIRECT';var rules=${JSON.stringify(rules)};for(var i=0;i<rules.length;i++){var r=rules[i],d=r.domain;if(d.slice(0,2)==='*.'?host.length>d.length-1&&host.slice(-(d.length-1))===d.slice(1):host===d)return r.target;}return ${JSON.stringify(target(p.defaultProxy))};}`}};
}
