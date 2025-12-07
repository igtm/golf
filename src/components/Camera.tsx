import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

const Camera = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [landmarker, setLandmarker] = useState<PoseLandmarker | null>(null);
    const [webcamRunning, setWebcamRunning] = useState(false);

    // Initialize MediaPipe Pose Landmarker
    useEffect(() => {
        const createPoseLandmarker = async () => {
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
            );
            const newLandmarker = await PoseLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose/pose_landmarker/float16/1/pose_landmarker.task`,
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numPoses: 1
            });
            setLandmarker(newLandmarker);
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

        if (webcamRunning === false) return; // Stop if toggle off (naive check)

        const startTimeMs = performance.now();

        // Resize canvas to match video
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
            {/* Helper text if not running */}
            {!webcamRunning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10">
                    <button
                        onClick={enableCam}
                        disabled={!landmarker}
                        className="px-6 py-3 bg-green-500 hover:bg-green-600 rounded-full font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {landmarker ? "Start Camera" : "Loading AI..."}
                    </button>
                </div>
            )}

            <video
                ref={videoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }} // Mirror effect
            ></video>
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                style={{ transform: 'scaleX(-1)' }} // Mirror effect for skeleton too
            ></canvas>
        </div>
    );
};

export default Camera;
