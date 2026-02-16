import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { AppleTitle } from "../components/AppleTitle";
import { AppleSubtitle } from "../components/AppleSubtitle";

export const IntroScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // BIP logo fade in (0-1.5s)
    const logoOpacity = interpolate(frame, [0, 1.5 * fps], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    const logoScale = interpolate(frame, [0, 1.5 * fps], [0.95, 1.0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    // Logo glow intensity
    const logoGlow = interpolate(frame, [0.8 * fps, 1.5 * fps], [0, 0.6], {
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
                gap: 20,
            }}
        >
            {/* BIP Logo */}
            <div
                style={{
                    fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
                    fontSize: 120,
                    fontWeight: 700,
                    color: "#e74c3c",
                    opacity: logoOpacity,
                    transform: `scale(${logoScale})`,
                    textShadow: `0 0 ${logoGlow * 80}px rgba(231,76,60,${logoGlow})`,
                    letterSpacing: "-0.03em",
                }}
            >
                BIP.
            </div>

            {/* Role Modeling subtitle */}
            <AppleSubtitle delay={1.8} color="#999999">
                Role Modeling
            </AppleSubtitle>

            {/* Main title */}
            <div style={{ marginTop: 40 }}>
                <AppleTitle size="medium" delay={2.5}>
                    Role Mining
                </AppleTitle>
            </div>

            {/* Tagline */}
            <AppleSubtitle delay={3.5} color="#666666" uppercase={false}>
                Identity Governance. Automated.
            </AppleSubtitle>
        </AbsoluteFill>
    );
};
