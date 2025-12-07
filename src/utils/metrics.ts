import type { PoseLandmark, PoseFrame, SwingMetrics } from '../types/swing';

// MediaPipe Pose Landmark indices
const LANDMARKS = {
    NOSE: 0,
    LEFT_EYE: 2,
    RIGHT_EYE: 5,
    LEFT_EAR: 7,
    RIGHT_EAR: 8,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
    LEFT_KNEE: 25,
    RIGHT_KNEE: 26,
};

/**
 * Calculate angle between three points (in degrees)
 */
export function calculateAngle(
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number }
): number {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * (180 / Math.PI));
    if (angle > 180) angle = 360 - angle;
    return angle;
}

/**
 * Calculate spine angle from vertical (0 = perfectly upright)
 */
export function calculateSpineAngle(landmarks: PoseLandmark[]): number {
    if (landmarks.length < 25) return 0;

    // Midpoint between shoulders
    const shoulderMid = {
        x: (landmarks[LANDMARKS.LEFT_SHOULDER].x + landmarks[LANDMARKS.RIGHT_SHOULDER].x) / 2,
        y: (landmarks[LANDMARKS.LEFT_SHOULDER].y + landmarks[LANDMARKS.RIGHT_SHOULDER].y) / 2,
    };

    // Midpoint between hips
    const hipMid = {
        x: (landmarks[LANDMARKS.LEFT_HIP].x + landmarks[LANDMARKS.RIGHT_HIP].x) / 2,
        y: (landmarks[LANDMARKS.LEFT_HIP].y + landmarks[LANDMARKS.RIGHT_HIP].y) / 2,
    };

    // Calculate angle from vertical
    // In screen coordinates, y increases downward
    const dx = shoulderMid.x - hipMid.x;
    const dy = hipMid.y - shoulderMid.y; // Flip for screen coords

    // Angle from vertical (0 = upright, positive = leaning forward)
    const angleFromVertical = Math.atan2(dx, dy) * (180 / Math.PI);

    return angleFromVertical;
}

/**
 * Calculate head position relative to initial position
 */
export function calculateHeadPosition(landmarks: PoseLandmark[]): { x: number; y: number } {
    if (landmarks.length < 1) return { x: 0, y: 0 };

    // Use nose as head reference
    return {
        x: landmarks[LANDMARKS.NOSE].x,
        y: landmarks[LANDMARKS.NOSE].y,
    };
}

/**
 * Calculate head movement from initial frame to current frame
 * Returns displacement in normalized coordinates (multiply by frame size for pixels)
 */
export function calculateHeadMovement(
    initialLandmarks: PoseLandmark[],
    currentLandmarks: PoseLandmark[]
): { lateral: number; vertical: number } {
    const initial = calculateHeadPosition(initialLandmarks);
    const current = calculateHeadPosition(currentLandmarks);

    return {
        lateral: Math.abs(current.x - initial.x),
        vertical: Math.abs(current.y - initial.y),
    };
}

/**
 * Analyze swing metrics from pose frames
 */
export function analyzeSwing(frames: PoseFrame[]): SwingMetrics | null {
    if (!frames || frames.length < 2) {
        console.log('[DEBUG] Not enough frames for analysis:', frames?.length);
        return null;
    }

    // Get first frame (address position)
    const addressFrame = frames[0];

    // Find frame with maximum arm extension (approximate impact)
    let maxArmDistance = 0;
    let impactFrameIndex = 0;

    for (let i = 0; i < frames.length; i++) {
        const landmarks = frames[i].landmarks;
        if (landmarks.length < 25) continue;

        // Distance from shoulder to wrist (approximation)
        const leftWrist = landmarks[15]; // LEFT_WRIST
        const leftShoulder = landmarks[LANDMARKS.LEFT_SHOULDER];

        if (leftWrist && leftShoulder) {
            const distance = Math.sqrt(
                Math.pow(leftWrist.x - leftShoulder.x, 2) +
                Math.pow(leftWrist.y - leftShoulder.y, 2)
            );

            if (distance > maxArmDistance) {
                maxArmDistance = distance;
                impactFrameIndex = i;
            }
        }
    }

    const impactFrame = frames[impactFrameIndex];

    // Calculate spine angles
    const addressSpineAngle = calculateSpineAngle(addressFrame.landmarks);
    const impactSpineAngle = calculateSpineAngle(impactFrame.landmarks);

    // Calculate head movement throughout swing
    let maxLateralMovement = 0;
    let maxVerticalMovement = 0;

    for (const frame of frames) {
        const movement = calculateHeadMovement(addressFrame.landmarks, frame.landmarks);
        maxLateralMovement = Math.max(maxLateralMovement, movement.lateral);
        maxVerticalMovement = Math.max(maxVerticalMovement, movement.vertical);
    }

    // Convert normalized coords to approximate cm (assuming 640px width ≈ 100cm body width)
    const pixelToCm = 100 / 0.5; // Very rough approximation

    const metrics: SwingMetrics = {
        spineAngle: {
            address: Math.round(addressSpineAngle * 10) / 10,
            impact: Math.round(impactSpineAngle * 10) / 10,
            change: Math.round((impactSpineAngle - addressSpineAngle) * 10) / 10,
        },
        headMovement: {
            lateral: Math.round(maxLateralMovement * pixelToCm * 10) / 10,
            vertical: Math.round(maxVerticalMovement * pixelToCm * 10) / 10,
        },
    };

    console.log('[DEBUG] Swing analysis complete:', metrics);
    return metrics;
}
