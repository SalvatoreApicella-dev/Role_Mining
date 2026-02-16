import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { AppleTitle } from "../components/AppleTitle";
import { AppleSubtitle } from "../components/AppleSubtitle";

export const ConnectorsScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Continuous smooth rotation (full 360° over scene duration)
    const rotation = (frame / fps) * 30; // 30 deg/sec

    // Pulsing scale animation
    const iconScale = 1 + 0.08 * Math.sin((frame / fps) * Math.PI * 0.8);

    // Connector names with staggered fade + slide
    const connectors = ["SAP", "Active Directory", "CSV", "and more"];

    // Floating animation for connector list
    const listFloatY = Math.sin((frame / fps) * Math.PI * 0.6) * 3;

    return (
        <AbsoluteFill
            style={{
                backgroundColor: "#000000",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 40,
            }}
        >
            <AppleTitle size="large" delay={0}>
                Universal Integration
            </AppleTitle>

            <AppleSubtitle delay={0.6} color="#999999" uppercase={false}>
                Connect to any system
            </AppleSubtitle>

            {/* Animated SAP icon */}
            <div
                style={{
                    marginTop: 60,
                    width: 200,
                    height: 200,
                    borderRadius: 40,
                    background: "linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)",
                    border: "2px solid rgba(255,255,255,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transform: `rotate(${rotation}deg) scale(${iconScale})`,
                    opacity: interpolate(frame, [0.8 * fps, 1.5 * fps], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                    }),
                    boxShadow: `0 0 ${iconScale * 40}px rgba(106, 166, 255, ${iconScale * 0.2})`,
                }}
            >
                <div
                    style={{
                        fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
                        fontSize: 48,
                        fontWeight: 700,
                        color: "#6aa6ff",
                    }}
                >
                    SAP
                </div>
            </div>

            {/* Connector list with floating animation */}
            <div
                style={{
                    display: "flex",
                    gap: 20,
                    marginTop: 40,
                    fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
                    fontSize: 20,
                    color: "#999999",
                    transform: `translateY(${listFloatY}px)`,
                }}
            >
                {connectors.map((name, i) => {
                    const delay = 2 + i * 0.2;
                    const opacity = interpolate(frame, [delay * fps, (delay + 0.4) * fps], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                    });

                    const slideX = interpolate(frame, [delay * fps, (delay + 0.4) * fps], [-10, 0], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                    });

                    return (
                        <React.Fragment key={name}>
                            <span style={{ opacity, transform: `translateX(${slideX}px)`, display: "inline-block" }}>
                                {name}
                            </span>
                            {i < connectors.length - 1 && <span style={{ opacity: 0.3 }}>•</span>}
                        </React.Fragment>
                    );
                })}
            </div>
        </AbsoluteFill>
    );
};
