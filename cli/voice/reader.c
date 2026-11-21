/* Minimal in-memory adapter for the unmodified CMU Flite 2.2 US English SLT voice. */
#include "flite.h"

extern cst_voice *register_cmu_us_slt(const char *voxdir);
static cst_voice *voice;
static cst_wave *wave;
static char input[2048];

char *text_buffer(void) { return input; }
const short *samples(void) { return wave->samples; }
int sample_rate(void) { return wave->sample_rate; }

int synthesize(void) {
    if (!voice) {
        flite_init();
        voice = register_cmu_us_slt(NULL);
    }
    if (wave) delete_wave(wave);
    wave = flite_text_to_wave(input, voice);
    return wave ? wave->num_samples : 0;
}
