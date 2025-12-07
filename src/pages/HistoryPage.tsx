import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Video, Calendar, ChevronRight } from 'lucide-react';
import { storage } from '../utils/storage';
import type { SessionSummary } from '../types/swing';

const HistoryPage = () => {
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadSessions = async () => {
            try {
                const loadedSessions = await storage.getAllSessions();
                setSessions(loadedSessions);
            } catch (err) {
                console.error('Failed to load sessions:', err);
            } finally {
                setLoading(false);
            }
        };

        loadSessions();
    }, []);

    const formatDate = (date: Date) => {
        return new Date(date).toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
                <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col">
            {/* Header */}
            <header className="flex items-center justify-between p-4 bg-slate-800/50">
                <Link to="/" className="p-2 hover:bg-slate-700 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </Link>
                <h1 className="text-lg font-semibold">Practice History</h1>
                <div className="w-10" />
            </header>

            {/* Content */}
            <main className="flex-1 p-4">
                {sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-16">
                        <Calendar className="w-16 h-16 text-slate-600 mb-4" />
                        <h2 className="text-xl font-semibold text-slate-400 mb-2">No Sessions Yet</h2>
                        <p className="text-slate-500 mb-6">
                            Start practicing to see your history here
                        </p>
                        <Link
                            to="/record"
                            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 rounded-xl font-bold transition-all"
                        >
                            <Video className="w-5 h-5" />
                            Start Practice
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-slate-400 mb-4">{sessions.length} session(s) recorded</p>
                        {sessions.map(session => (
                            <Link
                                key={session.id}
                                to={`/review/${session.id}`}
                                className="flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-slate-700 rounded-lg flex items-center justify-center">
                                        <Video className="w-6 h-6 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="font-semibold">{formatDate(session.createdAt)}</p>
                                        <p className="text-sm text-slate-400">
                                            Duration: {formatDuration(session.duration)}
                                            {session.club && ` • ${session.club}`}
                                        </p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-500" />
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default HistoryPage;
