import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

const Camera = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [landmarker, setLandmarker] = useState<PoseLandmarker | null>(null);
    const [webcamRunning, setWebcamRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Initialize MediaPipe Pose Landmarker
    useEffect(() => {
        const createPoseLandmarker = async () => {
            try {
                setLoading(true);
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );
                const newLandmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm/pose_landmarker_lite.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numPoses: 1
                });
                setLandmarker(newLandmarker);
                setLoading(false);
            } catch (err) {
                console.error('MediaPipe initialization error:', err);
                setError(err instanceof Error ? err.message : 'Failed to load AI model');
                setLoading(false);
            }
        };
        createPoseLandmarker();
    }, []);

    const enableCam = () => {
        if (!landmarker) {
            console.log("Wait for poseLandmarker to load before enabling!");
            return;
        }

        if (webcamRunning) {
            setWebcamRunning(false);
            return;
        }

        setWebcamRunning(true);

        const video = videoRef.current;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && video) {
            navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
                video.srcObject = stream;
                video.addEventListener("loadeddata", predictWebcam);
            });
        }
    };

    const predictWebcam = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (!video || !canvas || !landmarker) return;

        if (webcamRunning === false) return;

        const startTimeMs = performance.now();

        if (video.videoWidth > 0 && video.videoHeight > 0) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext("2d");
            if (ctx) {
                const drawingUtils = new DrawingUtils(ctx);

                let lastVideoTime = -1;
                if (lastVideoTime !== video.currentTime) {
                    lastVideoTime = video.currentTime;
                    landmarker.detectForVideo(video, startTimeMs, (result) => {
                        ctx.save();
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        for (const landmark of result.landmarks) {
                            drawingUtils.drawLandmarks(landmark, {
                                radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1)
                            });
                            drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
                        }
                        ctx.restore();
                    });
                }
            }
        }

        if (webcamRunning) {
            window.requestAnimationFrame(predictWebcam);
        }
    };

    return (
        <div className="relative w-full max-w-md mx-auto aspect-[9/16] bg-black rounded-lg overflow-hidden shadow-xl">
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
