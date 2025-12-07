import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Trash2, RotateCcw, Video, Activity } from 'lucide-react';
import { storage } from '../utils/storage';
import { analyzeSwing } from '../utils/metrics';
import { SkeletonPlayer } from '../components/SkeletonPlayer';
import type { SwingSession, SwingMetrics } from '../types/swing';

type ViewMode = 'video' | 'skeleton' | 'both';

const ReviewPage = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<number | null>(null);

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

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

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

                setSession(loadedSession);

                if (loadedSession.poseFrames && loadedSession.poseFrames.length > 0) {
                    const calculatedMetrics = analyzeSwing(loadedSession.poseFrames);
                    setMetrics(calculatedMetrics);
                }

                setLoading(false);
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

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        setCurrentTime(videoRef.current.currentTime);
        setCurrentTimeMs(videoRef.current.currentTime * 1000);
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

    const handleRestart = () => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = 0;
        setCurrentTime(0);
        setCurrentTimeMs(0);
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
                        className={`bg-black flex items-center justify-center h-full rounded-lg overflow-hidden transition-all duration-300 
                            ${(viewMode === 'video' || viewMode === 'both') ? '' : 'hidden absolute opacity-0 pointer-events-none'}
                            ${viewMode === 'both' ? 'w-1/2' : 'w-full'}
                        `}
                    >
                        <video
                            ref={videoRef}
                            src={session.videoUrl}
                            className="max-w-full max-h-full object-contain"
                            style={{ transform: 'scaleX(-1)' }}
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                            onLoadedData={handleLoadedData}
                            onEnded={() => setIsPlaying(false)}
                            playsInline
                        />
                    </div>
                )}

                {/* Skeleton */}
                {(viewMode === 'skeleton' || viewMode === 'both') && session.poseFrames && (
                    <div className={`flex items-center justify-center h-full overflow-hidden ${viewMode === 'both' ? 'w-1/2' : 'w-full'}`}>
                        <SkeletonPlayer
                            frames={session.poseFrames}
                            currentTime={currentTimeMs}
                            duration={duration * 1000}
                            isPlaying={isPlaying}
                            width={viewMode === 'both' ? 280 : 300}
                            height={viewMode === 'both' ? 350 : 380}
                            showTrajectory={true}
                        />
                    </div>
                )}
            </div>

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
            </div>
        </div>
    );
};

export default ReviewPage;
