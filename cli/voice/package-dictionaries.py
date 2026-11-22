"""Package the eSpeak NG data used by the neural narrators from @echogarden/espeak-ng-emscripten 0.3.5."""
import re
import sys
from pathlib import Path

source = Path(sys.argv[1])
dest = Path(__file__).resolve().parents[2] / 'art/audio/neural'
js = (source/'espeak-ng.js').read_text()
data = (source/'espeak-ng.data').read_bytes()
record = re.compile(r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}')
files = list(record.finditer(js))
if len(files) != 459:
    raise ValueError('Unexpected package layout')
dictionaries = {'ar_dict','cmn_dict','en_dict','es_dict','fr_dict','zh_dict'}
bundle = bytearray()
index = []
for entry in files:
    path, start, end = entry.groups()
    if path.endswith('_dict') and Path(path).name not in dictionaries:
        continue
    offset = len(bundle)
    bundle.extend(data[int(start):int(end)])
    index.append(f'{{filename:"{path}",start:{offset},end:{len(bundle)}}}')
js = js[:files[0].start()] + ','.join(index) + js[files[-1].end():]
js = js.replace('remote_package_size:'+str(len(data)), 'remote_package_size:'+str(len(bundle)))
(dest/'multilingual.js').write_text(js)
(dest/'espeak-ng.data').write_bytes(bundle)
