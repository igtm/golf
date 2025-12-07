import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { PoseFrame, PoseLandmark } from '../types/swing';

// MediaPipe Pose connections
const POSE_CONNECTIONS: [number, number][] = [
    // Torso
    [11, 12], [11, 23], [12, 24], [23, 24],
    // Right arm
    [12, 14], [14, 16],
    // Left arm
    [11, 13], [13, 15],
    // Right leg
    [24, 26], [26, 28],
    // Left leg
    [23, 25], [25, 27],
    // Face
    [0, 1], [1, 2], [2, 3], [3, 7],
    [0, 4], [4, 5], [5, 6], [6, 8],
];

// Club approximation: extends from wrist
const CLUB_LENGTH = 0.3; // Relative length

interface SkeletonPlayerProps {
    frames: PoseFrame[];
    currentTime: number; // in ms
    duration: number; // in ms
    isPlaying: boolean;
    width?: number;
    height?: number;
    showTrajectory?: boolean;
    swingPhases?: { name: string; timestamp: number }[];
}

export const SkeletonPlayer = forwardRef<HTMLCanvasElement, SkeletonPlayerProps>(({
    frames,
    currentTime,
    duration,
    isPlaying: _isPlaying,
    width = 300,
    height = 400,
    showTrajectory = true,
    swingPhases,
}, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useImperativeHandle(ref, () => canvasRef.current!);

    // Find top of swing (phase transition point)
    const getTopOfSwingIndex = useCallback(() => {
        if (!swingPhases) {
            // Approximate: find where x velocity of left wrist changes direction
            let maxWristHeight = 0;
            let topIndex = Math.floor(frames.length / 2);

            for (let i = 0; i < frames.length; i++) {
                const landmarks = frames[i].landmarks;
                if (landmarks.length > 15) {
                    const leftWrist = landmarks[15];
                    // Lower y = higher position (screen coords)
                    if (leftWrist && (1 - leftWrist.y) > maxWristHeight) {
                        maxWristHeight = 1 - leftWrist.y;
                        topIndex = i;
                    }
                }
            }
            return topIndex;
        }

        const topPhase = swingPhases.find(p => p.name === 'top');
        if (topPhase) {
            return frames.findIndex(f => f.timestamp >= topPhase.timestamp) || Math.floor(frames.length / 2);
        }
        return Math.floor(frames.length / 2);
    }, [frames, swingPhases]);

    // Get current frame index based on time
    const getCurrentFrameIndex = useCallback(() => {
        if (frames.length === 0) return 0;

        const targetTime = currentTime;
        let closestIndex = 0;
        let closestDiff = Infinity;

        for (let i = 0; i < frames.length; i++) {
            const diff = Math.abs(frames[i].timestamp - targetTime);
            if (diff < closestDiff) {
                closestDiff = diff;
                closestIndex = i;
            }
        }
        return closestIndex;
    }, [frames, currentTime]);

    // Calculate club end position
    const getClubEndPosition = (landmarks: PoseLandmark[]): { x: number; y: number } | null => {
        if (landmarks.length < 16) return null;

        const leftWrist = landmarks[15];
        const leftElbow = landmarks[13];

        if (!leftWrist || !leftElbow) return null;

        // Extend club from wrist in direction of forearm
        const dx = leftWrist.x - leftElbow.x;
        const dy = leftWrist.y - leftElbow.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length === 0) return null;

        return {
            x: leftWrist.x + (dx / length) * CLUB_LENGTH,
            y: leftWrist.y + (dy / length) * CLUB_LENGTH,
        };
    };

    // Draw function
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear and draw grid background
        ctx.fillStyle = '#374151'; // gray-700
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = '#4B5563'; // gray-600
        ctx.lineWidth = 1;
        const gridSize = 20;

        for (let x = 0; x <= width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y <= height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        if (frames.length === 0) {
            ctx.fillStyle = '#9CA3AF';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No pose data', width / 2, height / 2);
            return;
        }

        const currentFrameIndex = getCurrentFrameIndex();
        const topOfSwingIndex = getTopOfSwingIndex();
        const currentLandmarks = frames[currentFrameIndex]?.landmarks;

        // Draw trajectory if enabled
        if (showTrajectory) {
            // Backswing trajectory (blue)
            ctx.strokeStyle = '#3B82F6';
            ctx.lineWidth = 2;
            ctx.beginPath();
            let started = false;

            for (let i = 0; i <= Math.min(topOfSwingIndex, currentFrameIndex); i++) {
                const clubEnd = getClubEndPosition(frames[i].landmarks);
                if (clubEnd) {
                    const x = (1 - clubEnd.x) * width; // Mirror
                    const y = clubEnd.y * height;
                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
            }
            ctx.stroke();

            // Downswing trajectory (orange)
            if (currentFrameIndex > topOfSwingIndex) {
                ctx.strokeStyle = '#F59E0B';
                ctx.lineWidth = 2;
                ctx.beginPath();
                started = false;

                for (let i = topOfSwingIndex; i <= currentFrameIndex; i++) {
                    const clubEnd = getClubEndPosition(frames[i].landmarks);
                    if (clubEnd) {
                        const x = (1 - clubEnd.x) * width;
                        const y = clubEnd.y * height;
                        if (!started) {
                            ctx.moveTo(x, y);
                            started = true;
                        } else {
                            ctx.lineTo(x, y);
                        }
                    }
                }
                ctx.stroke();
            }
        }

        // Draw skeleton
        if (currentLandmarks && currentLandmarks.length > 0) {
            // Draw connections
            ctx.strokeStyle = '#10B981'; // emerald
            ctx.lineWidth = 3;

            for (const [start, end] of POSE_CONNECTIONS) {
                if (currentLandmarks[start] && currentLandmarks[end]) {
                    const x1 = (1 - currentLandmarks[start].x) * width;
                    const y1 = currentLandmarks[start].y * height;
                    const x2 = (1 - currentLandmarks[end].x) * width;
                    const y2 = currentLandmarks[end].y * height;

                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
            }

            // Draw club
            const leftWrist = currentLandmarks[15];
            const clubEnd = getClubEndPosition(currentLandmarks);
            if (leftWrist && clubEnd) {
                ctx.strokeStyle = '#EF4444'; // red
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo((1 - leftWrist.x) * width, leftWrist.y * height);
                ctx.lineTo((1 - clubEnd.x) * width, clubEnd.y * height);
                ctx.stroke();

                // Club head
                ctx.fillStyle = '#EF4444';
                ctx.beginPath();
                ctx.arc((1 - clubEnd.x) * width, clubEnd.y * height, 5, 0, Math.PI * 2);
                ctx.fill();
            }

            // Draw landmarks
            ctx.fillStyle = '#FBBF24'; // amber
            for (const landmark of currentLandmarks) {
                if (landmark) {
                    const x = (1 - landmark.x) * width;
                    const y = landmark.y * height;
                    ctx.beginPath();
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Draw frame info
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(5, 5, 100, 20);
        ctx.fillStyle = '#fff';
        ctx.font = '12px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Frame ${currentFrameIndex + 1}/${frames.length}`, 10, 18);

    }, [frames, currentTime, duration, width, height, showTrajectory, getCurrentFrameIndex, getTopOfSwingIndex]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="rounded-lg"
        />
    );
});

export default SkeletonPlayer;
