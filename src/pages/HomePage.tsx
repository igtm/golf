import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Video, History, Target, Upload } from 'lucide-react';
import { storage } from '../utils/storage';

const HomePage = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setIsImporting(true);
            const sessionId = storage.generateId();

            // Generate basic session
            const newSession = {
                id: sessionId,
                createdAt: new Date(),
                duration: 0, // Will be updated in ReviewPage
                videoBlob: file,
                poseFrames: [], // Empty, triggers analysis in ReviewPage
                notes: 'Imported Video',
                cameraAngle: 'side' as const // Default
            };

            await storage.saveSession(newSession);
            navigate(`/review/${sessionId}`);
        } catch (err) {
            console.error('Failed to import video:', err);
            alert('Failed to import video');
            setIsImporting(false);
        }
    };
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 text-white">
            {/* Header */}
            <header className="p-6 text-center">
                <h1 className="text-4xl font-bold text-emerald-400 mb-2">Golf AI</h1>
                <p className="text-slate-400">Solo Practice Assistant</p>
            </header>

            {/* Main Content */}
            <main className="flex flex-col items-center justify-center px-6 py-12 gap-8">
                {/* Hero Section */}
                <div className="text-center mb-8">
                    <Target className="w-24 h-24 mx-auto text-emerald-400 mb-4" />
                    <h2 className="text-2xl font-semibold mb-2">Improve Your Swing</h2>
                    <p className="text-slate-400 max-w-xs mx-auto">
                        AI-powered analysis to help you practice alone and track your progress
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="w-full max-w-xs space-y-4">
                    <Link
                        to="/record"
                        className="flex items-center justify-center gap-3 w-full py-4 px-6 bg-emerald-500 hover:bg-emerald-600 rounded-2xl font-bold text-lg transition-all shadow-lg shadow-emerald-500/30"
                    >
                        <Video className="w-6 h-6" />
                        Start Practice
                    </Link>

                    <Link
                        to="/history"
                        className="flex items-center justify-center gap-3 w-full py-4 px-6 bg-slate-700 hover:bg-slate-600 rounded-2xl font-semibold transition-all"
                    >
                        <History className="w-6 h-6" />
                        View History
                    </Link>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-700"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-slate-900 text-slate-500">OR</span>
                        </div>
                    </div>

                    <button
                        onClick={handleImportClick}
                        disabled={isImporting}
                        className="flex items-center justify-center gap-3 w-full py-4 px-6 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-2xl font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-400"
                    >
                        {isImporting ? (
                            <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Upload className="w-6 h-6" />
                        )}
                        Import Video
                    </button>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handleFileSelect}
                    />
                </div>

                {/* Stats Preview (placeholder) */}
                <div className="w-full max-w-xs mt-8 p-4 bg-slate-800/50 rounded-2xl">
                    <h3 className="text-sm text-slate-400 mb-3">Recent Activity</h3>
                    <p className="text-slate-500 text-center py-4">
                        No practice sessions yet.
                        <br />
                        <span className="text-emerald-400">Start your first session!</span>
                    </p>
                </div>
            </main>
        </div>
    );
};

export default HomePage;
