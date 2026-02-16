import React from "react";
import { Composition } from "remotion";
import { PromoVideo } from "./PromoVideo";

const FPS = 30;

// Apple-style: 150+135+120+180+210+120+150 = 1065 frames - 6 transitions (6×20=120) = 945 frames
const TOTAL_DURATION = 1065;

export const RemotionRoot: React.FC = () => {
    return (
        <Composition
            id="PromoVideo"
            component={PromoVideo}
            durationInFrames={TOTAL_DURATION}
            fps={FPS}
            width={1920}
            height={1080}
        />
    );
};
