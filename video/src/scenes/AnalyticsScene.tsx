import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { AppleTitle } from "../components/AppleTitle";
import { AppleSubtitle } from "../components/AppleSubtitle";

export const AnalyticsScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Animated KPI cards that build up
    const kpiData = [
        { label: "Users", value: 4910, delay: 1.0 },
        { label: "Roles", value: 98, delay: 1.4 },
        { label: "Permissions", value: 1247, delay: 1.8 },
    ];

    // Animated progress bars
    const progressBars = [
        { label: "Coverage", percent: 94, delay: 2.2, color: "#6aa6ff" },
        { label: "Accuracy", percent: 87, delay: 2.5, color: "#ff6a8a" },
    ];

    return (
        <AbsoluteFill
            style={{
                backgroundColor: "#000000",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 50,
            }}
        >
            <AppleTitle size="large" delay={0}>
                Intelligence
            </AppleTitle>

            <AppleSubtitle delay={0.5} color="#999999" uppercase={false}>
                Real-time analytics dashboard
            </AppleSubtitle>

            {/* Animated KPI cards */}
            <div
                style={{
                    display: "flex",
                    gap: 40,
                    marginTop: 20,
                }}
            >
                {kpiData.map((kpi, i) => {
                    const cardOpacity = interpolate(
                        frame,
                        [kpi.delay * fps, (kpi.delay + 0.5) * fps],
                        [0, 1],
                        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                    );

                    const cardSlideY = interpolate(
                        frame,
                        [kpi.delay * fps, (kpi.delay + 0.5) * fps],
                        [20, 0],
                        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                    );

                    // Number counting animation
                    const numberProgress = interpolate(
                        frame,
                        [(kpi.delay + 0.3) * fps, (kpi.delay + 1.5) * fps],
                        [0, 1],
                        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                    );

                    const displayValue = Math.round(kpi.value * numberProgress);

                    return (
                        <div
                            key={kpi.label}
                            style={{
                                opacity: cardOpacity,
                                transform: `translateY(${cardSlideY}px)`,
                                background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 16,
                                padding: "30px 50px",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 10,
                            }}
                        >
                            <div
                                style={{
                                    fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
                                    fontSize: 60,
                                    fontWeight: 700,
                                    color: "#FFFFFF",
                                }}
                            >
                                {displayValue.toLocaleString()}
                            </div>
                            <div
                                style={{
                                    fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
                                    fontSize: 18,
                                    color: "#999999",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.1em",
                                }}
                            >
                                {kpi.label}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Animated progress bars that fill */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 25,
                    width: 600,
                    marginTop: 20,
                }}
            >
                {progressBars.map((bar) => {
                    const barOpacity = interpolate(
                        frame,
                        [bar.delay * fps, (bar.delay + 0.3) * fps],
                        [0, 1],
                        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                    );

                    // Progress bar fill animation
                    const fillProgress = interpolate(
                        frame,
                        [(bar.delay + 0.2) * fps, (bar.delay + 1.5) * fps],
                        [0, bar.percent],
                        { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                    );

                    return (
                        <div key={bar.label} style={{ opacity: barOpacity }}>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: 8,
                                    fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
                                    fontSize: 16,
                                    color: "#999999",
                                }}
                            >
                                <span>{bar.label}</span>
                                <span>{Math.round(fillProgress)}%</span>
                            </div>
                            <div
                                style={{
                                    width: "100%",
                                    height: 8,
                                    background: "rgba(255,255,255,0.1)",
                                    borderRadius: 4,
                                    overflow: "hidden",
                                }}
                            >
                                <div
                                    style={{
                                        width: `${fillProgress}%`,
                                        height: "100%",
                                        background: bar.color,
                                        borderRadius: 4,
                                        transition: "width 0.3s ease",
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </AbsoluteFill>
    );
};
