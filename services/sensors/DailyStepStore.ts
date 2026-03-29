import type { SQLiteDatabase as ExpoSQLiteDatabase } from "expo-sqlite";
import { ActivityState } from "../ActivityStateMachine";

const isSimulation = () =>
  process.env.IS_SIMULATION === "true" ||
  process.env.NODE_ENV === "test" ||
  (typeof process !== "undefined" && process.release?.name === "node");

export interface DailyStepData {
  date: string; // YYYY-MM-DD
  totalSteps: number;
  rawSteps: number;
  walkingSteps: number;
  runningSteps: number;
  chargingSteps: number;
  lastUpdatedAt: number;
}

class DailyStepStoreImpl {
  private db: ExpoSQLiteDatabase | null = null;

  private currentData: DailyStepData | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  /**
   * Binds to AppState for persistence on background.
   */
  public bindAppState(AppState: any) {
    if (!AppState || isSimulation()) return;
    AppState.addEventListener("change", (nextStatus: string) => {
      if (nextStatus === "background" || nextStatus === "inactive") {
        this.persistImmediately();
      }
    });
  }

  private async init() {
    if (isSimulation()) {
      this.currentData = {
        date: this.getTodayDateString(),
        totalSteps: 0,
        rawSteps: 0,
        walkingSteps: 0,
        runningSteps: 0,
        chargingSteps: 0,
        lastUpdatedAt: Date.now(),
      };
      this.isInitialized = true;
      return;
    }

    try {
      const { openDatabaseAsync } = await import("expo-sqlite");
      const db = await openDatabaseAsync("steps.db");
      this.db = db;

      // 1. Create table if not exists
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS daily_steps (
          date TEXT PRIMARY KEY,
          totalSteps INTEGER DEFAULT 0,
          rawSteps INTEGER DEFAULT 0,
          walkingSteps INTEGER DEFAULT 0,
          chargingSteps INTEGER DEFAULT 0,
          lastUpdatedAt INTEGER
        );
      `);

      // 1a. Migration: Ensure rawSteps exists for older schemas
      try {
        // We catch errors here because SQLite will fail if the column already exists
        await db.execAsync(
          "ALTER TABLE daily_steps ADD COLUMN rawSteps INTEGER DEFAULT 0;",
        );
        console.log("[DailyStepStore] Migration: Added rawSteps column");
      } catch {
        // Column likely exists already, that's fine
      }

      // 1b. Migration: Ensure runningSteps exists
      try {
        await db.execAsync(
          "ALTER TABLE daily_steps ADD COLUMN runningSteps INTEGER DEFAULT 0;",
        );
        console.log("[DailyStepStore] Migration: Added runningSteps column");
      } catch {
        // Column likely exists already
      }

      // 2. Load today's data
      const today = this.getTodayDateString();
      await this.loadDay(today);

      this.isInitialized = true;
      console.log(`[DailyStepStore] Initialized for ${today}`);
    } catch (error) {
      console.error("[DailyStepStore] Init error:", error);
    }
  }

  private getTodayDateString(): string {
    return new Date().toISOString().split("T")[0];
  }

  private async loadDay(date: string) {
    if (!this.db) return;

    try {
      const row = await this.db.getFirstAsync<DailyStepData>(
        "SELECT * FROM daily_steps WHERE date = ?",
        [date],
      );

      if (row) {
        this.currentData = row;
      } else {
        // Create new record for today
        this.currentData = {
          date,
          totalSteps: 0,
          rawSteps: 0,
          walkingSteps: 0,
          runningSteps: 0,
          chargingSteps: 0,
          lastUpdatedAt: Date.now(),
        };
        await this.persistImmediately();
      }
    } catch (error) {
      console.error("[DailyStepStore] LoadDay error:", error);
    }
  }

  public async getToday(): Promise<DailyStepData | null> {
    if (!this.isInitialized) await this.waitForInit();
    return this.currentData;
  }

  public async incrementSteps(
    count: number,
    isCharging: boolean,
    activityState?: ActivityState,
  ) {
    if (!this.isInitialized) await this.waitForInit();
    if (!this.currentData) return;

    // Day change check
    const today = this.getTodayDateString();
    if (this.currentData.date !== today) {
      await this.persistImmediately();
      await this.loadDay(today);
      if (!this.currentData) return;
    }

    // Apply multiplier logic
    // StepStore already handles effective steps calculation, but here we track them per category.
    // Requirement says: "walkingSteps", "chargingSteps".
    if (isCharging) {
      this.currentData.chargingSteps += count * 2;
    } else if (activityState === ActivityState.RUNNING) {
      this.currentData.runningSteps += count;
    } else {
      this.currentData.walkingSteps += count;
    }

    this.currentData.rawSteps += count;
    this.currentData.totalSteps =
      this.currentData.walkingSteps +
      this.currentData.runningSteps +
      this.currentData.chargingSteps;
    this.currentData.lastUpdatedAt = Date.now();

    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.saveTimeout) return;

    this.saveTimeout = setTimeout(async () => {
      await this.persistImmediately();
      this.saveTimeout = null;
    }, 10000); // 10s auto-save
  }

  public async persistImmediately() {
    if (!this.db || !this.currentData) return;

    const {
      date,
      totalSteps,
      rawSteps,
      walkingSteps,
      runningSteps,
      chargingSteps,
      lastUpdatedAt,
    } = this.currentData;

    try {
      await this.db.runAsync(
        `INSERT OR REPLACE INTO daily_steps (date, totalSteps, rawSteps, walkingSteps, runningSteps, chargingSteps, lastUpdatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          date,
          totalSteps,
          rawSteps,
          walkingSteps,
          runningSteps,
          chargingSteps,
          lastUpdatedAt,
        ],
      );
      //console.debug(`[DailyStepStore] Persisted ${date}: ${totalSteps} steps`);
    } catch (error) {
      console.error("[DailyStepStore] Persist error:", error);
    }
  }

  private async waitForInit() {
    if (this.isInitialized) return;
    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this.isInitialized) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }

  /** Force reset for current date (debug/session start) */
  public async resetForNewDay() {
    if (!this.db || !this.currentData) return;

    this.currentData = {
      ...this.currentData,
      totalSteps: 0,
      rawSteps: 0,
      walkingSteps: 0,
      runningSteps: 0,
      chargingSteps: 0,
      lastUpdatedAt: Date.now(),
    };
    await this.persistImmediately();
  }
}

export const DailyStepStore = new DailyStepStoreImpl();
