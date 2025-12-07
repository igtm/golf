import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Timer, Circle, Square, RotateCcw, Eye, User } from 'lucide-react';
import Camera, { type CameraRef } from '../components/Camera';
import { useVideoRecorder } from '../hooks/useVideoRecorder';
import { storage } from '../utils/storage';
import type { PoseLandmark, SwingSession } from '../types/swing';

type RecordingState = 'idle' | 'countdown' | 'recording' | 'saving' | 'preview';

const RecordPage = () => {
    const navigate = useNavigate();
    const cameraRef = useRef<CameraRef>(null);
    const [recordingState, setRecordingState] = useState<RecordingState>('idle');
    const recordingStateRef = useRef<RecordingState>('idle');
    const [countdown, setCountdown] = useState(5);
    const [selectedTimer, setSelectedTimer] = useState(5);
    const [cameraAngle, setCameraAngle] = useState<'side' | 'behind'>('side');
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingDurationRef = useRef(0);
    const countdownIntervalRef = useRef<number | null>(null);
    const recordingIntervalRef = useRef<number | null>(null);

    const { startRecording, stopRecording, addPoseFrame, reset: resetRecorder } = useVideoRecorder();

    // Keep refs in sync with state
    useEffect(() => {
        recordingStateRef.current = recordingState;
    }, [recordingState]);

    useEffect(() => {
        recordingDurationRef.current = recordingDuration;
    }, [recordingDuration]);

    // Cleanup intervals on unmount
    useEffect(() => {
        return () => {
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
        };
    }, []);

    // Handle landmarks updates during recording
    const handleLandmarksUpdate = useCallback((landmarks: PoseLandmark[]) => {
        if (recordingStateRef.current === 'recording' && landmarks.length > 0) {
            addPoseFrame(landmarks);
        }
    }, [addPoseFrame]);

    const startRecordingSession = useCallback(() => {
        // Prevent double calls
        if (recordingStateRef.current === 'recording') {
            console.log('[DEBUG] Already recording, ignoring');
            return;
        }

        const stream = cameraRef.current?.getStream();
        if (!stream) {
            console.error('[DEBUG] No camera stream available');
            setRecordingState('idle');
            recordingStateRef.current = 'idle';
            return;
        }

        console.log('[DEBUG] Starting recording session');

        // Clear any existing interval first
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }

        setRecordingState('recording');
        recordingStateRef.current = 'recording';
        setRecordingDuration(0);
        recordingDurationRef.current = 0;
        playBeep(660, 200);

        // Start video recording
        startRecording(stream);

        // Start duration counter
        recordingIntervalRef.current = window.setInterval(() => {
            recordingDurationRef.current += 1;
            setRecordingDuration(recordingDurationRef.current);
            console.log('[DEBUG] Duration tick:', recordingDurationRef.current);
        }, 1000);
    }, [startRecording]);

    const startCountdown = useCallback(() => {
        // Clear any existing countdown
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
        }

        setCountdown(selectedTimer);
        setRecordingState('countdown');
        recordingStateRef.current = 'countdown';

        let currentCount = selectedTimer;

        countdownIntervalRef.current = window.setInterval(() => {
            currentCount -= 1;
            setCountdown(currentCount);

            if (currentCount <= 3 && currentCount > 0) {
                playBeep(440);
            }

            if (currentCount <= 0) {
                if (countdownIntervalRef.current) {
                    clearInterval(countdownIntervalRef.current);
                    countdownIntervalRef.current = null;
                }
                playBeep(880);
                startRecordingSession();
            }
        }, 1000);
    }, [selectedTimer, startRecordingSession]);

    const handleStopRecording = async () => {
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }
        setRecordingState('saving');
        recordingStateRef.current = 'saving';

        try {
            const { blob, frames } = await stopRecording();

            console.log(`[DEBUG] Recording stopped. Blob size: ${blob.size}, Type: ${blob.type}, Frames: ${frames.length}`);

            if (blob.size === 0) {
                console.error('[DEBUG] Blob is empty!');
            }

            // Create session
            const session: SwingSession = {
                id: storage.generateId(),
                createdAt: new Date(),
                duration: recordingDurationRef.current,
                videoBlob: blob,
                videoUrl: storage.createVideoUrl(blob),
                poseFrames: frames,
                cameraAngle: cameraAngle,
            };

            // Save to IndexedDB
            await storage.saveSession(session);

            console.log(`[DEBUG] Session saved: ${session.id}`);

            // Navigate to review
            navigate(`/review/${session.id}`);
        } catch (err) {
            console.error('Failed to save session:', err);
            setRecordingState('preview');
            recordingStateRef.current = 'preview';
        }
    };

    const resetRecording = () => {
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }
        resetRecorder();
        setRecordingState('idle');
        recordingStateRef.current = 'idle';
        setRecordingDuration(0);
        recordingDurationRef.current = 0;
    };

    const playBeep = (frequency: number, duration = 100) => {
        try {
            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const audioContext = new AudioContextClass();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = frequency;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.3;
            oscillator.start();
            setTimeout(() => {
                oscillator.stop();
                audioContext.close();
            }, duration);
        } catch (e) {
            console.log('Audio not supported');
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="h-screen bg-slate-900 text-white flex flex-col overflow-hidden">
            {/* Header */}
            <header className="flex items-center justify-between p-4 bg-slate-800/50 z-40">
                <Link to="/" className="p-2 hover:bg-slate-700 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </Link>
                <h1 className="text-lg font-semibold">Record Swing</h1>
                <div className="w-10" />
            </header>

            {/* Camera View */}
            <div className="flex-1 relative min-h-0">
                <Camera
                    ref={cameraRef}
                    onLandmarksUpdate={handleLandmarksUpdate}
                    showDebug={recordingState !== 'countdown'}
                />

                {/* Countdown Overlay */}
                {recordingState === 'countdown' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
                        <div className="text-center">
                            <span className="text-9xl font-bold text-white animate-pulse">
                                {countdown}
                            </span>
                            <p className="text-xl text-slate-300 mt-4">Get ready...</p>
                        </div>
                    </div>
                )}

                {/* Recording Indicator */}
                {recordingState === 'recording' && (
                    <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-500/90 px-4 py-2 rounded-full z-30">
                        <Circle className="w-3 h-3 fill-white animate-pulse" />
                        <span className="font-mono font-bold">{formatTime(recordingDuration)}</span>
                    </div>
                )}

                {/* Saving Overlay */}
                {recordingState === 'saving' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-30">
                        <div className="text-center">
                            <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                            <p className="text-xl">Saving...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="p-6 bg-slate-800/90 space-y-4 z-40">
                {/* Settings Row */}
                {recordingState === 'idle' && (
                    <div className="space-y-3">
                        {/* Timer Selection */}
                        <div className="flex items-center justify-center gap-4">
                            <Timer className="w-5 h-5 text-slate-400" />
                            {[5, 10, 15].map(time => (
                                <button
                                    key={time}
                                    onClick={() => setSelectedTimer(time)}
                                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${selectedTimer === time
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                        }`}
                                >
                                    {time}s
                                </button>
                            ))}
                        </div>

                        {/* Camera Angle Selection */}
                        <div className="flex items-center justify-center gap-4">
                            <Eye className="w-5 h-5 text-slate-400" />
                            <button
                                onClick={() => setCameraAngle('side')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${cameraAngle === 'side'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                            >
                                <User className="w-4 h-4" /> 横から
                            </button>
                            <button
                                onClick={() => setCameraAngle('behind')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${cameraAngle === 'behind'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                            >
                                <User className="w-4 h-4 rotate-180" /> 後ろから
                            </button>
                        </div>
                    </div>
                )}

                {/* Main Action Button */}
                <div className="flex justify-center">
                    {recordingState === 'idle' && (
                        <button
                            onClick={startCountdown}
                            className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all shadow-lg shadow-red-500/30"
                        >
                            <Circle className="w-8 h-8 fill-white" />
                        </button>
                    )}

                    {recordingState === 'countdown' && (
                        <button
                            onClick={resetRecording}
                            className="w-20 h-20 rounded-full bg-slate-600 hover:bg-slate-500 flex items-center justify-center transition-all"
                        >
                            <RotateCcw className="w-8 h-8" />
                        </button>
                    )}

                    {recordingState === 'recording' && (
                        <button
                            onClick={handleStopRecording}
                            className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all shadow-lg shadow-red-500/30 animate-pulse"
                        >
                            <Square className="w-8 h-8 fill-white" />
                        </button>
                    )}
                </div>

                {/* Instructions */}
                {recordingState === 'idle' && (
                    <p className="text-center text-slate-400 text-sm">
                        Start camera first, then tap record button
                    </p>
                )}
            </div>
        </div>
    );
};

export default RecordPage;
