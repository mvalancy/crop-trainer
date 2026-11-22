"""Record a JSON list of {text,file} cues using the same narrator as the web reader.

python cli/voice/record.py LANGUAGE JOBS MODEL VOICE
For English, VOICE is the Kokoro voices archive. For Piper, it is the ONNX configuration.
Requires kokoro-onnx or piper-tts, NumPy, ONNX Runtime and ffmpeg.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort

lang, jobs, model, voice = sys.argv[1:5]
replace = '--replace' in sys.argv[5:]
options = ort.SessionOptions()
options.intra_op_num_threads = 1
options.inter_op_num_threads = 1

def session(path):
    return ort.InferenceSession(str(path), options, providers=['CPUExecutionProvider'])

if lang == 'en':
    from kokoro_onnx import Kokoro
    narrator = Kokoro.from_session(session(model), voice)
    rate = 24000
    def speech(line):
        return narrator.create(line, voice='af_heart', speed=.96)[0]
else:
    from piper import PiperVoice
    from piper.config import PiperConfig
    narrator = PiperVoice(session(model), PiperConfig.from_dict(json.loads(Path(voice).read_text())))
    if lang == 'ar':
        # Keep the vowel-restoration model inside the same CPU budget.
        import piper.tashkeel as vowels
        vowels.InferenceSession = session
    rate = narrator.config.sample_rate
    def speech(line):
        parts = [c.audio_float_array for c in narrator.synthesize(line)]
        return np.concatenate(parts) if parts else np.zeros(1)

for i, cue in enumerate(json.loads(Path(jobs).read_text())):
    dest = Path(cue['file'])
    if dest.exists() and not replace and not cue.get('film'):
        continue
    text = cue['text'].replace('LiDAR', {'ar':'ليدار','zh':'激光雷达'}.get(lang,'lidar'))
    if lang == 'ar':
        digits = ['صفر','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة']
        text = re.sub(r'(\d+)\.(\d+)', lambda m: ('صفر' if m[1]=='0' else m[1])+' فاصلة '+' '.join(digits[int(n)] for n in m[2]), text)
        text = re.sub(r'\bF1\b', 'إف واحد', text).replace('%',' في المئة ')
        text = re.sub(r'\bcm\b','سنتيمتر',text)
    if lang == 'en':
        text = re.sub(r'\bF1\b','F one',text)
        text = re.sub(r'\b(PLY|CSV|GPU|CPU|XYZ)\b',lambda m:' '.join(m[0]),text)
    paragraphs = re.split(r'(?<=[.!?؟。！？])\s+(?!\d)', text)
    chunks = [np.zeros(round(.10*rate), np.float32)]
    for line in paragraphs:
        if line.strip():
            chunks += [speech(line), np.zeros(round(.22*rate), np.float32)]
    audio = np.concatenate(chunks)
    if not np.isfinite(audio).all() or np.max(np.abs(audio)) < .002:
        raise ValueError('No speech generated for '+str(dest))
    active = audio[np.abs(audio) > .007]
    gain = min(.86/np.max(np.abs(audio)), .115/np.sqrt(np.mean(active**2)))
    pcm = (audio * gain * 32767).astype('<i2').tobytes()
    temp = dest.with_name(dest.name+'.'+str(os.getpid())+'.part')
    subprocess.run(['ffmpeg','-y','-loglevel','error','-f','s16le','-ar',str(rate),'-ac','1','-i','pipe:0',
                    '-ar','24000','-codec:a','libmp3lame','-b:a','56k','-f','mp3',temp],input=pcm,check=True)
    temp.replace(dest)
    if i % 20 == 0: print(lang,i,dest.name,flush=True)
