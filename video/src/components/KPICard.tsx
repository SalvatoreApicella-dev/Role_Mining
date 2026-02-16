import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { GlassPanel } from "./GlassPanel";
import { AnimatedCounter } from "./AnimatedCounter";

type KPICardProps = {
    label: string;
    value: number;
    suffix?: string;
    prefix?: string;
    index: number;
    accentColor?: string;
};

export const KPICard: React.FC<KPICardProps> = ({
    label,
    value,
    suffix = "",
    prefix = "",
    index,
    accentColor = "#6aa6ff",
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const entrance = spring({
        frame,
        fps,
        delay: index * 8,
        config: { damping: 200 },
    });

    const translateY = (1 - entrance) * 40;

    return (
        <div
            style={{
                opacity: entrance,
                transform: `translateY(${translateY}px)`,
            }}
        >
            <GlassPanel
                style={{
                    width: 280,
                    textAlign: "center",
                    padding: "28px 20px",
                    borderColor: `${accentColor}33`,
                }}
            >
                <div
                    style={{
                        fontSize: 13,
                        color: "#9fb0d0",
                        marginBottom: 10,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        fontWeight: 600,
                    }}
                >
                    {label}
                </div>
                <AnimatedCounter
                    value={value}
                    suffix={suffix}
                    prefix={prefix}
                    fontSize={42}
                />
                <div
                    style={{
                        width: 40,
                        height: 3,
                        background: accentColor,
                        borderRadius: 2,
                        margin: "12px auto 0",
                        opacity: 0.7,
                    }}
                />
            </GlassPanel>
        </div>
    );
};
