import React from "react";
import {
    AbsoluteFill,
    interpolate,
    useCurrentFrame,
    useVideoConfig,
} from "remotion";

export const Background: React.FC = () => {
    const frame = useCurrentFrame();
    const { durationInFrames } = useVideoConfig();

    const shimmer = interpolate(frame, [0, durationInFrames], [0, 360]);

    return (
        <AbsoluteFill
            style={{
                background: "linear-gradient(180deg, #0b1220 0%, #070b14 100%)",
            }}
        >
            {/* Subtle grid */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage:
                        "linear-gradient(rgba(106,166,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(106,166,255,0.03) 1px, transparent 1px)",
                    backgroundSize: "60px 60px",
                }}
            />
            {/* Glow orb */}
            <div
                style={{
                    position: "absolute",
                    width: 600,
                    height: 600,
                    borderRadius: "50%",
                    background:
                        "radial-gradient(circle, rgba(106,166,255,0.08) 0%, transparent 70%)",
                    top: "30%",
                    left: "50%",
                    transform: `translate(-50%, -50%) rotate(${shimmer}deg)`,
                }}
            />
        </AbsoluteFill>
    );
};
