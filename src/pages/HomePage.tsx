import { Link } from 'react-router-dom';
import { Video, History, Target } from 'lucide-react';

const HomePage = () => {
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
