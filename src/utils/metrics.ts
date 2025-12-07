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
/**
 * Calculate velocity of a landmark (normalized units per frame)
 */
function calculateVelocity(
    prev: PoseLandmark,
    curr: PoseLandmark
): number {
    return Math.sqrt(
        Math.pow(curr.x - prev.x, 2) +
        Math.pow(curr.y - prev.y, 2)
    );
}

/**
 * Detect start and end of swing based on movement activity
 * Returns timestamps in milliseconds
 */
export function detectSwingInterval(frames: PoseFrame[]): { start: number; end: number } {
    if (!frames || frames.length < 10) {
        return { start: 0, end: frames[frames.length - 1]?.timestamp || 0 };
    }

    const velocities: number[] = [];
    // Calculate velocities for right wrist (index 16)
    for (let i = 1; i < frames.length; i++) {
        const prev = frames[i - 1].landmarks[16];
        const curr = frames[i].landmarks[16];
        if (prev && curr) {
            velocities.push(calculateVelocity(prev, curr));
        } else {
            velocities.push(0);
        }
    }

    // Find max velocity (Impact)
    let maxVel = 0;
    let maxVelIndex = 0;
    for (let i = 0; i < velocities.length; i++) {
        if (velocities[i] > maxVel) {
            maxVel = velocities[i];
            maxVelIndex = i;
        }
    }

    // Lower threshold for better sensitivity
    const ACTIVITY_THRESHOLD = maxVel * 0.08;

    // Find start (Address) - Look for stable low velocity
    let startIndex = 0;
    for (let i = maxVelIndex; i >= 0; i--) {
        if (velocities[i] < ACTIVITY_THRESHOLD) {
            // Check for stability (3 frames)
            let isStable = true;
            for (let j = 1; j <= 3 && i - j >= 0; j++) {
                if (velocities[i - j] > ACTIVITY_THRESHOLD) {
                    isStable = false;
                    break;
                }
            }
            if (isStable) {
                // Ensure we capture the takeaway trigger
                startIndex = Math.max(0, i - 15);
                break;
            }
        }
    }

    // Find end (Finish) - Look for stable low velocity
    let endIndex = frames.length - 1;
    for (let i = maxVelIndex; i < velocities.length; i++) {
        if (velocities[i] < ACTIVITY_THRESHOLD) {
            let isStable = true;
            for (let j = 1; j <= 5 && i + j < velocities.length; j++) {
                if (velocities[i + j] > ACTIVITY_THRESHOLD) {
                    isStable = false;
                    break;
                }
            }
            if (isStable) {
                endIndex = Math.min(frames.length - 1, i + 20);
                break;
            }
        }
    }

    // Safety Force Min Duration: +/- 30 frames around maxVel if detection failed
    if (endIndex - startIndex < 30) {
        startIndex = Math.max(0, maxVelIndex - 45); // 1.5s before
        endIndex = Math.min(frames.length - 1, maxVelIndex + 45); // 1.5s after
    }

    const start = frames[startIndex]?.timestamp || 0;
    const end = frames[endIndex]?.timestamp || frames[frames.length - 1].timestamp;

    console.log(`[DEBUG] Swing Interval: ${startIndex} (${start}ms) -> ${endIndex} (${end}ms), MaxVel Frame: ${maxVelIndex}`);

    return { start, end };
}

export function analyzeSwing(frames: PoseFrame[]): SwingMetrics | null {
    if (!frames || frames.length < 2) {
        console.log('[DEBUG] Not enough frames for analysis:', frames?.length);
        return null;
    }

    // Detect swing interval first
    const interval = detectSwingInterval(frames);

    // Filter frames to only include the swing part
    const swingFrames = frames.filter(f => f.timestamp >= interval.start && f.timestamp <= interval.end);

    // Fallback if filtering resulted in too few frames (shouldn't happen with correct detection)
    const analysisFrames = swingFrames.length > 5 ? swingFrames : frames;

    console.log(`[DEBUG] Analyzing ${analysisFrames.length} frames (original: ${frames.length})`);

    // Get first frame (address position) - relative to swing start
    const addressFrame = analysisFrames[0];

    // Find frame with maximum arm extension (approximate impact)
    let maxArmDistance = 0;
    let impactFrameIndex = 0;

    for (let i = 0; i < analysisFrames.length; i++) {
        const landmarks = analysisFrames[i].landmarks;
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

    const impactFrame = analysisFrames[impactFrameIndex];

    // Calculate spine angles
    const addressSpineAngle = calculateSpineAngle(addressFrame.landmarks);
    const impactSpineAngle = calculateSpineAngle(impactFrame.landmarks);

    // Calculate head movement throughout swing
    let maxLateralMovement = 0;
    let maxVerticalMovement = 0;

    for (const frame of analysisFrames) {
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
        swingInterval: interval
    };

    console.log('[DEBUG] Swing analysis complete:', metrics);
    return metrics;
}
