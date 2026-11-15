"""Build an installable ZIP from an explicit list of extension files."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT/'extension'
FILES = ['manifest.json','package.json','background.js','bridge.js','core.mjs','db.mjs','engine.mjs',
         'export.mjs','app.js','app.css','index.html','privacy.html','preview.html','reader-entry.js',
         'reader-runtime.js','reader-template.html','README.md','icons/16.png','icons/48.png','icons/128.png']
manifest=json.loads((EXT/'manifest.json').read_text())
version=manifest['version']
output=ROOT/'downloads';output.mkdir(exist_ok=True)
destination=output/f'weibo-time-archive-v{version}.zip'
with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as archive:
    for filename in sorted(FILES):
        path=EXT/filename
        if not path.is_file():raise FileNotFoundError(filename)
        info=zipfile.ZipInfo('weibo-time-archive-extension/'+filename,date_time=(2026,1,1,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED
        info.external_attr=0o100644<<16
        archive.writestr(info,path.read_bytes())
digest=hashlib.sha256(destination.read_bytes()).hexdigest()
(output/f'weibo-time-archive-v{version}.sha256').write_text(f'{digest}  {destination.name}\n')
print(f'{destination.name}: {destination.stat().st_size} bytes\nSHA256 {digest}')
