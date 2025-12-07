// Types for swing analysis app

export interface PoseLandmark {
    x: number;
    y: number;
    z: number;
    visibility?: number;
}

export interface PoseFrame {
    timestamp: number;
    landmarks: PoseLandmark[];
}

export interface SwingMetrics {
    spineAngle: {
        address: number;
        impact: number;
        change: number;
    };
    headMovement: {
        lateral: number; // cm
        vertical: number; // cm
    };
    xFactor?: number;
    tempo?: {
        backswing: number; // ms
        downswing: number; // ms
        ratio: number;
    };
    swingInterval?: {
        start: number; // ms
        end: number; // ms
    };
}

export interface SwingPhase {
    name: 'address' | 'takeaway' | 'top' | 'downswing' | 'impact' | 'followthrough' | 'finish';
    timestamp: number;
    frameIndex: number;
}

export interface SwingSession {
    id: string;
    createdAt: Date;
    duration: number; // seconds
    videoBlob?: Blob;
    videoUrl?: string;
    poseFrames: PoseFrame[];
    metrics?: SwingMetrics;
    phases?: SwingPhase[];
    club?: string;
    notes?: string;
    cameraAngle?: 'side' | 'behind';
}

export interface SessionSummary {
    id: string;
    createdAt: Date;
    duration: number;
    club?: string;
    thumbnailUrl?: string;
}
