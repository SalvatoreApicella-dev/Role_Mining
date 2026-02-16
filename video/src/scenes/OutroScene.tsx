import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { AppleTitle } from "../components/AppleTitle";
import { AppleSubtitle } from "../components/AppleSubtitle";

export const OutroScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Logo fade in
    const logoOpacity = interpolate(frame, [0, 1.5 * fps], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    const logoScale = interpolate(frame, [0, 1.5 * fps], [0.95, 1.0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    const logoGlow = interpolate(frame, [0.8 * fps, 1.5 * fps], [0, 0.5], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    // Fade to black at end
    const fadeToBlack = interpolate(frame, [4 * fps, 5 * fps], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    return (
        <AbsoluteFill
            style={{
                backgroundColor: "#000000",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 30,
            }}
        >
            {/* BIP Logo */}
            <div
                style={{
                    fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
                    fontSize: 120,
                    fontWeight: 700,
                    color: "#e74c3c",
                    opacity: logoOpacity * (1 - fadeToBlack),
                    transform: `scale(${logoScale})`,
                    textShadow: `0 0 ${logoGlow * 80}px rgba(231,76,60,${logoGlow})`,
                    letterSpacing: "-0.03em",
                }}
            >
                BIP.
            </div>

            {/* Role Mining */}
            <div style={{ opacity: 1 - fadeToBlack }}>
                <AppleTitle size="medium" delay={1.5}>
                    Role Mining
                </AppleTitle>
            </div>

            {/* Tagline */}
            <div style={{ opacity: 1 - fadeToBlack }}>
                <AppleSubtitle delay={2.5} color="#666666" uppercase={false}>
                    Identity Governance. Automated.
                </AppleSubtitle>
            </div>

            {/* Final fade to black overlay */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "#000000",
                    opacity: fadeToBlack,
                    pointerEvents: "none",
                }}
            />
        </AbsoluteFill>
    );
};
