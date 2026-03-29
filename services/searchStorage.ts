import * as SQLite from "expo-sqlite";

const DB_NAME = "recent_searches.db";
const MAX_SEARCHES = 5;

export interface RecentSearch {
  id: number;
  query: string;
  timestamp: number;
}

class SearchStorageImpl {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      this.db = await SQLite.openDatabaseAsync(DB_NAME);
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS recent_searches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT UNIQUE,
          timestamp INTEGER
        );
      `);
      this.isInitialized = true;
      console.log("[SearchStorage] Initialized");
    } catch (error) {
      console.error("[SearchStorage] Init error:", error);
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
      }, 50);
    });
  }

  public async getRecentSearches(): Promise<string[]> {
    if (!this.isInitialized) await this.waitForInit();
    if (!this.db) return [];

    try {
      const rows = await this.db.getAllAsync<RecentSearch>(
        "SELECT query FROM recent_searches ORDER BY timestamp DESC LIMIT ?",
        [MAX_SEARCHES]
      );
      return rows.map((r) => r.query);
    } catch (error) {
      console.error("[SearchStorage] Get error:", error);
      return [];
    }
  }

  public async addRecentSearch(query: string) {
    if (!query || query.trim().length === 0) return;
    if (!this.isInitialized) await this.waitForInit();
    if (!this.db) return;

    const trimmedQuery = query.trim();

    try {
      // 1. Insert or Replace (to update timestamp)
      await this.db.runAsync(
        "INSERT OR REPLACE INTO recent_searches (query, timestamp) VALUES (?, ?)",
        [trimmedQuery, Date.now()]
      );

      // 2. Keep only top 5 by deleting older ones if necessary
      // A simple way is to delete anything not in the top 5
      await this.db.runAsync(`
        DELETE FROM recent_searches 
        WHERE id NOT IN (
          SELECT id FROM recent_searches 
          ORDER BY timestamp DESC 
          LIMIT ?
        )
      `, [MAX_SEARCHES]);
      
      console.debug(`[SearchStorage] Added: ${trimmedQuery}`);
    } catch (error) {
      console.error("[SearchStorage] Add error:", error);
    }
  }

  public async removeRecentSearch(query: string) {
    if (!this.isInitialized) await this.waitForInit();
    if (!this.db) return;

    try {
      await this.db.runAsync("DELETE FROM recent_searches WHERE query = ?", [query]);
      console.debug(`[SearchStorage] Removed: ${query}`);
    } catch (error) {
      console.error("[SearchStorage] Remove error:", error);
    }
  }
}

export const SearchStorage = new SearchStorageImpl();
