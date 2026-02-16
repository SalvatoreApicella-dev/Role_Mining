/**
 * Generate professional tech audio for the promo video:
 * 1. tech_bg.wav — ambient tech background music (~27s)
 * 2. click.wav — short UI click sound effect
 * 3. whoosh.wav — transition whoosh sound
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "public", "audio");
mkdirSync(OUTPUT_DIR, { recursive: true });

const SAMPLE_RATE = 44100;

// ── WAV Writer ──
function writeWav(filename, samples, channels = 1) {
    const numSamples = samples.length;
    const bytesPerSample = 2;
    const dataSize = numSamples * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF header
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);

    // fmt chunk
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16); // chunk size
    buffer.writeUInt16LE(1, 20);  // PCM
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(SAMPLE_RATE, 24);
    buffer.writeUInt32LE(SAMPLE_RATE * channels * bytesPerSample, 28);
    buffer.writeUInt16LE(channels * bytesPerSample, 32);
    buffer.writeUInt16LE(16, 34); // bits per sample

    // data chunk
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);

    for (let i = 0; i < numSamples; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
        buffer.writeInt16LE(Math.round(val), 44 + i * 2);
    }

    const path = join(OUTPUT_DIR, filename);
    writeFileSync(path, buffer);
    console.log(`  ✓ ${filename} (${(buffer.length / 1024).toFixed(1)} KB, ${(numSamples / SAMPLE_RATE).toFixed(2)}s)`);
}

// ── Utils ──
function sine(freq, t) {
    return Math.sin(2 * Math.PI * freq * t);
}

function noise() {
    return Math.random() * 2 - 1;
}

function lowpass(samples, cutoff) {
    const rc = 1.0 / (2 * Math.PI * cutoff);
    const dt = 1.0 / SAMPLE_RATE;
    const alpha = dt / (rc + dt);
    const out = new Float64Array(samples.length);
    out[0] = samples[0];
    for (let i = 1; i < samples.length; i++) {
        out[i] = out[i - 1] + alpha * (samples[i] - out[i - 1]);
    }
    return out;
}

function envelope(t, attack, hold, decay, total) {
    if (t < attack) return t / attack;
    if (t < attack + hold) return 1;
    if (t < attack + hold + decay) return 1 - (t - attack - hold) / decay;
    return 0;
}

// ── 1. Tech Background Music (~27s) ──
function generateTechBg() {
    const duration = 27.0;
    const numSamples = Math.floor(duration * SAMPLE_RATE);
    const samples = new Float64Array(numSamples);

    // Layer 1: Deep bass pad (slow modulation)
    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        // Fades
        const fadeIn = Math.min(1, t / 2.0);
        const fadeOut = Math.min(1, (duration - t) / 2.5);
        const vol = fadeIn * fadeOut;

        // Deep pad: two detuned sines
        const pad = (
            sine(55, t) * 0.12 +
            sine(55.3, t) * 0.10 +
            sine(82.5, t) * 0.06 +
            sine(110, t) * 0.04
        ) * vol;

        // Subtle LFO modulation on pad
        const lfo = 0.7 + 0.3 * sine(0.15, t);
        samples[i] += pad * lfo;
    }

    // Layer 2: Filtered noise texture (hi-hat rhythm)
    const noiseRaw = new Float64Array(numSamples);
    for (let i = 0; i < numSamples; i++) noiseRaw[i] = noise();
    const filtered = lowpass(noiseRaw, 3000);

    const BPM = 100;
    const beatLen = (60 / BPM) * SAMPLE_RATE;

    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        const fadeIn = Math.min(1, t / 3);
        const fadeOut = Math.min(1, (duration - t) / 3);

        // 16th note hi-hat pattern
        const beatPos = (i % Math.floor(beatLen / 4)) / (beatLen / 4);
        const hatEnv = Math.exp(-beatPos * 15);

        samples[i] += filtered[i] * hatEnv * 0.04 * fadeIn * fadeOut;
    }

    // Layer 3: Soft kick pulse every beat
    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        const fadeIn = Math.min(1, t / 4);
        const fadeOut = Math.min(1, (duration - t) / 3);

        const beatPos = (i % Math.floor(beatLen)) / beatLen;
        const kickFreq = 60 * Math.exp(-beatPos * 8);
        const kickEnv = Math.exp(-beatPos * 6);
        const kick = sine(kickFreq, beatPos) * kickEnv * 0.08;

        samples[i] += kick * fadeIn * fadeOut;
    }

    // Layer 4: Ethereal arpeggiated tones (pentatonic scale)
    const notes = [220, 261.6, 293.7, 349.2, 392, 440, 523.3];
    const arpInterval = beatLen * 2; // one note every 2 beats
    for (let n = 0; n < Math.floor(numSamples / arpInterval); n++) {
        const noteFreq = notes[n % notes.length];
        const startSample = Math.floor(n * arpInterval);
        const noteLen = Math.floor(arpInterval * 0.7);

        for (let j = 0; j < noteLen && startSample + j < numSamples; j++) {
            const t = j / SAMPLE_RATE;
            const globalT = (startSample + j) / SAMPLE_RATE;
            const fadeIn = Math.min(1, globalT / 3);
            const fadeOut = Math.min(1, (duration - globalT) / 3);

            const noteEnv = envelope(t, 0.05, 0.1, noteLen / SAMPLE_RATE - 0.15, noteLen / SAMPLE_RATE);
            const tone = sine(noteFreq, t) * 0.025 + sine(noteFreq * 2, t) * 0.01;

            samples[startSample + j] += tone * noteEnv * fadeIn * fadeOut;
        }
    }

    // Layer 5: Subtle risers at scene transitions (~4s, ~7.5s, ~10.5s, ~15.5s, ~22.5s)
    const riserTimes = [3.8, 7.2, 10.2, 15.2, 22.2];
    for (const riserStart of riserTimes) {
        const riserDuration = 0.8;
        const startI = Math.floor(riserStart * SAMPLE_RATE);
        const endI = Math.floor((riserStart + riserDuration) * SAMPLE_RATE);

        for (let i = startI; i < endI && i < numSamples; i++) {
            const t = (i - startI) / SAMPLE_RATE;
            const progress = t / riserDuration;
            const freq = 300 + 2000 * progress * progress;
            const riserEnv = Math.sin(progress * Math.PI);

            const riserNoise = noise();
            samples[i] += riserNoise * riserEnv * 0.02;
            samples[i] += sine(freq, t) * riserEnv * 0.015;
        }
    }

    // Normalize
    let max = 0;
    for (let i = 0; i < numSamples; i++) max = Math.max(max, Math.abs(samples[i]));
    if (max > 0) {
        const gain = 0.7 / max;
        for (let i = 0; i < numSamples; i++) samples[i] *= gain;
    }

    // Final soft limiter
    const finalSamples = new Float64Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        finalSamples[i] = Math.tanh(samples[i] * 1.2);
    }

    writeWav("tech_bg.wav", finalSamples);
}

// ── 2. Click Sound (short, digital) ──
function generateClick() {
    const duration = 0.08;
    const numSamples = Math.floor(duration * SAMPLE_RATE);
    const samples = new Float64Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        const env = Math.exp(-t * 80);
        const click = (
            sine(1200, t) * 0.5 +
            sine(2400, t) * 0.3 +
            sine(800, t) * 0.2
        ) * env;
        samples[i] = click * 0.8;
    }

    writeWav("click.wav", samples);
}

// ── 3. Whoosh Sound (transition) ──
function generateWhoosh() {
    const duration = 0.4;
    const numSamples = Math.floor(duration * SAMPLE_RATE);

    const raw = new Float64Array(numSamples);
    for (let i = 0; i < numSamples; i++) raw[i] = noise();

    const samples = new Float64Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        const progress = t / duration;

        // Sweeping bandpass via two lowpasses
        const cutoff = 200 + 4000 * Math.sin(progress * Math.PI);
        const rc = 1.0 / (2 * Math.PI * cutoff);
        const dt = 1.0 / SAMPLE_RATE;
        const alpha = dt / (rc + dt);

        if (i === 0) {
            samples[i] = raw[i] * alpha;
        } else {
            samples[i] = samples[i - 1] + alpha * (raw[i] - samples[i - 1]);
        }

        const env = Math.sin(progress * Math.PI);
        samples[i] *= env * 0.5;
    }

    writeWav("whoosh.wav", samples);
}

// ── Generate All ──
console.log("🎵 Generating audio assets...\n");
generateTechBg();
generateClick();
generateWhoosh();
console.log("\n✅ All audio files generated in public/audio/");
