export const $=id=>document.getElementById(id);
export async function request(message){if(!globalThis.chrome?.runtime?.id)throw Error('请在 Chrome / Edge 中加载扩展后使用');const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw Error(r?.error??'扩展后台无响应');return r.value}
export function report(e){$('error').textContent=e?.message??String(e)}
export async function busy(fn){const buttons=[...document.querySelectorAll('button,input,select,textarea')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);$('error').textContent='';try{await fn()}catch(e){report(e)}finally{buttons.forEach(([b,disabled])=>b.disabled=disabled)}}
