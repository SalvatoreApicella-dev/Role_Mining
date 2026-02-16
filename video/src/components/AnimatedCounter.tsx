import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

type AnimatedCounterProps = {
    value: number;
    suffix?: string;
    prefix?: string;
    fontSize?: number;
    color?: string;
};

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
    value,
    suffix = "",
    prefix = "",
    fontSize = 48,
    color = "#e9eefc",
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const animatedValue = Math.round(
        interpolate(frame, [0, 1.5 * fps], [0, value], {
            extrapolateRight: "clamp",
        })
    );

    return (
        <span
            style={{
                fontSize,
                fontWeight: 700,
                color,
                fontVariantNumeric: "tabular-nums",
            }}
        >
            {prefix}
            {animatedValue.toLocaleString()}
            {suffix}
        </span>
    );
};
