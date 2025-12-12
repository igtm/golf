import { useEffect, useRef } from 'react';
import type { PoseFrame } from '../types/swing';
import { calculateVZone } from '../utils/metrics';

interface VZoneOverlayProps {
    frames: PoseFrame[];
    width: number;
    height: number;
    visible: boolean;
}

export const VZoneOverlay = ({ frames, width, height, visible }: VZoneOverlayProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !visible) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        const vZone = calculateVZone(frames);
        if (!vZone) return;

        const { neck, hands, clubHead } = vZone;

        // Draw V-Zone Lines
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'; // Yellow, semi-transparent
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]); // Dashed line

        // Extrapolation Factor
        const EXTEND_FACTOR = 4.0;

        // Line 1: Club Head -> Neck (Swing Plane)
        const v1x = neck.x - clubHead.x;
        const v1y = neck.y - clubHead.y;

        ctx.beginPath();
        ctx.moveTo(clubHead.x * width, clubHead.y * height);
        ctx.lineTo((clubHead.x + v1x * EXTEND_FACTOR) * width, (clubHead.y + v1y * EXTEND_FACTOR) * height);
        ctx.stroke();

        // Line 2: Club Head -> Hands (Shaft Plane)
        const v2x = hands.x - clubHead.x;
        const v2y = hands.y - clubHead.y;

        ctx.beginPath();
        ctx.moveTo(clubHead.x * width, clubHead.y * height);
        ctx.lineTo((clubHead.x + v2x * EXTEND_FACTOR) * width, (clubHead.y + v2y * EXTEND_FACTOR) * height);
        ctx.stroke();

    }, [frames, width, height, visible]);

    if (!visible) return null;

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="absolute z-10 pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ 
                width: width ? `${width}px` : '100%', 
                height: height ? `${height}px` : '100%' 
            }}
        />
    );
};
