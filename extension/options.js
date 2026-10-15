import {importOmega} from './omega-import.js';
import {$,request,busy,report} from './ui.js';
import {validateConfig} from './core.js';import {activeLabel} from './controller.js';
let config,kind='modes',selected,dirty=false;
const names={modes:'组合模式',proxies:'代理配置',tlsProfiles:'TLS 配置'};
function discard(){return !dirty||confirm('放弃当前未保存的修改？')}
function input(label,id,type='input'){const l=document.createElement('label');l.htmlFor=id;l.textContent=label;const e=document.createElement(type);e.id=id;$('editor').append(l,e);return e}
function select(label,id,items,value){const e=input(label,id,'select');for(const [v,n]of items){const o=document.createElement('option');o.value=v;o.textContent=n;e.append(o)}e.value=value??'';return e}
function note(text){const e=document.createElement('p');e.className='notice';e.textContent=text;$('editor').append(e)}
function fresh(){const id=crypto.randomUUID();return kind==='modes'?{id,name:'新模式',proxyId:config.proxies[0]?.id??'',tlsId:null,domains:[]}:kind==='proxies'?{id,name:'新代理',scheme:'http',host:'127.0.0.1',port:8080}:{id,name:'新 TLS',preset:'chrome',version:'auto',helloHex:''}}
function list(){ $('profiles').replaceChildren();for(const p of config[kind]){const b=document.createElement('button');b.type='button';b.className='profile'+(p.id===selected?' selected':'');b.textContent=p.name;b.onclick=()=>{if(discard())load(p)};$('profiles').append(b)}document.querySelectorAll('[data-kind]').forEach(b=>b.classList.toggle('selected',b.dataset.kind===kind));$('listTitle').textContent=names[kind];}
function autoEditor(p){
 const choices=[['','直连'],...config.proxies.map(p=>[p.id,p.name])];
 select('未匹配时','defaultProxyId',choices,p.defaultProxyId??'');
 note('Auto 按从上到下的顺序匹配，首条命中即生效。*.example.com 仅匹配子域名。始终使用浏览器原生 TLS，无需内核或 CA。本机地址直连；Auto 使用自己的规则，不套用代理配置中的绕过列表。');
 const rows=document.createElement('div');rows.id='autoRules';$('editor').append(rows);
 const addRow=r=>{const row=document.createElement('div');row.className='row auto-rule';
 const domain=document.createElement('input');domain.placeholder='example.com 或 *.example.com';domain.setAttribute('aria-label','规则域名');domain.value=r.domain;
 const proxy=document.createElement('select');proxy.setAttribute('aria-label','规则代理');for(const [value,label]of choices){const o=document.createElement('option');o.value=value;o.textContent=label;proxy.append(o)}proxy.value=r.proxyId??'';
 row.append(domain,proxy);for(const [label,action]of [['上移',()=>{if(row.previousElementSibling)rows.insertBefore(row,row.previousElementSibling)}],['下移',()=>{if(row.nextElementSibling)rows.insertBefore(row.nextElementSibling,row)}],['移除规则',()=>row.remove()]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{action();dirty=true};row.append(b)}rows.append(row);};
 (p.rules??[]).forEach(addRow);
 const add=document.createElement('button');add.type='button';add.textContent='＋ 添加规则';add.onclick=()=>{addRow({domain:'',proxyId:null});dirty=true};$('editor').append(add);
}
function load(p){$('error').textContent='';selected=p.id;dirty=false;$('name').value=p.name;$('editorTitle').textContent=names[kind];$('editor').replaceChildren();$('apply').hidden=kind!=='modes';
 if(kind==='proxies'){select('代理类型','scheme',[['http','HTTP'],['https','HTTPS'],['socks5','SOCKS5']],p.scheme);input('代理地址','host').value=p.host;const port=input('端口','port');port.type='number';port.min=1;port.max=65535;port.value=p.port;note('这里只设置代理服务器。TLS 和域名规则由组合模式选择。')}
 else if(kind==='tlsProfiles'){
 const preset=select('客户端握手预设','preset',[['chrome','Chrome'],['firefox','Firefox'],['custom','自定义 ClientHello'],['browser','浏览器原生 · 不修改握手']],p.preset);
 const policy=select('浏览器版本策略','versionPolicy',[['auto','跟随请求 User-Agent'],['latest','使用内核最新支持版本'],['fixed','指定版本']],['auto','latest'].includes(p.version)?p.version:'fixed');
 const version=input('指定浏览器主版本','version');version.value=['auto','latest'].includes(p.version)?'':p.version;version.placeholder='例如 150（不修改 User-Agent）';
 const protocol=select('上游 HTTP 协议','protocol',[['auto','Auto · 协商 h2 / HTTP/1.1'],['h1','HTTP/1.1'],['h2','HTTP/2 · 不支持时报错']],p.protocol??'auto');
 const tlsVersion=select('TLS 协议版本','tlsVersion',[['auto','Auto · TLS 1.3 / 1.2'],['1.2','TLS 1.2'],['1.3','TLS 1.3']],p.tlsVersion??'auto');
 const hex=input('ClientHello Hex 模板','helloHex','textarea');hex.value=p.helloHex??'';hex.rows=5;hex.spellcheck=false;
 const sync=()=>{const native=preset.value==='browser',custom=preset.value==='custom';policy.disabled=native||custom;version.disabled=native||custom||policy.value!=='fixed';hex.disabled=!custom;protocol.disabled=native;tlsVersion.disabled=native};preset.onchange=sync;policy.onchange=sync;sync();
 note('浏览器版本与 TLS 1.2 / 1.3 是不同设置。Auto 计划按请求 UA 选择预设，无 UA 时用内核最新支持版本；实际可用版本必须以内核能力为准。');
 note('自定义 Hex 是握手模板，不是直接重放原始握手。这里仅检查十六进制编码；完整结构、扩展及兼容性需由内核验证。');
 note('Chrome / Firefox 预设需要安装 CipherRoute Native Host 和 httpcloak，并信任专用 CA。当前内核仅支持 HTTP/TLS Auto，不支持 Hex、WebSocket；浏览器原生模式无需内核或 CA。');
 const check=document.createElement('button');check.type='button';check.textContent='检测本地内核';const status=document.createElement('p');status.setAttribute('role','status');check.onclick=()=>busy(async()=>{try{const v=await request({type:'kernel'});status.textContent='引擎：'+v.engine+'；可用版本：'+JSON.stringify(v.browserVersions)+'；CA 文件：'+v.caPath}catch(e){status.textContent='本地内核不可用：'+e.message}});const cert=document.createElement('button');cert.type='button';cert.textContent='查看 CA 信息';cert.onclick=()=>busy(async()=>{const c=await request({type:'certificate'});status.textContent='CA：'+c.path+'；SHA256：'+c.trust.certificate.sha256+'；系统信任：'+(c.trust.installed===true?'已安装':'需手动安装或浏览器确认')});const install=document.createElement('a');install.textContent='安装 TLS 内核 ↗';install.href='https://godstealer.github.io/cipher-route/';install.target='_blank';install.rel='noopener noreferrer';$('editor').append(install,check,cert,status);
 }
 else{const modeType=select('场景类型','modeType',[['fixed','固定代理组合'],['auto','Auto · 自动切换（原生 TLS）']],p.type??'fixed');modeType.onchange=()=>{const name=$('name').value;load(modeType.value==='auto'?{id:selected,name,type:'auto',tlsId:null,defaultProxyId:null,rules:[]}:{id:selected,name,proxyId:config.proxies[0]?.id??'',tlsId:null,domains:[]});dirty=true};if(p.type==='auto'){autoEditor(p);list();return;}select('代理配置','proxyId',config.proxies.map(p=>[p.id,p.name]),p.proxyId);select('TLS 配置','tlsId',[['','关闭 · 浏览器原生 TLS'],...config.tlsProfiles.map(t=>[t.id,t.name])],p.tlsId);input('匹配域名（每行一项）','domains','textarea').value=p.domains.join('\n');note('不选择 TLS 即普通代理，无需 HTTP Capture 或 CA。域名留空代理全部网站；支持 example.com 和 *.example.com，本机地址默认直连。');if(!config.proxies.length)note('请先新建一份代理配置，再保存组合模式。')}
 list();}
function read(){const p={id:selected,name:$('name').value.trim()};if(kind==='proxies')return {...p,...(config.proxies.find(v=>v.id===selected)?.bypassList?{bypassList:config.proxies.find(v=>v.id===selected).bypassList}:{}),scheme:$('scheme').value,host:$('host').value.trim(),port:Number($('port').value)};if(kind==='tlsProfiles')return {...p,preset:$('preset').value,version:$('preset').value==='custom'?'auto':$('versionPolicy').value==='fixed'?$('version').value.trim():$('versionPolicy').value,protocol:$('protocol').value,tlsVersion:$('tlsVersion').value,helloHex:$('helloHex').value.replace(/\s/g,'')};if($('modeType').value==='auto')return {...p,type:'auto',tlsId:null,defaultProxyId:$('defaultProxyId').value||null,rules:[...$('autoRules').children].map(row=>({domain:row.querySelector('input').value.trim().toLowerCase(),proxyId:row.querySelector('select').value||null}))};return {...p,proxyId:$('proxyId').value,tlsId:$('tlsId').value||null,domains:$('domains').value.split(/\r?\n/).map(v=>v.trim().toLowerCase()).filter(Boolean)}}
async function save(apply=false){const p=read();const next=validateConfig({...config,[kind]:config[kind].some(v=>v.id===p.id)?config[kind].map(v=>v.id===p.id?p:v):[...config[kind],p]});const s=await request({type:'save',config:next});config=s.config;dirty=false;list();$('status').textContent='已保存 · 当前：'+activeLabel(s);if(apply){const a=await request({type:'apply',action:p.id});$('status').textContent='当前：'+activeLabel(a)}}
$('form').oninput=()=>dirty=true;$('form').onsubmit=e=>{e.preventDefault();void busy(()=>save())};$('apply').onclick=()=>busy(()=>save(true));$('add').onclick=()=>{if(discard())load(fresh())};document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{if(!config||!discard())return;kind=b.dataset.kind;load(config[kind][0]??fresh())});
$('delete').onclick=()=>busy(async()=>{if(!config[kind].some(p=>p.id===selected))return;if(kind!=='modes'){const refs=config.modes.filter(m=>(kind==='proxies'?(m.proxyId===selected||m.type==='auto'&&(m.defaultProxyId===selected||m.rules.some(r=>r.proxyId===selected))):m.tlsId===selected));if(refs.length)throw Error('仍被模式引用：'+refs.map(m=>m.name).join('、')+'。请先修改或删除这些模式。')}if(!confirm('删除此配置？'))return;const s=await request({type:'snapshot'});if(kind==='modes'&&s.applied?.action===selected)await request({type:'apply',action:'release'});const result=await request({type:'save',config:{...config,[kind]:config[kind].filter(p=>p.id!==selected)}});config=result.config;load(config[kind][0]??fresh());$('status').textContent='已删除'});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});request({type:'snapshot'}).then(s=>{config=s.config;load(config.modes[0]??fresh());$('status').textContent='当前：'+activeLabel(s)}).catch(report);


let pendingImportText=null;
function clearImport(){pendingImportText=null;$('importActions').hidden=true;}
$('omegaFile').onchange=()=>busy(async()=>{
 clearImport();$('importStatus').textContent='';
 const file=$('omegaFile').files[0];if(!file)return;
 try{
  if(!config)throw Error('配置尚未加载，请稍后重试');
  $('importStatus').textContent='正在读取备份…';
  if(file.size>5*1024*1024)throw Error('备份超过 5 MiB');
  const text=await file.text(),result=importOmega(text,config);
  $('importStatus').textContent=(result.count?'可导入 '+result.count+' 个代理和 '+result.count+' 个组合模式。点击“确认导入”后保存，不会启用代理。':'没有可导入的代理。')+'\n'+result.warnings.join('\n')+(dirty?'\n确认导入将放弃表单中尚未保存的修改。':'');
  if(result.count){pendingImportText=text;$('importActions').hidden=false;}
 }catch(e){$('importStatus').textContent='导入未完成：'+e.message;throw e;}
 finally{$('omegaFile').value='';}
});
$('cancelImport').onclick=()=>{clearImport();$('importStatus').textContent='已取消导入，配置未改变。';};
$('confirmImport').onclick=()=>busy(async()=>{
 if(pendingImportText===null)return;
 // Merge against the current saved configuration, not a stale preview snapshot.
 const result=importOmega(pendingImportText,config);
 $('importStatus').textContent='正在保存导入的配置…';
 try{
  const saved=await request({type:'save',config:result.config});
  config=saved.config;kind='modes';load(config.modes[config.modes.length-1]);clearImport();
  $('importStatus').textContent='导入完成：'+result.count+' 个代理和 '+result.count+' 个组合模式。\n'+result.warnings.join('\n');
  $('status').textContent='已保存导入配置，未切换当前代理。';
 }catch(e){$('importStatus').textContent='保存失败：'+e.message+'；可以点击“确认导入”重试。';throw e;}
});
