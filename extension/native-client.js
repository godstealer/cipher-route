// A persistent port owns the native process and its listening sockets.
export function nativeClient(runtime){
 let port=null,sequence=0;const pending=new Map();
 function connect(){if(port)return port;const p=runtime.connectNative('io.cipherroute.host');port=p;
 p.onMessage.addListener(m=>{const item=pending.get(m.id);if(!item)return;pending.delete(m.id);clearTimeout(item.timer);m.ok?item.resolve(m.value):item.reject(Error(m.error||'内核返回错误'))});
 p.onDisconnect.addListener(()=>{const reason=runtime.lastError?.message||'本地内核连接已断开';port=null;for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error(reason))}pending.clear()});return p}
 return {call(type,args={}){return new Promise((resolve,reject)=>{let p;try{p=connect()}catch(e){reject(e);return}const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('本地内核响应超时'));p.disconnect()},30000);pending.set(id,{resolve,reject,timer});try{p.postMessage({...args,id,version:1,type})}catch(e){clearTimeout(timer);pending.delete(id);reject(e)}})}};
}
