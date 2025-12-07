
import type { PoseLandmark } from '../types/swing';

// Configuration
const ROI_SIZE = 250; // Region of interest around hands
const MIN_EDGE_PIXELS = 30; // Minimum number of edge pixels to attempt PCA
const EDGE_THRESHOLD = 40; // Gradient magnitude threshold

// Off-screen canvas for processing
let processingCanvas: HTMLCanvasElement | null = null;
let processingCtx: CanvasRenderingContext2D | null = null;

export interface ClubData {
    angle: number;
    score: number;
}

/**
 * Detects the club angle using Principal Component Analysis (PCA) on edge pixels.
 */
export function detectClub(
    video: HTMLVideoElement,
    landmarks: PoseLandmark[],
    width: number = 640,
    height: number = 480
): ClubData | null {
    if (!landmarks || landmarks.length < 17) return null;

    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];

    // Require valid visibility
    if ((leftWrist.visibility || 0) < 0.5 || (rightWrist.visibility || 0) < 0.5) return null;

    // Hands center (normalized 0-1)
    const cx = (leftWrist.x + rightWrist.x) / 2;
    const cy = (leftWrist.y + rightWrist.y) / 2;

    // Convert to pixel coordinates
    const px = cx * width;
    const py = cy * height;

    // Initialize canvas if needed
    if (!processingCanvas) {
        processingCanvas = document.createElement('canvas');
        processingCanvas.width = ROI_SIZE;
        processingCanvas.height = ROI_SIZE;
        processingCtx = processingCanvas.getContext('2d', { willReadFrequently: true });
    }

    if (!processingCtx) return null;

    // Draw ROI from video
    const sx = Math.max(0, px - ROI_SIZE / 2);
    const sy = Math.max(0, py - ROI_SIZE / 2);

    processingCtx.drawImage(video, sx, sy, ROI_SIZE, ROI_SIZE, 0, 0, ROI_SIZE, ROI_SIZE);

    // Get pixel data
    const imageData = processingCtx.getImageData(0, 0, ROI_SIZE, ROI_SIZE);
    const data = imageData.data;

    const w = ROI_SIZE;
    const h = ROI_SIZE;

    // 1. Collect Edge Points
    // We strictly look for edges that could be the shaft.
    // We ignore the immediate center (hands) to avoid noise.

    let sumX = 0;
    let sumY = 0;
    let count = 0;

    // Points array to store (x, y) relative to center, for covariance calculation
    // Using a typed array for performance or just simple loop?
    // We need 2nd pass for covariance, so let's store basics or do online algorithm.
    // Online algorithm for covariance is cleaner.

    // But we need to filter first.
    // Let's perform simple edge detection and store points.

    const points: { x: number, y: number }[] = [];
    const centerX = ROI_SIZE / 2;
    const centerY = ROI_SIZE / 2;
    const minRadiusSq = 15 * 15; // Ignore hands center

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            // Distance check first to skip center
            const dx = x - centerX;
            const dy = y - centerY;
            if (dx * dx + dy * dy < minRadiusSq) continue;

            const i = (y * w + x) * 4;

            // Green channel gradient
            const gx = -data[i - 4 + 1] + data[i + 4 + 1];
            const gy = -data[i - w * 4 + 1] + data[i + w * 4 + 1];
            const mag = Math.abs(gx) + Math.abs(gy);

            if (mag > EDGE_THRESHOLD) {
                points.push({ x: dx, y: dy });
                sumX += dx;
                sumY += dy;
                count++;
            }
        }
    }

    if (count < MIN_EDGE_PIXELS) {
        return null; // Not enough edge data
    }

    // 2. PCA Calculation
    const meanX = sumX / count;
    const meanY = sumY / count;

    let covXX = 0;
    let covXY = 0;
    let covYY = 0;

    for (let i = 0; i < count; i++) {
        const p = points[i];
        const devX = p.x - meanX;
        const devY = p.y - meanY;

        covXX += devX * devX;
        covXY += devX * devY;
        covYY += devY * devY;
    }

    covXX /= count;
    covXY /= count;
    covYY /= count;

    // Eigenvalues of 2x2 matrix
    // lambda = (Trace +/- sqrt(Trace^2 - 4*Det)) / 2
    const trace = covXX + covYY;
    const det = covXX * covYY - covXY * covXY;
    const term = Math.sqrt(Math.max(0, trace * trace - 4 * det));

    const lambda1 = (trace + term) / 2; // Major eigenvalue
    const lambda2 = (trace - term) / 2; // Minor eigenvalue

    // Linearity score: Ratio of major axis to total variance
    // If club is a line, lambda1 >> lambda2
    const linearity = lambda1 / (lambda1 + lambda2 + 0.0001); // Avoid div/0

    if (linearity < 0.85) {
        return null; // Not linear enough (probably just noise/blob)
    }

    // Eigenvector for lambda1
    // (covXX - lambda1) * vx + covXY * vy = 0
    // => vx = covXY, vy = lambda1 - covXX
    // Or if covXY is 0...

    let vx = covXY;
    let vy = lambda1 - covXX;

    // Normalize
    let mag = Math.sqrt(vx * vx + vy * vy);
    if (mag === 0) {
        // Fallback or singular case
        vx = 1; vy = 0;
    } else {
        vx /= mag;
        vy /= mag;
    }

    // 3. Resolve Direction
    // The eigenvector (vx, vy) has ambiguity (could be +/-).
    // We use the "Center of Mass" relative to hands (0,0).
    // The club shaft "extends" from the hands.
    // The mean position (meanX, meanY) of the edge pixels represents the "average" location of the shaft.
    // So the vector (meanX, meanY) points generally in the correct direction from hands.

    const dirDot = vx * meanX + vy * meanY;
    if (dirDot < 0) {
        vx = -vx;
        vy = -vy;
    }

    // Convert to angle (degrees)
    let bestAngle = Math.atan2(vy, vx) * (180 / Math.PI);

    // Normalize to 0-360 positive
    if (bestAngle < 0) bestAngle += 360;

    // Confidence
    // Combine linearity with density?
    // For now linearity is sufficient for "score" if it passed threshold.
    // Maybe boost it by log(count) to prefer longer/stronger lines
    const normalizedScore = Math.min(linearity, 1.0);

    return {
        angle: bestAngle,
        score: normalizedScore
    };
}
