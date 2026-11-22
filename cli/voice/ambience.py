"""Render the optional film bed with NumPy, SciPy and ffmpeg. No tones or repeated samples."""
from pathlib import Path
import subprocess
import sys
import numpy as np
from scipy.signal import butter, sosfilt

root = Path(__file__).resolve().parents[2] / 'art/audio'
rate = 24000
rng = np.random.default_rng(25417)
for scene in (sys.argv[1:] or ('leaf', 'returns', 'prediction', 'labels', 'epoch', 'validation', 'cutoff')):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', root / (scene+'-voice.mp3'),
                                   '-f', 'f32le', '-ar', str(rate), '-ac', '1', '-'])
    t = np.arange(len(raw)//4) / rate

    def leaves(low, high):
        band = butter(3, [low, high], fs=rate, btype='bandpass', output='sos')
        cloud = sosfilt(band, rng.normal(size=len(t)))
        return cloud / cloud.std()

    # Slow, irregular air currents. The soft upper band adds a little leaf texture.
    knots = np.arange(-2, t[-1]+3, 1.6)
    gust = np.interp(t, knots, rng.uniform(.3, 1, size=len(knots)))
    air = leaves(120, 720) * (.003 + .003 * gust)
    fade = np.minimum(np.clip(t/.85,0,1), np.clip((t[-1]-t)/.95,0,1))
    channels = [fade * (air + leaves(470, 1850)*gust**2*.0018) for _ in range(2)]
    pcm = np.column_stack(channels).astype('<f4').tobytes()
    subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(rate),'-ac','2',
                    '-i','pipe:0','-b:a','80k',root/(scene+'-ambience.mp3')],input=pcm,check=True)
