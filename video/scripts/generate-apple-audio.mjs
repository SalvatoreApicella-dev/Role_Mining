/**
 * Generate Apple-style professional audio:
 * 1. orchestral_bg.wav — emotional orchestral ambient (~35s)
 * 2. bloom.wav — soft swell for title reveals
 * 3. whoosh_premium.wav — deeper, longer transition whoosh
 * 4. riser.wav — subtle frequency sweep
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

    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(SAMPLE_RATE, 24);
    buffer.writeUInt32LE(SAMPLE_RATE * channels * bytesPerSample, 28);
    buffer.writeUInt16LE(channels * bytesPerSample, 32);
    buffer.writeUInt16LE(16, 34);
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

// ── 1. Orchestral Background (35s) ──
function generateOrchestralBg() {
    const duration = 35.0;
    const numSamples = Math.floor(duration * SAMPLE_RATE);
    const samples = new Float64Array(numSamples);

    // C minor pentatonic: C, Eb, F, G, Bb
    const notes = [
        130.81, // C3
        155.56, // Eb3
        174.61, // F3
        196.00, // G3
        233.08, // Bb3
        261.63, // C4
        311.13, // Eb4
        349.23, // F4
    ];

    // Layer 1: Deep string pad (sustained notes)
    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        const fadeIn = Math.min(1, t / 4.0);
        const fadeOut = Math.min(1, (duration - t) / 4.0);
        const vol = fadeIn * fadeOut;

        // Two detuned strings for richness
        const pad = (
            sine(notes[0], t) * 0.08 +
            sine(notes[0] * 1.002, t) * 0.07 +
            sine(notes[2], t) * 0.05 +
            sine(notes[4], t) * 0.04
        ) * vol;

        // Slow LFO for movement
        const lfo = 0.85 + 0.15 * sine(0.08, t);
        samples[i] += pad * lfo;
    }

    // Layer 2: Piano-like arpeggios (slow, emotional)
    const BPM = 60;
    const beatLen = (60 / BPM) * SAMPLE_RATE;
    const arpInterval = beatLen * 4; // one note every 4 beats (4s)

    for (let n = 0; n < Math.floor(numSamples / arpInterval); n++) {
        const noteIdx = n % notes.length;
        const noteFreq = notes[noteIdx];
        const startSample = Math.floor(n * arpInterval);
        const noteLen = Math.floor(arpInterval * 0.9);

        for (let j = 0; j < noteLen && startSample + j < numSamples; j++) {
            const t = j / SAMPLE_RATE;
            const globalT = (startSample + j) / SAMPLE_RATE;
            const fadeIn = Math.min(1, globalT / 5);
            const fadeOut = Math.min(1, (duration - globalT) / 5);

            // Piano-like envelope: fast attack, slow decay
            const attack = Math.min(1, t / 0.02);
            const decay = Math.exp(-t * 0.8);
            const noteEnv = attack * decay;

            // Fundamental + harmonics for piano timbre
            const tone = (
                sine(noteFreq, t) * 0.6 +
                sine(noteFreq * 2, t) * 0.2 +
                sine(noteFreq * 3, t) * 0.1 +
                sine(noteFreq * 4, t) * 0.05
            ) * 0.03;

            samples[startSample + j] += tone * noteEnv * fadeIn * fadeOut;
        }
    }

    // Layer 3: Subtle high strings (ethereal)
    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        const fadeIn = Math.min(1, t / 6);
        const fadeOut = Math.min(1, (duration - t) / 6);

        const highString = (
            sine(notes[5], t) * 0.015 +
            sine(notes[6], t) * 0.012 +
            sine(notes[7], t) * 0.010
        ) * fadeIn * fadeOut;

        const vibrato = 1 + 0.02 * sine(5, t);
        samples[i] += highString * vibrato;
    }

    // Layer 4: Soft swells at key moments (8s, 18s, 28s)
    const swellTimes = [8, 18, 28];
    for (const swellStart of swellTimes) {
        const swellDuration = 3.0;
        const startI = Math.floor(swellStart * SAMPLE_RATE);
        const endI = Math.floor((swellStart + swellDuration) * SAMPLE_RATE);

        for (let i = startI; i < endI && i < numSamples; i++) {
            const t = (i - startI) / SAMPLE_RATE;
            const progress = t / swellDuration;
            const swellEnv = Math.sin(progress * Math.PI);

            const swell = (
                sine(notes[3], t) * 0.02 +
                sine(notes[5], t) * 0.015
            ) * swellEnv;

            samples[i] += swell;
        }
    }

    // Normalize
    let max = 0;
    for (let i = 0; i < numSamples; i++) max = Math.max(max, Math.abs(samples[i]));
    if (max > 0) {
        const gain = 0.65 / max;
        for (let i = 0; i < numSamples; i++) samples[i] *= gain;
    }

    // Soft limiter
    const finalSamples = new Float64Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        finalSamples[i] = Math.tanh(samples[i] * 1.1);
    }

    writeWav("orchestral_bg.wav", finalSamples);
}

// ── 2. Bloom (soft swell for title reveals) ──
function generateBloom() {
    const duration = 0.3;
    const numSamples = Math.floor(duration * SAMPLE_RATE);
    const samples = new Float64Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        const progress = t / duration;

        // Soft swell envelope
        const env = Math.sin(progress * Math.PI);

        // Warm frequencies (200-800Hz)
        const bloom = (
            sine(200, t) * 0.3 +
            sine(400, t) * 0.2 +
            sine(600, t) * 0.15 +
            sine(800, t) * 0.1
        ) * env * 0.4;

        samples[i] = bloom;
    }

    writeWav("bloom.wav", samples);
}

// ── 3. Premium Whoosh (deeper, longer) ──
function generateWhooshPremium() {
    const duration = 0.6;
    const numSamples = Math.floor(duration * SAMPLE_RATE);

    const raw = new Float64Array(numSamples);
    for (let i = 0; i < numSamples; i++) raw[i] = noise();

    const samples = lowpass(raw, 2000);

    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        const progress = t / duration;

        // Sweeping filter
        const cutoff = 150 + 3000 * Math.sin(progress * Math.PI);
        const env = Math.sin(progress * Math.PI);

        samples[i] *= env * 0.45;
    }

    writeWav("whoosh_premium.wav", samples);
}

// ── 4. Riser (subtle frequency sweep) ──
function generateRiser() {
    const duration = 0.8;
    const numSamples = Math.floor(duration * SAMPLE_RATE);
    const samples = new Float64Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        const progress = t / duration;

        // Frequency sweep from 200Hz to 2000Hz
        const freq = 200 + 1800 * progress * progress;
        const env = Math.sin(progress * Math.PI) * 0.3;

        const riser = sine(freq, t) * env;
        samples[i] = riser;
    }

    writeWav("riser.wav", samples);
}

// ── Generate All ──
console.log("🎵 Generating Apple-style audio...\n");
generateOrchestralBg();
generateBloom();
generateWhooshPremium();
generateRiser();
console.log("\n✅ Apple-style audio generated in public/audio/");
