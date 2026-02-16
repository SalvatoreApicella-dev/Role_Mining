import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img } from "remotion";
import { AppleTitle } from "../components/AppleTitle";
import { AppleSubtitle } from "../components/AppleSubtitle";

import miningImg from "../../public/screenshot_cluster.png";

export const MiningScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Continuous slow zoom with oscillation
    const zoomScale = 1 + 0.03 * Math.sin((frame / fps) * Math.PI * 0.5);

    // Smooth vertical reveal (top to bottom)
    const revealProgress = interpolate(frame, [0.5 * fps, 3 * fps], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    // Animated stats counter
    const statsProgress = interpolate(frame, [3.5 * fps, 5.5 * fps], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    const displayNumber = Math.round(98 * statsProgress);

    // Floating animation for stats
    const statsFloatY = Math.sin((frame / fps) * Math.PI * 0.7) * 4;

    return (
        <AbsoluteFill
            style={{
                backgroundColor: "#000000",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <div style={{ position: "absolute", top: 60 }}>
                <AppleTitle size="large" delay={0}>
                    Cluster Intelligence
                </AppleTitle>
            </div>

            {/* Heatmap with animated reveal and zoom */}
            <div
                style={{
                    position: "relative",
                    transform: `scale(${zoomScale})`,
                    marginTop: 80,
                }}
            >
                <div
                    style={{
                        clipPath: `inset(${(1 - revealProgress) * 100}% 0 0 0)`,
                    }}
                >
                    <Img
                        src={miningImg}
                        style={{
                            width: 1200,
                            height: 600,
                            objectFit: "contain",
                            opacity: 0.9,
                        }}
                    />
                </div>
            </div>

            {/* Animated stats with floating */}
            <div
                style={{
                    position: "absolute",
                    bottom: 100,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    opacity: statsProgress,
                    transform: `translateY(${statsFloatY}px)`,
                }}
            >
                <div
                    style={{
                        fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
                        fontSize: 80,
                        fontWeight: 700,
                        color: "#FFFFFF",
                    }}
                >
                    {displayNumber}
                </div>
                <AppleSubtitle delay={4.5} color="#999999" uppercase={false}>
                    Business Roles discovered
                </AppleSubtitle>
            </div>
        </AbsoluteFill>
    );
};
