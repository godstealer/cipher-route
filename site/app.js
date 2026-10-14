const $=id=>document.getElementById(id);
const platform=$('platform');
const os=navigator.userAgentData?.platform||navigator.platform||'';
if(/win/i.test(os)) platform.value='windows-x64';
else if(/mac/i.test(os)) platform.value='';
else if(/linux/i.test(os)) platform.value='linux-x64';
$('detected').textContent=/mac/i.test(os)?'检测到 macOS，请在“关于本机”确认是 Apple Silicon 还是 Intel。':'已按浏览器信息推荐系统，请确认 CPU 架构。';
let releases=[];
function link(id,state,asset){$(id).hidden=!asset;if(asset){$(id).href=asset.browser_download_url;$(state).textContent=asset.name}else{$(id).removeAttribute('href');$(state).textContent='尚无对应的已发布安装包，请查看版本列表。'}}
function render(){const assets=releases.flatMap(r=>r.assets||[]);link('basic','basic-state',assets.find(a=>/^cipher-route-(?:extension-)?[\d][\w.-]*\.zip$/.test(a.name)));link('full','full-state',assets.find(a=>a.name===`cipher-route-${platform.value}.${platform.value.startsWith('windows')?'zip':'tar.gz'}`));}
platform.addEventListener('change',render);
try{const r=await fetch('https://api.github.com/repos/godstealer/cipher-route/releases?per_page=30',{headers:{Accept:'application/vnd.github+json'}});if(!r.ok)throw Error('GitHub '+r.status);releases=(await r.json()).filter(r=>!r.draft);render();$('status').textContent='下载链接来自 GitHub 已发布版本，可能包含预览版。';}catch{render();$('status').textContent='无法获取版本列表（网络或 GitHub 请求限额），请使用下方“查看所有版本”。';}
