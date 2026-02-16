import React from "react";

type GlassPanelProps = {
    children: React.ReactNode;
    style?: React.CSSProperties;
};

export const GlassPanel: React.FC<GlassPanelProps> = ({ children, style }) => {
    return (
        <div
            style={{
                background: "rgba(17, 26, 46, 0.55)",
                border: "1px solid rgba(255, 255, 255, 0.10)",
                borderRadius: 16,
                padding: 24,
                backdropFilter: "blur(10px)",
                ...style,
            }}
        >
            {children}
        </div>
    );
};
