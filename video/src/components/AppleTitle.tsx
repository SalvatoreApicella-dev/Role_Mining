import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

interface AppleTitleProps {
    children: string;
    size?: "large" | "medium" | "small";
    delay?: number;
    color?: string;
}

export const AppleTitle: React.FC<AppleTitleProps> = ({
    children,
    size = "large",
    delay = 0,
    color = "#FFFFFF",
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const startFrame = delay * fps;
    const animationDuration = 1.5 * fps;

    // Fade in + slight scale
    const opacity = interpolate(
        frame,
        [startFrame, startFrame + animationDuration],
        [0, 1],
        {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
        }
    );

    const scale = interpolate(
        frame,
        [startFrame, startFrame + animationDuration],
        [0.98, 1.0],
        {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
        }
    );

    const fontSize = {
        large: 90,
        medium: 60,
        small: 28,
    }[size];

    const fontWeight = {
        large: 600,
        medium: 600,
        small: 400,
    }[size];

    return (
        <div
            style={{
                fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
                fontSize,
                fontWeight,
                color,
                opacity,
                transform: `scale(${scale})`,
                letterSpacing: size === "large" ? "-0.02em" : "-0.01em",
                lineHeight: 1.1,
                textAlign: "center",
            }}
        >
            {children}
        </div>
    );
};
