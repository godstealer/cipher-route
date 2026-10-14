import json,struct,subprocess,socket,threading,select,shutil,os
from pathlib import Path
root=Path(__file__).resolve().parents[1];bundle=root/'.local/native-test';bundle.mkdir(parents=True,exist_ok=True)
origin='chrome-extension://'+'a'*32+'/'
for src in [root.parent/'http-capture/target/debug/cipher-route-host.exe',root.parent/'http-capture/.local/httpcloak/http-capture-httpcloak.exe',root.parent/'http-capture/.local/httpcloak/http-capture-httpcloak.json']:shutil.copy2(src,bundle/src.name)
(bundle/'cipher-route-host.config.json').write_text(json.dumps({'allowedOrigins':[origin],'dataDir':str(bundle/'data')}))
listener=socket.socket();listener.bind(('127.0.0.1',0));listener.listen();upstream_port=listener.getsockname()[1]
def tunnel(c):
 try:
  head=b''
  while not head.endswith(b'\r\n\r\n'):
   b=c.recv(1)
   if not b:return
   head+=b
   if len(head)>65536:return
  method,target,_=head.split(b'\r\n')[0].decode().split(' ')
  assert method=='CONNECT'
  host,port=target.rsplit(':',1)
  assert host in ['tls.peet.ws','httpbin.org'] and port=='443'
  with socket.create_connection((host,int(port)),10) as remote:
   c.sendall(b'HTTP/1.1 200 Connection Established\r\n\r\n')
   while True:
    ready,_,_=select.select([c,remote],[],[],35)
    if not ready:return
    for s in ready:
     data=s.recv(65536)
     if not data:return
     (remote if s is c else c).sendall(data)
 except Exception:pass
 finally:c.close()
def accept():
 while True:
  try:c,_=listener.accept()
  except OSError:return
  threading.Thread(target=tunnel,args=(c,),daemon=True).start()
threading.Thread(target=accept,daemon=True).start()
p=subprocess.Popen([str(bundle/'cipher-route-host.exe'),origin],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
def call(kind,**args):
 data=json.dumps({'id':1,'version':1,'type':kind,**args}).encode();p.stdin.write(struct.pack('<I',len(data))+data);p.stdin.flush()
 size=p.stdout.read(4)
 if len(size)!=4:raise RuntimeError(p.stderr.read().decode())
 reply=json.loads(p.stdout.read(struct.unpack('<I',size)[0]));assert reply['ok'],reply
 return reply['value']
try:
 cap=call('capabilities');print('Capabilities:',json.dumps(cap['browserVersions']),flush=True)
 for family,version in [('firefox','148'),('chrome','152')]:
  session=call('prepare',profile={'scheme':'http','host':'127.0.0.1','port':upstream_port,'tls':{'preset':family,'version':version,'protocol':'auto','tlsVersion':'auto'}})
  call('commit',sessionId=session['sessionId'])
  args=['curl.exe','-sS','--fail-with-body','--connect-timeout','10','--max-time','40','--proxy','http://127.0.0.1:'+str(session['port']),'--noproxy','','--cacert',session['caPath'],'--ssl-revoke-best-effort','-H','User-Agent: CipherRoute-test','https://httpbin.org/get']
  result=subprocess.run(args,capture_output=True,text=True,timeout=45)
  if result.returncode:raise RuntimeError(result.stderr+' '+result.stdout)
  data=json.loads(result.stdout);assert data.get('headers'),data
  print(json.dumps({'family':family,'version':version,'http_version':data.get('http_version'),'ja3_hash':data.get('tls',{}).get('ja3_hash'),'ja4':data.get('tls',{}).get('ja4'),'user_agent':data.get('headers',{}).get('User-Agent'),'url':data.get('url')}),flush=True)
  assert data['headers'].get('User-Agent')=='CipherRoute-test'
 last=session['port'];call('deactivate')
 try:socket.create_connection(('127.0.0.1',last),1);raise AssertionError('Port not released')
 except (ConnectionRefusedError,TimeoutError):print('Stopped port no longer accepts connections',flush=True)
finally:
 p.stdin.close()
 try:p.wait(timeout=10)
 except subprocess.TimeoutExpired:p.kill()
 listener.close()

