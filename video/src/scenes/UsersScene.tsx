import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { AppleTitle } from "../components/AppleTitle";

const ROLES_GRAPH = [
    { label: "INF_MAIL_READ", angle: 0, distance: 0.85, active: true },
    { label: "INF_STORAGE_VIEW", angle: 25, distance: 0.78, active: false },
    { label: "INF_VPN_ALL", angle: 50, distance: 0.9, active: true },
    { label: "INF_VPN_READ", angle: 75, distance: 0.65, active: false },
    { label: "SYS_CONFLUENCE_READ", angle: 100, distance: 0.7, active: true },
    { label: "SYS_CONFLUENCE_VIEW", angle: 125, distance: 0.82, active: false },
    { label: "SYS_GITLAB_WRITE", angle: 150, distance: 0.88, active: true },
    { label: "SYS_JENKINS_WRITE", angle: 175, distance: 0.72, active: false },
    { label: "SYS_JIRA_WRITE", angle: 200, distance: 0.85, active: true },
    { label: "SYS_K8S_READ", angle: 225, distance: 0.6, active: false },
    { label: "SYS_AWS_ALL", angle: 250, distance: 0.75, active: true },
    { label: "SYS_AWS_READ", angle: 275, distance: 0.68, active: false },
    { label: "SYS_AWS_WRITE", angle: 300, distance: 0.82, active: true },
    { label: "SYS_CONFLUENCE_WRITE", angle: 325, distance: 0.7, active: false },
];

const CX = 960;
const CY = 540;
const RADIUS = 380;

export const UsersScene: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    // Continuous slow rotation of entire graph
    const graphRotation = (frame / fps) * 8; // 8 deg/sec

    // Continuous zoom (subtle)
    const zoomScale = 1 + 0.04 * Math.sin((frame / fps) * Math.PI * 0.4);

    // Graph fade in
    const graphOpacity = interpolate(frame, [0.5 * fps, 1.5 * fps], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
    });

    // Nodes appear sequentially but continue pulsing
    const nodeDelay = 1.5 * fps;

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
                    Atomic Roles Model
                </AppleTitle>
            </div>

            {/* Graph container with rotation and zoom */}
            <div
                style={{
                    transform: `scale(${zoomScale}) rotate(${graphRotation}deg)`,
                    opacity: graphOpacity,
                }}
            >
                <svg width="1920" height="1080" viewBox="0 0 1920 1080">
                    {/* Center node with pulsing */}
                    <circle
                        cx={CX}
                        cy={CY}
                        r={30 + Math.sin((frame / fps) * Math.PI) * 3}
                        fill="#FFFFFF"
                        opacity={interpolate(frame, [nodeDelay, nodeDelay + 0.3 * fps], [0, 1], {
                            extrapolateLeft: "clamp",
                            extrapolateRight: "clamp",
                        })}
                    />

                    {/* Connection lines */}
                    {ROLES_GRAPH.map((role, i) => {
                        const angle = (role.angle * Math.PI) / 180;
                        const x = CX + Math.cos(angle) * RADIUS * role.distance;
                        const y = CY + Math.sin(angle) * RADIUS * role.distance;

                        const lineOpacity = interpolate(
                            frame,
                            [nodeDelay + i * 2, nodeDelay + i * 2 + 0.3 * fps],
                            [0, 0.2],
                            {
                                extrapolateLeft: "clamp",
                                extrapolateRight: "clamp",
                            }
                        );

                        return (
                            <line
                                key={`line-${i}`}
                                x1={CX}
                                y1={CY}
                                x2={x}
                                y2={y}
                                stroke={role.active ? "#ff6a8a" : "#6aa6ff"}
                                strokeWidth={1.5}
                                opacity={lineOpacity}
                            />
                        );
                    })}

                    {/* Role nodes with continuous pulsing */}
                    {ROLES_GRAPH.map((role, i) => {
                        const angle = (role.angle * Math.PI) / 180;
                        const x = CX + Math.cos(angle) * RADIUS * role.distance;
                        const y = CY + Math.sin(angle) * RADIUS * role.distance;

                        const nodeOpacity = interpolate(
                            frame,
                            [nodeDelay + i * 2, nodeDelay + i * 2 + 0.5 * fps],
                            [0, 1],
                            {
                                extrapolateLeft: "clamp",
                                extrapolateRight: "clamp",
                            }
                        );

                        const nodeScale = interpolate(
                            frame,
                            [nodeDelay + i * 2, nodeDelay + i * 2 + 0.5 * fps],
                            [0.5, 1.0],
                            {
                                extrapolateLeft: "clamp",
                                extrapolateRight: "clamp",
                            }
                        );

                        // Continuous pulsing after appearing
                        const pulse = 1 + 0.15 * Math.sin((frame / fps + i * 0.5) * Math.PI * 1.2);

                        return (
                            <g key={`node-${i}`} opacity={nodeOpacity}>
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={14 * nodeScale * pulse}
                                    fill={role.active ? "#ff6a8a" : "#6aa6ff"}
                                />
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={6 * nodeScale * pulse}
                                    fill="white"
                                    opacity={0.6}
                                />
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Legend with fade */}
            <div
                style={{
                    position: "absolute",
                    right: 60,
                    bottom: 80,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    opacity: interpolate(frame, [3 * fps, 4 * fps], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                    }),
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: "#ff6a8a",
                        }}
                    />
                    <span
                        style={{
                            fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
                            fontSize: 16,
                            color: "#999999",
                        }}
                    >
                        Active
                    </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: "#6aa6ff",
                        }}
                    />
                    <span
                        style={{
                            fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
                            fontSize: 16,
                            color: "#999999",
                        }}
                    >
                        Inactive
                    </span>
                </div>
            </div>
        </AbsoluteFill>
    );
};
