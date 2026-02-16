/**
 * Generate minimal, modern audio (non-repetitive):
 * 1. ambient_minimal.wav — subtle white noise + soft pad (~35s)
 * 2. ui_tick.wav — single soft click (minimal)
 * 3. transition_soft.wav — gentle swoosh (one variant)
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

// ── 1. Minimal Ambient (35s) — very subtle ──
function generateAmbientMinimal() {
    const duration = 35.0;
    const numSamples = Math.floor(duration * SAMPLE_RATE);
    const samples = new Float64Array(numSamples);

    // Very low volume white noise (texture)
    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        const fadeIn = Math.min(1, t / 3.0);
        const fadeOut = Math.min(1, (duration - t) / 3.0);
        const vol = fadeIn * fadeOut;

        // Soft filtered noise
        const n = noise() * 0.015 * vol;

        // Very subtle low pad (60Hz)
        const pad = sine(60, t) * 0.008 * vol;

        samples[i] = n + pad;
    }

    // Soft lowpass filter
    const filtered = lowpass(samples, 800);

    writeWav("ambient_minimal.wav", filtered);
}

// ── 2. UI Tick (single soft click) ──
function generateUiTick() {
    const duration = 0.05; // 50ms
    const numSamples = Math.floor(duration * SAMPLE_RATE);
    const samples = new Float64Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        const progress = t / duration;

        // Sharp attack, fast decay
        const env = Math.exp(-progress * 40);

        // High frequency click (2kHz)
        const tick = sine(2000, t) * env * 0.15;

        samples[i] = tick;
    }

    writeWav("ui_tick.wav", samples);
}

// ── 3. Soft Transition (gentle swoosh) ──
function generateTransitionSoft() {
    const duration = 0.4;
    const numSamples = Math.floor(duration * SAMPLE_RATE);

    const raw = new Float64Array(numSamples);
    for (let i = 0; i < numSamples; i++) raw[i] = noise();

    const samples = lowpass(raw, 1500);

    for (let i = 0; i < numSamples; i++) {
        const t = i / SAMPLE_RATE;
        const progress = t / duration;

        // Gentle envelope
        const env = Math.sin(progress * Math.PI) * 0.12;

        samples[i] *= env;
    }

    writeWav("transition_soft.wav", samples);
}

// ── Generate All ──
console.log("🎵 Generating minimal, modern audio...\n");
generateAmbientMinimal();
generateUiTick();
generateTransitionSoft();
console.log("\n✅ Minimal audio generated in public/audio/");
