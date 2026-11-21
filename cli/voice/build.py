"""Rebuild the local English reader: python cli/voice/build.py FLITE_2_2_DIR WASI_SDK_25_DIR"""
# Sources: https://github.com/festvox/flite/releases/tag/v2.2
# Toolchain: https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-25
import re
import sys
from pathlib import Path
from subprocess import run

flite, sdk = (Path(arg).resolve() for arg in sys.argv[1:])
here = Path(__file__).resolve().parent
output = here.parents[1] / 'art/audio/reader'
directories = ['src/' + part for part in ('utils','regex','hrg','stats','lexicon','speech','synth','wavesynth','cg')]
directories += ['lang/usenglish','lang/cmulex','lang/cmu_us_slt']
sources = []
for directory in directories:
    makefile = (flite / directory / 'Makefile').read_text().replace('\\\n', ' ')
    names = re.search(r'^SRCS\s*=\s*(.+)$', makefile, re.M)[1].replace('$(VOXNAME)', 'slt')
    sources.extend(flite / directory / name for name in names.split())
sources.extend(flite / name for name in ('src/audio/au_none.c','src/audio/audio.c','src/audio/au_streaming.c',
                                         'src/utils/cst_file_stdio.c','src/utils/cst_mmap_none.c'))
exports = ['-Wl,--export=' + name for name in ('text_buffer','synthesize','samples','sample_rate')]
run([sdk/'bin/clang', '-O2','-w','-DDIE_ON_ERROR','-Djmp_buf=void','-DCST_NO_SOCKETS','-DCST_AUDIO_NONE','-ffunction-sections','-fdata-sections',
     '-I'+str(flite/'include'),'-I'+str(flite/'lang/usenglish'),'-I'+str(flite/'lang/cmulex'),
     '-mexec-model=reactor','-Wl,--strip-all','-Wl,--gc-sections','-Wl,-z,stack-size=1048576',
     *exports,here/'reader.c',*sources,'-o',output/'english.wasm'],check=True)
(output/'english.wasm').chmod(0o644)
license_lines = (flite/'COPYING').read_text().splitlines()
(output/'license.txt').write_text('\n'.join(line.rstrip() for line in license_lines).rstrip() + '\n')
