import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img } from "remotion";
import { AppleTitle } from "../components/AppleTitle";
import { AppleSubtitle } from "../components/AppleSubtitle";

import rolesImg from "../../public/screenshot_business_roles.png";

export const RolesScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Table fade in with slide
    const tableOpacity = interpolate(frame, [0.5 * fps, 2 * fps], [0, 0.85], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    const tableSlideY = interpolate(frame, [0.5 * fps, 2 * fps], [20, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    // Continuous subtle zoom
    const tableScale = 1 + 0.02 * Math.sin((frame / fps) * Math.PI * 0.6);

    // Animated highlight glow
    const glowIntensity = interpolate(frame, [2 * fps, 3 * fps], [0, 0.5], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    // Pulsing glow
    const glowPulse = 0.5 + 0.3 * Math.sin((frame / fps) * Math.PI * 1.5);

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
            <div style={{ position: "absolute", top: 80 }}>
                <AppleTitle size="large" delay={0}>
                    Business Roles
                </AppleTitle>
            </div>

            <div style={{ position: "absolute", top: 200 }}>
                <AppleSubtitle delay={0.6} color="#999999" uppercase={false}>
                    Automatically discovered and classified
                </AppleSubtitle>
            </div>

            {/* Table with slide, zoom, and fade */}
            <div
                style={{
                    marginTop: 100,
                    opacity: tableOpacity,
                    position: "relative",
                    transform: `translateY(${tableSlideY}px) scale(${tableScale})`,
                }}
            >
                <Img
                    src={rolesImg}
                    style={{
                        width: 1400,
                        height: 600,
                        objectFit: "contain",
                    }}
                />

                {/* Pulsing highlight overlay */}
                <div
                    style={{
                        position: "absolute",
                        top: "30%",
                        left: "10%",
                        right: "10%",
                        height: 60,
                        background: `rgba(106, 166, 255, ${glowIntensity * glowPulse * 0.15})`,
                        border: `1px solid rgba(106, 166, 255, ${glowIntensity * glowPulse})`,
                        borderRadius: 8,
                        boxShadow: `0 0 ${glowPulse * 30}px rgba(106, 166, 255, ${glowIntensity * glowPulse * 0.4})`,
                        pointerEvents: "none",
                    }}
                />
            </div>
        </AbsoluteFill>
    );
};
