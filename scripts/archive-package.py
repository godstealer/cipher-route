import hashlib,sys,tarfile,zipfile
from pathlib import Path
source=Path(sys.argv[1]).resolve()
assert source.name.startswith('cipher-route-') and source.is_dir()
assert not any(p.suffix=='.key' or p.name.endswith('.config.json') for p in source.rglob('*'))
output=source.parent/(source.name+('.zip' if 'windows' in source.name else '.tar.gz'))
if output.suffix=='.zip':
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
  for p in source.rglob('*'):
   if p.is_file():z.write(p,Path(source.name)/p.relative_to(source))
 with zipfile.ZipFile(output) as z:assert z.testzip() is None
else:
 with tarfile.open(output,'w:gz') as t:t.add(source,arcname=source.name)
 with tarfile.open(output) as t:
  for name in ['cipher-route-host','http-capture-httpcloak','install.sh']:assert t.getmember(source.name+'/'+name).mode & 0o111
output.with_name(output.name+'.sha256').write_text(hashlib.sha256(output.read_bytes()).hexdigest()+'  '+output.name+'\n')
print(output)
