import Dexie, { type EntityTable } from 'dexie';
import type { SwingSession, SessionSummary } from '../types/swing';

// Define database schema
const db = new Dexie('GolfSwingDB') as Dexie & {
    sessions: EntityTable<SwingSession, 'id'>;
};

db.version(1).stores({
    sessions: 'id, createdAt, club',
});

export const storage = {
    // Save a new session
    async saveSession(session: SwingSession): Promise<string> {
        await db.sessions.put(session);
        return session.id;
    },

    // Get a single session by ID
    async getSession(id: string): Promise<SwingSession | undefined> {
        return db.sessions.get(id);
    },

    // Get all sessions (summaries only for list view)
    async getAllSessions(): Promise<SessionSummary[]> {
        const sessions = await db.sessions
            .orderBy('createdAt')
            .reverse()
            .toArray();

        return sessions.map(s => ({
            id: s.id,
            createdAt: s.createdAt,
            duration: s.duration,
            club: s.club,
            thumbnailUrl: s.videoUrl,
        }));
    },

    // Delete a session
    async deleteSession(id: string): Promise<void> {
        const session = await db.sessions.get(id);
        if (session?.videoUrl) {
            URL.revokeObjectURL(session.videoUrl);
        }
        await db.sessions.delete(id);
    },

    // Update session (e.g., add notes, metrics)
    async updateSession(id: string, updates: Partial<SwingSession>): Promise<void> {
        await db.sessions.update(id, updates);
    },

    // Create object URL for video blob
    createVideoUrl(blob: Blob): string {
        return URL.createObjectURL(blob);
    },

    // Generate unique ID
    generateId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
};

export { db };
