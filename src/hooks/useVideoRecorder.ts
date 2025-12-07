import { useRef, useState, useCallback } from 'react';
import type { PoseFrame, PoseLandmark } from '../types/swing';

interface UseVideoRecorderOptions {
    onFrame?: (landmarks: PoseLandmark[]) => void;
}

interface UseVideoRecorderReturn {
    isRecording: boolean;
    recordedBlob: Blob | null;
    poseFrames: PoseFrame[];
    startRecording: (stream: MediaStream) => void;
    stopRecording: () => Promise<{ blob: Blob; frames: PoseFrame[] }>;
    addPoseFrame: (landmarks: PoseLandmark[]) => void;
    reset: () => void;
}

export const useVideoRecorder = (_options?: UseVideoRecorderOptions): UseVideoRecorderReturn => {
    const [isRecording, setIsRecording] = useState(false);
    const isRecordingRef = useRef(false);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [poseFrames, setPoseFrames] = useState<PoseFrame[]>([]);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const startTimeRef = useRef<number>(0);
    const framesRef = useRef<PoseFrame[]>([]);

    const startRecording = useCallback((stream: MediaStream) => {
        // Reset state
        chunksRef.current = [];
        framesRef.current = [];
        setPoseFrames([]);
        setRecordedBlob(null);

        // Determine supported MIME type
        const mimeTypes = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4',
        ];
        const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';

        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunksRef.current.push(event.data);
            }
        };

        startTimeRef.current = performance.now();
        mediaRecorder.start(100); // Collect data every 100ms
        isRecordingRef.current = true;
        setIsRecording(true);
        console.log('[DEBUG] Video recorder started');
    }, []);

    const stopRecording = useCallback((): Promise<{ blob: Blob; frames: PoseFrame[] }> => {
        isRecordingRef.current = false;
        setIsRecording(false);

        return new Promise((resolve) => {
            const mediaRecorder = mediaRecorderRef.current;
            if (!mediaRecorder || mediaRecorder.state === 'inactive') {
                console.log('[DEBUG] MediaRecorder inactive, returning empty');
                resolve({ blob: new Blob(), frames: [] });
                return;
            }

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
                setRecordedBlob(blob);
                setPoseFrames([...framesRef.current]);
                console.log(`[DEBUG] MediaRecorder stopped, blob size: ${blob.size}, frames: ${framesRef.current.length}`);
                resolve({ blob, frames: [...framesRef.current] });
            };

            mediaRecorder.stop();
        });
    }, []);

    const addPoseFrame = useCallback((landmarks: PoseLandmark[]) => {
        // Use ref for immediate check (state updates are async)
        if (!isRecordingRef.current) return;

        const timestamp = performance.now() - startTimeRef.current;
        const frame: PoseFrame = { timestamp, landmarks };
        framesRef.current.push(frame);
    }, []);

    const reset = useCallback(() => {
        isRecordingRef.current = false;
        setIsRecording(false);
        setRecordedBlob(null);
        setPoseFrames([]);
        chunksRef.current = [];
        framesRef.current = [];
        mediaRecorderRef.current = null;
    }, []);

    return {
        isRecording,
        recordedBlob,
        poseFrames,
        startRecording,
        stopRecording,
        addPoseFrame,
        reset,
    };
};
