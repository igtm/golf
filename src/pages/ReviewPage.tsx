import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Trash2, RotateCcw, Video, Activity, Download, Film, Volume2, VolumeX, Triangle } from 'lucide-react';
import { storage } from '../utils/storage';
import { analyzeSwing } from '../utils/metrics';
import { SkeletonPlayer } from '../components/SkeletonPlayer';
import { VZoneOverlay } from '../components/VZoneOverlay';


import type { SwingSession, SwingMetrics, PoseFrame, PoseLandmark } from '../types/swing';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { detectClub } from '../utils/clubDetection';

type ViewMode = 'video' | 'skeleton' | 'both';



const ReviewPage = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<number | null>(null);
    const skeletonCanvasRef = useRef<HTMLCanvasElement>(null);

    const [session, setSession] = useState<SwingSession | null>(null);
    const [metrics, setMetrics] = useState<SwingMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [currentTimeMs, setCurrentTimeMs] = useState(0);
    const [duration, setDuration] = useState(0);
    const [viewMode, setViewMode] = useState<ViewMode>('both');
    const [isMobile, setIsMobile] = useState(false);

    // Playback loop range
    const [playbackLoop, setPlaybackLoop] = useState<{ start: number; end: number } | null>(null);
    const [isLooping, setIsLooping] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    // Analysis state
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState(0);

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Volume state and handlers
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        if (newVolume > 0 && isMuted) {
            setIsMuted(false);
        }
    };

    const toggleMute = () => {
        setIsMuted(!isMuted);
    };

    // Sync volume with video element
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.volume = volume;
            videoRef.current.muted = isMuted;
        }
    }, [volume, isMuted, session]); // Re-run when session loads (video mounts)

    // Video Dimensions state for dynamic scaling
    const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });

    const [showVZone, setShowVZone] = useState(false); // V-Zone toggle state

    // Resize Observer to track video dimensions
    useEffect(() => {
        if (!videoRef.current) return;

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Use contentRect for precise rendered size
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setVideoDimensions({ width, height });
                }
            }
        });

        observer.observe(videoRef.current);

        return () => observer.disconnect();
    }, [viewMode, session]); // Re-attach when view changes

    // Load session
    useEffect(() => {
        const loadSession = async () => {
            if (!sessionId) {
                setError('No session ID provided');
                setLoading(false);
                return;
            }

            try {
                const loadedSession = await storage.getSession(sessionId);
                if (!loadedSession) {
                    setError('Session not found');
                    setLoading(false);
                    return;
                }

                if (loadedSession.videoBlob) {
                    loadedSession.videoUrl = storage.createVideoUrl(loadedSession.videoBlob);
                }

                // Check if session needs analysis
                // 1. Imported video (no poses)
                // 2. Recorded video (has poses but no club data)
                const needsPoseAnalysis = !loadedSession.poseFrames || loadedSession.poseFrames.length === 0;
                const needsClubAnalysis = loadedSession.poseFrames && loadedSession.poseFrames.length > 0 && !loadedSession.poseFrames[0].club;

                if (loadedSession.videoUrl && (needsPoseAnalysis || needsClubAnalysis)) {
                    console.log('Session needs analysis:', { needsPoseAnalysis, needsClubAnalysis });
                    setSession(loadedSession);
                    setLoading(false);
                    // If we are doing pose detection, we should also do club detection
                    runPostAnalysis(loadedSession, needsPoseAnalysis, needsClubAnalysis || needsPoseAnalysis);
                } else {
                    setSession(loadedSession);

                    if (loadedSession.poseFrames && loadedSession.poseFrames.length > 0) {
                        const calculatedMetrics = analyzeSwing(loadedSession.poseFrames);
                        setMetrics(calculatedMetrics);

                        // Use swing interval from metrics
                        if (calculatedMetrics?.swingInterval && calculatedMetrics.swingInterval.end > calculatedMetrics.swingInterval.start) {
                            const { start, end } = calculatedMetrics.swingInterval;
                            setPlaybackLoop({ start: start / 1000, end: end / 1000 });
                            // Start at beginning of swing
                            // setCurrentTime(start / 1000);
                            // if (videoRef.current) {
                            //     videoRef.current.currentTime = start / 1000;
                            // }
                        }
                    }
                    setLoading(false);
                }
            } catch (err) {
                console.error('Failed to load session:', err);
                setError('Failed to load session');
                setLoading(false);
            }
        };

        loadSession();
    }, [sessionId]);

    // Sync skeleton with video
    const syncSkeleton = useCallback(() => {
        if (videoRef.current && isPlaying) {
            setCurrentTimeMs(videoRef.current.currentTime * 1000);
            animationRef.current = requestAnimationFrame(syncSkeleton);
        }
    }, [isPlaying]);

    useEffect(() => {
        if (isPlaying) {
            animationRef.current = requestAnimationFrame(syncSkeleton);
        } else if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isPlaying, syncSkeleton]);

    const handlePlayPause = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const runPostAnalysis = async (currentSession: SwingSession, doPoseDetection: boolean, doClubDetection: boolean) => {
        if (!currentSession.videoUrl) return;

        try {
            setIsAnalyzing(true);
            setAnalysisProgress(0);

            // 1. Setup MediaPipe if needed
            let landmarker: PoseLandmarker | null = null;
            if (doPoseDetection) {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
                );
                landmarker = await PoseLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numPoses: 1
                });
            }

            // 2. Setup video for processing
            const video = document.createElement('video');
            video.src = currentSession.videoUrl;
            video.muted = true;
            video.playsInline = true;

            await new Promise((resolve) => {
                video.onloadedmetadata = () => resolve(true);
            });

            const duration = video.duration;
            const frames: PoseFrame[] = doPoseDetection ? [] : [...currentSession.poseFrames];

            if (doPoseDetection) {
                const fps = 30;
                const frameInterval = 1 / fps;
                let currentTime = 0;

                while (currentTime < duration) {
                    video.currentTime = currentTime;
                    await new Promise(r => { video.onseeked = () => r(true); });

                    if (landmarker) {
                        const result = landmarker.detectForVideo(video, currentTime * 1000);
                        const points = result.landmarks && result.landmarks.length > 0
                            ? result.landmarks[0] as unknown as PoseLandmark[]
                            : [];

                        const frame: PoseFrame = {
                            timestamp: currentTime * 1000,
                            landmarks: points
                        };

                        if (doClubDetection && points.length > 0) {
                            const club = await detectClub(video, points);
                            if (club) frame.club = club;
                        }

                        frames.push(frame);
                    }

                    setAnalysisProgress(Math.round((currentTime / duration) * 100));
                    currentTime += frameInterval;
                }
            } else if (doClubDetection) {
                // Existing frames, fill club data
                for (let i = 0; i < frames.length; i++) {
                    const frame = frames[i];
                    video.currentTime = frame.timestamp / 1000;
                    await new Promise(r => { video.onseeked = () => r(true); });

                    if (frame.landmarks.length > 0) {
                        const club = await detectClub(video, frame.landmarks);
                        if (club) frame.club = club;
                    }

                    setAnalysisProgress(Math.round((i / frames.length) * 100));
                }
            }

            // 3. Update Session
            const metrics = analyzeSwing(frames);

            const updatedSession: SwingSession = {
                ...currentSession,
                duration: duration,
                poseFrames: frames,
                metrics: metrics || undefined
            };

            await storage.saveSession(updatedSession);

            // 4. Reset state
            setSession(updatedSession);
            setMetrics(metrics);
            if (metrics?.swingInterval) {
                setPlaybackLoop(metrics.swingInterval);
            }
            setIsAnalyzing(false);
            if (landmarker) landmarker.close();

        } catch (err) {
            console.error('Analysis failed:', err);
            setError('Failed to analyze video. Please try again.');
            setIsAnalyzing(false);
        }
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;

        const time = videoRef.current.currentTime;

        // Loop logic
        if (isLooping && playbackLoop && isPlaying) {
            if (time >= playbackLoop.end || time < playbackLoop.start) {
                videoRef.current.currentTime = playbackLoop.start;
                setCurrentTime(playbackLoop.start);
                return;
            }
        }

        setCurrentTime(time);
        setCurrentTimeMs(time * 1000);
    };

    const handleLoadedMetadata = () => {
        if (!videoRef.current) return;
        const videoDuration = videoRef.current.duration;
        if (isFinite(videoDuration) && videoDuration > 0) {
            setDuration(videoDuration);
        } else if (session?.duration) {
            setDuration(session.duration);
        }
    };

    const handleLoadedData = () => {
        if (!videoRef.current || duration > 0) return;
        const videoDuration = videoRef.current.duration;
        if (isFinite(videoDuration) && videoDuration > 0) {
            setDuration(videoDuration);
        } else if (session?.duration) {
            setDuration(session.duration);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!videoRef.current) return;
        const time = parseFloat(e.target.value);
        videoRef.current.currentTime = time;
        setCurrentTime(time);
        setCurrentTimeMs(time * 1000);
    };

    const handleDelete = async () => {
        if (!sessionId) return;
        if (confirm('Are you sure you want to delete this session?')) {
            try {
                await storage.deleteSession(sessionId);
                navigate('/history');
            } catch (err) {
                console.error('Failed to delete session:', err);
            }
        }
    };

    const handleDownloadVideo = () => {
        if (!session?.videoUrl) return;
        const a = document.createElement('a');
        a.href = session.videoUrl;
        a.download = `swing-${new Date(session.createdAt).toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleExportSkeleton = async () => {
        if (!videoRef.current || !skeletonCanvasRef.current || !session) return;

        setIsExporting(true);
        setIsPlaying(false);
        const originalViewMode = viewMode;
        const originalLooping = isLooping;
        const originalCurrentTime = videoRef.current.currentTime;

        // Force skeleton view to ensure canvas is rendering
        setViewMode('skeleton');
        setIsLooping(false);

        // Wait for view update
        await new Promise(resolve => setTimeout(resolve, 500));

        try {
            const canvas = skeletonCanvasRef.current;
            const stream = canvas.captureStream(30); // 30 FPS
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });

            const chunks: Blob[] = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `skeleton-${new Date(session.createdAt).toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                // Restore state
                setIsExporting(false);
                setViewMode(originalViewMode);
                setIsLooping(originalLooping);
                if (videoRef.current) videoRef.current.currentTime = originalCurrentTime;
            };

            mediaRecorder.start();

            // Start playback from beginning (or loop start if we want trimmed)
            const start = (playbackLoop && originalLooping) ? playbackLoop.start : 0;
            const end = (playbackLoop && originalLooping) ? playbackLoop.end : duration;

            videoRef.current.currentTime = start;

            await new Promise(resolve => setTimeout(resolve, 200)); // buffer

            videoRef.current.play();

            // Monitor playback
            const checkEnd = setInterval(() => {
                if (!videoRef.current) {
                    clearInterval(checkEnd);
                    mediaRecorder.stop();
                    return;
                }

                const current = videoRef.current.currentTime;
                const progress = ((current - start) / (end - start)) * 100;
                setExportProgress(Math.min(99, Math.max(0, progress)));

                if (current >= end || videoRef.current.ended) {
                    videoRef.current.pause();
                    clearInterval(checkEnd);
                    mediaRecorder.stop();
                }
            }, 100);

        } catch (err) {
            console.error('Export failed:', err);
            alert('Export failed. Browser might not support canvas recording.');
            setIsExporting(false);
            setViewMode(originalViewMode);
            setIsLooping(originalLooping);
        }
    };

    const handleRestart = () => {
        if (!videoRef.current) return;
        const startTime = (isLooping && playbackLoop) ? playbackLoop.start : 0;
        videoRef.current.currentTime = startTime;
        setCurrentTime(startTime);
        setCurrentTimeMs(startTime * 1000);
        setIsPlaying(true);
    };

    const formatTime = (seconds: number) => {
        if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };


    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
                <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (error || !session) {
        return (
            <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
                <p className="text-red-400 mb-4">{error || 'Session not found'}</p>
                <Link to="/" className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold">
                    Back to Home
                </Link>
            </div>
        );
    }

    return (
        <div className="h-screen bg-slate-900 text-white flex flex-col overflow-hidden">
            {/* Header */}
            <header className="flex items-center justify-between p-4 bg-slate-800/50 shrink-0">
                <Link to="/history" className="p-2 hover:bg-slate-700 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </Link>
                <h1 className="text-lg font-semibold">Review Swing</h1>
                <button onClick={handleDelete} className="p-2 hover:bg-red-500/20 rounded-full transition-colors text-red-400">
                    <Trash2 className="w-5 h-5" />
                </button>
            </header>

            {/* Player Area */}
            <div ref={containerRef} className="flex-1 min-h-0 flex items-center justify-center p-2 gap-2">
                {/* Video - Always render to act as master clock, hide when not needed */}
                {session.videoUrl && (
                    <div
                        className={`bg-black flex items-center justify-center h-full rounded-lg overflow-hidden transition-all duration-300 relative
                            ${(viewMode === 'video' || viewMode === 'both') ? '' : 'hidden absolute opacity-0 pointer-events-none'}
                            ${viewMode === 'both' ? 'w-1/2' : 'w-full'}
                        `}
                    >
                        <video
                            ref={videoRef}
                            src={session.videoUrl}
                            className="max-w-full max-h-full object-contain"
                            // style={{ transform: 'scaleX(-1)' }} // Removed as requested
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                            onLoadedData={handleLoadedData}
                            onEnded={() => setIsPlaying(false)}
                            playsInline
                            muted={isMuted}
                        />
                        <VZoneOverlay
                            frames={session.poseFrames || []}
                            width={videoDimensions.width}
                            height={videoDimensions.height}
                            visible={showVZone}
                        />
                    </div>
                )}

                {/* Skeleton */}
                {(viewMode === 'skeleton' || viewMode === 'both') && session.poseFrames && (
                    <div className={`flex items-center justify-center h-full overflow-hidden ${viewMode === 'both' ? 'w-1/2' : 'w-full'}`}>
                        <SkeletonPlayer
                            ref={skeletonCanvasRef}
                            frames={session.poseFrames}
                            currentTime={currentTimeMs}
                            duration={duration * 1000}
                            isPlaying={isPlaying}
                            width={videoDimensions.width || (viewMode === 'both' ? 280 : 300)}
                            height={videoDimensions.height || (viewMode === 'both' ? 350 : 380)}
                        />
                    </div>
                )}
            </div>

            {/* Analysis Overlay */}
            {isAnalyzing && (
                <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center text-white">
                    <Activity className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                    <h3 className="text-xl font-bold mb-2">Analyzing Swing...</h3>
                    <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 transition-all duration-200"
                            style={{ width: `${analysisProgress}%` }}
                        />
                    </div>
                    <p className="mt-4 text-slate-400 text-sm">Detecting pose landmarks</p>
                </div>
            )}

            {/* Export Overlay */}
            {isExporting && (
                <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center text-white">
                    <Activity className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
                    <h3 className="text-xl font-bold mb-2">Exporting Skeleton...</h3>
                    <div className="w-64 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-emerald-500 transition-all duration-200"
                            style={{ width: `${exportProgress}%` }}
                        />
                    </div>
                    <p className="mt-4 text-slate-400 text-sm">Please do not close this window</p>
                </div>
            )}

            {/* Playback Controls */}
            <div className="p-4 bg-slate-800/90 shrink-0">
                {/* Timeline with phase markers */}
                <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm text-slate-400 font-mono w-12">{formatTime(currentTime)}</span>
                    <div className="flex-1 relative">
                        <input
                            type="range"
                            min={0}
                            max={duration || 1}
                            step={0.1}
                            value={currentTime}
                            onChange={handleSeek}
                            className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer
                                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500"
                        />
                    </div>
                    <span className="text-sm text-slate-400 font-mono w-12">{formatTime(duration)}</span>
                </div>

                {/* Buttons Row */}
                <div className="flex items-center justify-center gap-4">
                    <button onClick={handleRestart} className="p-3 hover:bg-slate-700 rounded-full transition-colors">
                        <RotateCcw className="w-6 h-6" />
                    </button>
                    <button onClick={handlePlayPause} className="p-4 bg-emerald-500 hover:bg-emerald-600 rounded-full transition-colors">
                        {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8" />}
                    </button>

                    {/* Volume Control */}
                    <div className="flex items-center gap-2 group">
                        <button onClick={toggleMute} className="p-2 hover:bg-slate-700 rounded-full transition-colors">
                            {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-slate-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
                        </button>
                        <div className="w-0 group-hover:w-20 overflow-hidden transition-all duration-300">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={isMuted ? 0 : volume}
                                onChange={handleVolumeChange}
                                className="w-full h-1 bg-slate-600 rounded-full appearance-none cursor-pointer
                                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 
                                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500"
                            />
                        </div>
                    </div>

                    {/* V-Zone Data Toggle */}
                    <button
                        onClick={() => setShowVZone(!showVZone)}
                        className={`p-2 rounded-lg transition-colors ml-4 ${showVZone ? 'bg-yellow-500/20 text-yellow-500' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                        title="Toggle V-Zone"
                    >
                        <Triangle className="w-5 h-5" />
                    </button>

                    {/* View Mode Buttons */}
                    <div className="flex items-center gap-1 ml-2">
                        <button
                            onClick={() => setViewMode('video')}
                            className={`p-2 rounded-lg transition-colors ${viewMode === 'video' ? 'bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'}`}
                            title="Video only"
                        >
                            <Video className="w-5 h-5" />
                        </button>
                        {!isMobile && (
                            <button
                                onClick={() => setViewMode('both')}
                                className={`p-2 rounded-lg transition-colors ${viewMode === 'both' ? 'bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'}`}
                                title="Both"
                            >
                                <div className="flex gap-0.5">
                                    <Video className="w-3 h-5" />
                                    <Activity className="w-3 h-5" />
                                </div>
                            </button>
                        )}
                        <button
                            onClick={() => setViewMode('skeleton')}
                            className={`p-2 rounded-lg transition-colors ${viewMode === 'skeleton' ? 'bg-emerald-500' : 'bg-slate-700 hover:bg-slate-600'}`}
                            title="Skeleton only"
                        >
                            <Activity className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Session Info & Metrics - Scrollable */}
            <div className="p-4 bg-slate-800 border-t border-slate-700 max-h-48 overflow-y-auto shrink-0">
                <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-slate-700/50 p-2 rounded-lg text-center">
                        <p className="text-xs text-slate-400">Duration</p>
                        <p className="text-sm font-bold text-emerald-400">{formatTime(session.duration)}</p>
                    </div>
                    <div className="bg-slate-700/50 p-2 rounded-lg text-center">
                        <p className="text-xs text-slate-400">Frames</p>
                        <p className="text-sm font-bold text-emerald-400">{session.poseFrames?.length || 0}</p>
                    </div>
                    <div className="bg-slate-700/50 p-2 rounded-lg text-center">
                        <p className="text-xs text-slate-400">FPS</p>
                        <p className="text-sm font-bold text-emerald-400">
                            {session.duration > 0 && session.poseFrames?.length
                                ? Math.round(session.poseFrames.length / session.duration)
                                : '--'}
                        </p>
                    </div>
                </div>

                {/* Swing Metrics */}
                {metrics && (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-700/50 p-2 rounded-lg">
                            <p className="text-xs text-slate-400 mb-1">Spine Angle</p>
                            <div className="flex justify-between text-xs">
                                <span>Address: <span className="text-emerald-400 font-bold">{metrics.spineAngle.address}°</span></span>
                                <span>Change: <span className={`font-bold ${Math.abs(metrics.spineAngle.change) <= 5 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                    {metrics.spineAngle.change > 0 ? '+' : ''}{metrics.spineAngle.change}°
                                </span></span>
                            </div>
                        </div>
                        <div className="bg-slate-700/50 p-2 rounded-lg">
                            <p className="text-xs text-slate-400 mb-1">Head Movement</p>
                            <div className="flex justify-between text-xs">
                                <span>Lateral: <span className={`font-bold ${metrics.headMovement.lateral <= 5 ? 'text-emerald-400' : 'text-yellow-400'}`}>{metrics.headMovement.lateral}cm</span></span>
                                <span>Vertical: <span className={`font-bold ${metrics.headMovement.vertical <= 5 ? 'text-emerald-400' : 'text-yellow-400'}`}>{metrics.headMovement.vertical}cm</span></span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Export Actions */}
                <div className="flex gap-3 mt-4">
                    <button
                        onClick={handleDownloadVideo}
                        className="flex-1 bg-slate-700 hover:bg-slate-600 p-3 rounded-lg flex flex-col items-center gap-1 transition-colors"
                    >
                        <Download className="w-5 h-5 text-blue-400" />
                        <span className="text-xs">Save Video</span>
                    </button>
                    <button
                        onClick={handleExportSkeleton}
                        className="flex-1 bg-slate-700 hover:bg-slate-600 p-3 rounded-lg flex flex-col items-center gap-1 transition-colors"
                    >
                        <Film className="w-5 h-5 text-emerald-400" />
                        <span className="text-xs">Save Skeleton</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReviewPage;
