import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

import { IntroScene } from "./scenes/IntroScene";
import { AnalyticsScene } from "./scenes/AnalyticsScene";
import { ConnectorsScene } from "./scenes/ConnectorsScene";
import { UsersScene } from "./scenes/UsersScene";
import { MiningScene } from "./scenes/MiningScene";
import { RolesScene } from "./scenes/RolesScene";
import { OutroScene } from "./scenes/OutroScene";

// Minimal audio assets
import ambientMinimal from "../public/audio/ambient_minimal.wav";
import uiTick from "../public/audio/ui_tick.wav";
import transitionSoft from "../public/audio/transition_soft.wav";

const FPS = 30;

// Scene durations
const INTRO = 5 * FPS;
const ANALYTICS = 4.5 * FPS;
const CONNECTORS = 4 * FPS;
const USERS = 6 * FPS;
const MINING = 7 * FPS;
const ROLES = 4 * FPS;
const OUTRO = 5 * FPS;

const TRANSITION = 20;

// Minimal UI ticks (only at key moments, non-repetitive)
const TICK_FRAMES = [
    Math.round(0.5 * FPS),  // Intro: BIP appears
    INTRO + Math.round(1 * FPS),  // Analytics: number starts
    INTRO + ANALYTICS + Math.round(1 * FPS),  // Connectors: icon appears
    INTRO + ANALYTICS + CONNECTORS + Math.round(1.5 * FPS),  // Users: graph starts
];

// Soft transitions (only between major sections)
const TRANSITION_FRAMES = [
    INTRO - TRANSITION,
    INTRO + ANALYTICS + CONNECTORS - TRANSITION,
    INTRO + ANALYTICS + CONNECTORS + USERS + MINING - TRANSITION,
];

export const PromoVideo: React.FC = () => {
    return (
        <AbsoluteFill style={{ backgroundColor: "#000000" }}>
            {/* Minimal ambient background (very low volume) */}
            <Audio src={ambientMinimal} volume={0.15} />

            {/* Minimal UI ticks (sparse, non-repetitive) */}
            {TICK_FRAMES.map((frame, i) => (
                <Sequence key={`tick-${i}`} from={frame} durationInFrames={5}>
                    <Audio src={uiTick} volume={0.2} />
                </Sequence>
            ))}

            {/* Soft transitions (only 3 total) */}
            {TRANSITION_FRAMES.map((frame, i) => (
                <Sequence key={`transition-${i}`} from={frame} durationInFrames={15}>
                    <Audio src={transitionSoft} volume={0.15} />
                </Sequence>
            ))}

            <TransitionSeries>
                <TransitionSeries.Sequence durationInFrames={INTRO}>
                    <IntroScene />
                </TransitionSeries.Sequence>

                <TransitionSeries.Transition
                    presentation={fade()}
                    timing={linearTiming({ durationInFrames: TRANSITION })}
                />

                <TransitionSeries.Sequence durationInFrames={ANALYTICS}>
                    <AnalyticsScene />
                </TransitionSeries.Sequence>

                <TransitionSeries.Transition
                    presentation={fade()}
                    timing={linearTiming({ durationInFrames: TRANSITION })}
                />

                <TransitionSeries.Sequence durationInFrames={CONNECTORS}>
                    <ConnectorsScene />
                </TransitionSeries.Sequence>

                <TransitionSeries.Transition
                    presentation={fade()}
                    timing={linearTiming({ durationInFrames: TRANSITION })}
                />

                <TransitionSeries.Sequence durationInFrames={USERS}>
                    <UsersScene />
                </TransitionSeries.Sequence>

                <TransitionSeries.Transition
                    presentation={fade()}
                    timing={linearTiming({ durationInFrames: TRANSITION })}
                />

                <TransitionSeries.Sequence durationInFrames={MINING}>
                    <MiningScene />
                </TransitionSeries.Sequence>

                <TransitionSeries.Transition
                    presentation={fade()}
                    timing={linearTiming({ durationInFrames: TRANSITION })}
                />

                <TransitionSeries.Sequence durationInFrames={ROLES}>
                    <RolesScene />
                </TransitionSeries.Sequence>

                <TransitionSeries.Transition
                    presentation={fade()}
                    timing={linearTiming({ durationInFrames: TRANSITION })}
                />

                <TransitionSeries.Sequence durationInFrames={OUTRO}>
                    <OutroScene />
                </TransitionSeries.Sequence>
            </TransitionSeries>
        </AbsoluteFill>
    );
};
