export const tlsEnabled=p=>p.tls?.enabled??(!!p.tls&&p.tls.preset!=='browser');
export const initialConfig = () => validateConfig({version:1, profiles:[{id:'local',name:'HTTP Capture',scheme:'http',host:'127.0.0.1',port:8080,domains:[],tls:{enabled:false,preset:'chrome',version:'auto'}}]});
export function validateProfile(p) {
  if (!p || typeof p.id!=='string' || ['direct','system','release'].includes(p.id) || !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id)) throw Error('情景 ID 无效');
  if (typeof p.name!=='string'||!p.name.trim()||p.name.length>80) throw Error('请输入情景名称（最多 80 字）');
  if (!['http','https','socks5'].includes(p.scheme)) throw Error('不支持的代理类型');
  if (typeof p.host!=='string'||!/^([a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[0-9a-fA-F:]+\])$/.test(p.host)) throw Error('代理地址只填写主机名或 IP，不包含协议、路径和凭据');
  if (!Number.isInteger(p.port)||p.port<1||p.port>65535) throw Error('端口必须在 1–65535 之间');
  if (!Array.isArray(p.domains)||p.domains.length>500||p.domains.some(d=>typeof d!=='string'||d.length>253||! /^(\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(d)||d.includes('..'))) throw Error('域名规则使用 example.com 或 *.example.com，每行一项');
  if(p.tls?.enabled!==undefined&&typeof p.tls.enabled!=='boolean')throw Error('TLS 开关必须是布尔值');
  if (!p.tls||!['browser','chrome','firefox','custom'].includes(p.tls.preset)) throw Error('TLS 预设无效');
  if (tlsEnabled(p)&&!['auto','latest'].includes(p.tls.version)&&!/^\d{2,3}$/.test(p.tls.version)) throw Error('TLS 浏览器版本填写 auto、latest 或版本号');
  if(tlsEnabled(p)&&p.tls.preset==='custom'&&(!/^(?:[0-9a-fA-F]{2})+$/.test(p.tls.helloHex??'')||(p.tls.helloHex.length>131072)))throw Error('请输入有效的 ClientHello Hex（最多 64 KiB）');
  return p;
}
// v2 stores reusable resources; profiles is a resolved compatibility view.
export function validateConfig(input) {
 const c=structuredClone(input);
 if(c?.version===1){
  if(!Array.isArray(c.profiles))throw Error('配置格式无效');
  c.profiles.forEach(validateProfile);
  c.proxies=c.profiles.map(({id,name,scheme,host,port})=>({id,name,scheme,host,port}));
  c.tlsProfiles=c.profiles.map(p=>({id:p.id,name:p.name.slice(0,76)+' TLS',...p.tls}));
  c.modes=c.profiles.map(p=>({id:p.id,name:p.name,proxyId:p.id,tlsId:tlsEnabled(p)?p.id:null,domains:p.domains}));c.version=2;
 }
 if(c?.version!==2)throw Error('配置格式无效');
 for(const key of ['proxies','tlsProfiles','modes']){
  if(!Array.isArray(c[key]))throw Error('配置列表无效');
  const ids=new Set();for(const v of c[key]){if(!v||typeof v.id!=='string'||! /^[a-zA-Z0-9_-]{1,80}$/.test(v.id)||['direct','system','release'].includes(v.id)||ids.has(v.id))throw Error('配置 ID 无效或重复');ids.add(v.id);if(typeof v.name!=='string'||!v.name.trim()||v.name.length>80)throw Error('请输入名称（最多 80 字）');}
 }
 const off={enabled:false,preset:'browser',version:'auto'};
 for(const p of c.proxies)validateProfile({...p,domains:[],tls:off});
 for(const t of c.tlsProfiles)validateProfile({id:t.id,name:t.name,scheme:'http',host:'localhost',port:8080,domains:[],tls:{...t,enabled:t.enabled!==false}});
 c.profiles=c.modes.map(m=>{
  const p=c.proxies.find(p=>p.id===m.proxyId);if(!p)throw Error('模式引用的代理配置不存在');
  const t=m.tlsId==null?null:c.tlsProfiles.find(t=>t.id===m.tlsId);if(m.tlsId!=null&&!t)throw Error('模式引用的 TLS 配置不存在');
  return validateProfile({...p,id:m.id,name:m.name,domains:m.domains,tls:t?{...t,enabled:true}:off});
 });return c;
}
export function proxyValue(profile) {
  const p=validateProfile(profile);
  if(tlsEnabled(p))throw Error('TLS 转发内核尚未接入：此配置可以保存，但暂不能启用。');
  if(!p.domains.length)return {mode:'fixed_servers',rules:{singleProxy:{scheme:p.scheme,host:p.host,port:p.port},bypassList:['<local>','127.0.0.1','[::1]']}};
  const target=({http:'PROXY',https:'HTTPS',socks5:'SOCKS5'})[p.scheme]+' '+p.host+':'+p.port;
  const data=`function FindProxyForURL(url,host){host=host.toLowerCase();if(host==='localhost'||host==='127.0.0.1'||host==='::1'||host==='[::1]'||host.indexOf('.')<0)return 'DIRECT';var rules=${JSON.stringify(p.domains)};for(var i=0;i<rules.length;i++){var r=rules[i];if(r.slice(0,2)==='*.'){var suffix=r.slice(1);if(host.length>suffix.length&&host.slice(-suffix.length)===suffix)return ${JSON.stringify(target)};}else if(host===r)return ${JSON.stringify(target)};}return 'DIRECT';}`;
  return {mode:'pac_script',pacScript:{data,mandatory:true}};
}
export function sameProxy(a,b){return JSON.stringify(a)===JSON.stringify(b)}

