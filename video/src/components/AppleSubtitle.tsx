import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

interface AppleSubtitleProps {
    children: string;
    delay?: number;
    color?: string;
    uppercase?: boolean;
}

export const AppleSubtitle: React.FC<AppleSubtitleProps> = ({
    children,
    delay = 0,
    color = "#999999",
    uppercase = true,
}) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const startFrame = delay * fps;
    const animationDuration = 1.2 * fps;

    const opacity = interpolate(
        frame,
        [startFrame, startFrame + animationDuration],
        [0, 1],
        {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
        }
    );

    const translateY = interpolate(
        frame,
        [startFrame, startFrame + animationDuration],
        [10, 0],
        {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
        }
    );

    return (
        <div
            style={{
                fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
                fontSize: 24,
                fontWeight: 400,
                color,
                opacity,
                transform: `translateY(${translateY}px)`,
                letterSpacing: uppercase ? "0.1em" : "0",
                textTransform: uppercase ? "uppercase" : "none",
                textAlign: "center",
            }}
        >
            {children}
        </div>
    );
};
