import { useEffect, useRef, useState, useCallback } from 'react';
import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

const Camera = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const landmarkerRef = useRef<PoseLandmarker | null>(null);
    const [landmarker, setLandmarker] = useState<PoseLandmarker | null>(null);
    const [webcamRunning, setWebcamRunning] = useState(false);
    const webcamRunningRef = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const lastVideoTimeRef = useRef<number>(-1);
    const animationFrameRef = useRef<number | null>(null);

    // Debug state
    const [debugInfo, setDebugInfo] = useState({
        fps: 0,
        landmarksCount: 0,
        videoSize: '0x0',
        detecting: false,
        lastError: ''
    });
    const frameCountRef = useRef(0);
    const lastFpsTimeRef = useRef(performance.now());

    // Initialize MediaPipe Pose Landmarker
    useEffect(() => {
        const createPoseLandmarker = async () => {
            try {
                setLoading(true);
                console.log('[DEBUG] Loading MediaPipe...');
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );
                console.log('[DEBUG] Vision loaded, creating landmarker...');
                const newLandmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numPoses: 1
                });
                console.log('[DEBUG] Landmarker created successfully');
                landmarkerRef.current = newLandmarker;
                setLandmarker(newLandmarker);
                setLoading(false);
            } catch (err) {
                console.error('[DEBUG] MediaPipe initialization error:', err);
                setError(err instanceof Error ? err.message : 'Failed to load AI model');
                setLoading(false);
            }
        };
        createPoseLandmarker();

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    const predictWebcam = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const currentLandmarker = landmarkerRef.current;

        // Check if we should continue
        if (!webcamRunningRef.current) {
            console.log('[DEBUG] webcamRunning is false, stopping loop');
            return;
        }

        if (!video || !canvas || !currentLandmarker) {
            console.log('[DEBUG] Missing refs:', { video: !!video, canvas: !!canvas, landmarker: !!currentLandmarker });
            animationFrameRef.current = window.requestAnimationFrame(predictWebcam);
            return;
        }

        // FPS calculation
        frameCountRef.current++;
        const now = performance.now();
        if (now - lastFpsTimeRef.current >= 1000) {
            const fps = Math.round(frameCountRef.current * 1000 / (now - lastFpsTimeRef.current));
            setDebugInfo(prev => ({ ...prev, fps }));
            frameCountRef.current = 0;
            lastFpsTimeRef.current = now;
        }

        const startTimeMs = performance.now();

        // Only resize canvas once when video dimensions are available
        if (video.videoWidth > 0 && video.videoHeight > 0) {
            if (canvas.width !== video.videoWidth) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                setDebugInfo(prev => ({ ...prev, videoSize: `${video.videoWidth}x${video.videoHeight}` }));
            }

            // Only detect if we have a new frame
            if (lastVideoTimeRef.current !== video.currentTime) {
                lastVideoTimeRef.current = video.currentTime;
                setDebugInfo(prev => ({ ...prev, detecting: true }));

                try {
                    const results = currentLandmarker.detectForVideo(video, startTimeMs);

                    const landmarksCount = results.landmarks?.length || 0;
                    setDebugInfo(prev => ({
                        ...prev,
                        landmarksCount,
                        lastError: landmarksCount === 0 ? 'No pose detected' : ''
                    }));

                    const ctx = canvas.getContext("2d");
                    if (ctx) {
                        ctx.save();
                        ctx.clearRect(0, 0, canvas.width, canvas.height);

                        // Draw all detected poses
                        if (results.landmarks && results.landmarks.length > 0) {
                            const drawingUtils = new DrawingUtils(ctx);
                            for (const landmarks of results.landmarks) {
                                // Draw connectors first (lines)
                                drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
                                    color: '#00FF00',
                                    lineWidth: 4
                                });
                                // Draw landmarks (points)
                                drawingUtils.drawLandmarks(landmarks, {
                                    color: '#FF0000',
                                    fillColor: '#FF0000',
                                    radius: 6
                                });
                            }
                        }

                        ctx.restore();
                    }
                } catch (err) {
                    console.error('[DEBUG] Detection error:', err);
                    setDebugInfo(prev => ({
                        ...prev,
                        lastError: err instanceof Error ? err.message : 'Detection failed'
                    }));
                }
            }
        } else {
            setDebugInfo(prev => ({ ...prev, videoSize: 'waiting...', detecting: false }));
        }

        // Continue animation loop
        animationFrameRef.current = window.requestAnimationFrame(predictWebcam);
    }, []);

    const enableCam = () => {
        if (!landmarker) {
            console.log("[DEBUG] Wait for poseLandmarker to load before enabling!");
            return;
        }

        if (webcamRunning) {
            console.log("[DEBUG] Stopping webcam");
            webcamRunningRef.current = false;
            setWebcamRunning(false);
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            return;
        }

        console.log("[DEBUG] Starting webcam");
        webcamRunningRef.current = true;
        setWebcamRunning(true);

        const video = videoRef.current;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && video) {
            navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            }).then((stream) => {
                console.log("[DEBUG] Got media stream");
                video.srcObject = stream;
                video.onloadedmetadata = () => {
                    console.log("[DEBUG] Video metadata loaded, starting prediction loop");
                    video.play();
                    predictWebcam();
                };
            }).catch((err) => {
                console.error("[DEBUG] Camera error:", err);
                setError(`Camera error: ${err.message}`);
                webcamRunningRef.current = false;
                setWebcamRunning(false);
            });
        }
    };

    return (
        <div className="relative w-full max-w-md mx-auto aspect-[9/16] bg-black rounded-lg overflow-hidden shadow-xl">
            {/* Debug overlay */}
            {webcamRunning && (
                <div className="absolute top-2 left-2 right-2 bg-black/70 text-white text-xs p-2 rounded z-20 font-mono">
                    <div>FPS: {debugInfo.fps}</div>
                    <div>Video: {debugInfo.videoSize}</div>
                    <div>Poses: {debugInfo.landmarksCount}</div>
                    <div>Detecting: {debugInfo.detecting ? '✓' : '✗'}</div>
                    {debugInfo.lastError && <div className="text-yellow-400">⚠ {debugInfo.lastError}</div>}
                </div>
            )}

            {!webcamRunning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10 p-4">
                    {error ? (
                        <>
                            <div className="text-red-400 text-center mb-4">
                                <p className="font-bold mb-2">Error</p>
                                <p className="text-sm">{error}</p>
                            </div>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 rounded-full font-bold transition-all"
                            >
                                Reload
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={enableCam}
                            disabled={loading || !landmarker}
                            className="px-6 py-3 bg-green-500 hover:bg-green-600 rounded-full font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? "Loading AI..." : "Start Camera"}
                        </button>
                    )}
                </div>
            )}

            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
            ></video>
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ transform: 'scaleX(-1)' }}
            ></canvas>
        </div>
    );
};

export default Camera;
