/**
 * Apple-style easing curves and animation constants
 */

// Custom bezier curve for Apple's signature motion feel
export const appleEase = "cubic-bezier(0.4, 0.0, 0.2, 1)";

// Spring configuration for subtle bounce (low damping)
export const appleSpring = {
    damping: 20,
    stiffness: 100,
    mass: 1,
};

// Slow spring for premium feel
export const appleSlowSpring = {
    damping: 25,
    stiffness: 80,
    mass: 1.2,
};

// Animation durations (in seconds)
export const APPLE_TIMING = {
    fast: 0.3,
    medium: 0.6,
    slow: 1.2,
    verySlow: 2.0,
};
