import * as SQLite from "expo-sqlite";

const RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // routes are kept for 12 months
const COORD_KEYS = new Set(["latitude", "longitude", "lat", "lng", "lon"]);

/**
 * Two decimals (~1 km) for every stored coordinate — origin, destination,
 * stops, waypoints. Long point arrays (the drawn route shape) are kept as they
 * are so a saved session can still be redrawn; they describe a road, not a
 * person's position.
 */
export function roundCoordinatesForStorage<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.length > 50 ? v : v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, inner] of Object.entries(v as Record<string, unknown>)) {
        if (COORD_KEYS.has(k) && typeof inner === "number") out[k] = Math.round(inner * 100) / 100;
        else if (COORD_KEYS.has(k) && typeof inner === "string" && inner.trim() !== "" && !isNaN(Number(inner)))
          out[k] = (Math.round(Number(inner) * 100) / 100).toFixed(2);
        else out[k] = walk(inner);
      }
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

const DB_NAME = "atlas_drive_sessions.db";

export interface DriveSessionSnapshotInput {
  userId: number;
  sessionId: string;
  title: string;
  originName?: string | null;
  destinationName?: string | null;
  state: string;
  startedAt: number;
  updatedAt?: number;
  endedAt?: number | null;
  durationSeconds?: number | null;
  distanceKm?: number | null;
  stationCount?: number | null;
  routeContext: Record<string, any>;
}

interface DriveSessionRow {
  id: number;
  user_id: number;
  session_id: string;
  title: string | null;
  origin_name: string | null;
  destination_name: string | null;
  state: string;
  started_at: number;
  updated_at: number;
  ended_at: number | null;
  duration_seconds: number | null;
  distance_km: number | null;
  station_count: number | null;
  route_context_json: string;
}

export interface StoredDriveSessionRecord {
  id: number;
  userId: number;
  sessionId: string;
  title: string;
  originName: string | null;
  destinationName: string | null;
  state: string;
  startedAt: number;
  updatedAt: number;
  endedAt: number | null;
  durationSeconds: number | null;
  distanceKm: number | null;
  stationCount: number | null;
  routeContext: Record<string, any>;
}

class DriveSessionHistoryStorageImpl {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;
  private hasInitFinished = false;

  constructor() {
    void this.init();
  }

  private async init() {
    try {
      this.db = await SQLite.openDatabaseAsync(DB_NAME);
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS drive_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 0,
          session_id TEXT NOT NULL UNIQUE,
          title TEXT,
          origin_name TEXT,
          destination_name TEXT,
          state TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          ended_at INTEGER,
          duration_seconds INTEGER,
          distance_km REAL,
          station_count INTEGER,
          route_context_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_drive_sessions_updated_at
          ON drive_sessions(updated_at DESC);
      `);
      await this.db.execAsync(`
        ALTER TABLE drive_sessions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
      `).catch(() => {
        // Column already exists.
      });
      await this.db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_drive_sessions_user_updated
          ON drive_sessions(user_id, updated_at DESC);
      `);
      const purged = await this.purgeExpired();
      if (purged) console.log(`[driveSessionHistory] purged ${purged} session(s) older than 12 months`);
      this.isInitialized = true;
      console.log("[DriveSessionHistoryStorage] Initialized");
    } catch (error) {
      console.error("[DriveSessionHistoryStorage] Init error:", error);
    } finally {
      this.hasInitFinished = true;
    }
  }

  private async waitForInit() {
    if (this.isInitialized || this.hasInitFinished) return;
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this.isInitialized || this.hasInitFinished) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  }

  private hydrateRow(row: DriveSessionRow): StoredDriveSessionRecord | null {
    try {
      return {
        id: row.id,
        userId: row.user_id,
        sessionId: row.session_id,
        title: row.title || "Kaydedilen rota",
        originName: row.origin_name,
        destinationName: row.destination_name,
        state: row.state,
        startedAt: row.started_at,
        updatedAt: row.updated_at,
        endedAt: row.ended_at,
        durationSeconds: row.duration_seconds,
        distanceKm: row.distance_km,
        stationCount: row.station_count,
        routeContext: JSON.parse(row.route_context_json),
      };
    } catch (error) {
      console.error(
        "[DriveSessionHistoryStorage] Failed to hydrate session row:",
        error,
      );
      return null;
    }
  }

  public async upsertSession(snapshot: DriveSessionSnapshotInput) {
    if (!this.isInitialized) await this.waitForInit();
    if (!this.db) return;

    const updatedAt = snapshot.updatedAt ?? Date.now();
    const title =
      snapshot.title?.trim() ||
      snapshot.destinationName?.trim() ||
      "Kaydedilen rota";

    try {
      await this.db.runAsync(
        `
          INSERT INTO drive_sessions (
            user_id,
            session_id,
            title,
            origin_name,
            destination_name,
            state,
            started_at,
            updated_at,
            ended_at,
            duration_seconds,
            distance_km,
            station_count,
            route_context_json
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(session_id) DO UPDATE SET
            user_id = excluded.user_id,
            title = excluded.title,
            origin_name = excluded.origin_name,
            destination_name = excluded.destination_name,
            state = excluded.state,
            started_at = excluded.started_at,
            updated_at = excluded.updated_at,
            ended_at = excluded.ended_at,
            duration_seconds = excluded.duration_seconds,
            distance_km = excluded.distance_km,
            station_count = excluded.station_count,
            route_context_json = excluded.route_context_json
        `,
        [
          snapshot.userId,
          snapshot.sessionId,
          title,
          snapshot.originName ?? null,
          snapshot.destinationName ?? null,
          snapshot.state,
          snapshot.startedAt,
          updatedAt,
          snapshot.endedAt ?? null,
          snapshot.durationSeconds ?? null,
          snapshot.distanceKm ?? null,
          snapshot.stationCount ?? null,
          JSON.stringify(roundCoordinatesForStorage(snapshot.routeContext)),
        ],
      );
    } catch (error) {
      console.error("[DriveSessionHistoryStorage] Upsert error:", error);
    }
  }

  /** Retention: rows older than 12 months are removed at start-up (KVKK m.7). */
  public async purgeExpired(): Promise<number> {
    if (!this.db) return 0;
    const result = await this.db.runAsync("DELETE FROM drive_sessions WHERE started_at < ?", [Date.now() - RETENTION_MS]);
    return result.changes ?? 0;
  }

  public async deleteSessionsForUser(userId: number): Promise<void> {
    if (!this.db) return;
    await this.db.runAsync("DELETE FROM drive_sessions WHERE user_id = ?", [userId]);
  }

  public async listSessions(
    userId: number,
  ): Promise<StoredDriveSessionRecord[]> {
    if (!this.isInitialized) await this.waitForInit();
    if (!this.db) return [];

    try {
      const rows = await this.db.getAllAsync<DriveSessionRow>(
        `
          SELECT *
          FROM drive_sessions
          WHERE user_id = ?
          ORDER BY updated_at DESC
        `,
        [userId],
      );

      return rows
        .map((row) => this.hydrateRow(row))
        .filter((row): row is StoredDriveSessionRecord => row !== null);
    } catch (error) {
      console.error("[DriveSessionHistoryStorage] List error:", error);
      return [];
    }
  }

  public async getSessionBySessionId(
    sessionId: string,
    userId: number,
  ): Promise<StoredDriveSessionRecord | null> {
    if (!this.isInitialized) await this.waitForInit();
    if (!this.db) return null;

    try {
      const row = await this.db.getFirstAsync<DriveSessionRow>(
        `
          SELECT *
          FROM drive_sessions
          WHERE session_id = ? AND user_id = ?
          LIMIT 1
        `,
        [sessionId, userId],
      );
      if (!row) return null;
      return this.hydrateRow(row);
    } catch (error) {
      console.error("[DriveSessionHistoryStorage] Get error:", error);
      return null;
    }
  }
}

export const DriveSessionHistoryStorage = new DriveSessionHistoryStorageImpl();
