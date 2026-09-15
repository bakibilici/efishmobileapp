import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";

const DB_NAME = "demo_users.db";
const CURRENT_USER_ID_KEY = "demo_current_user_id";

export interface DemoUserProfile {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_code: string;
  phone_number: string;
  phone_last_four: string;
  /** SHA-256 of the normalised phone; stable per person and per device, unlike the row id. */
  phone_hash: string;
  interests: string[];
  created_at: number;
  updated_at: number;
}

interface UserRow {
  id: number;
  first_name: string;
  last_name: string;
  phone_code: string;
  phone_hash: string;
  phone_last_four: string;
  interests_json: string;
  created_at: number;
  updated_at: number;
}

interface MetaRow {
  value: string;
}

interface CreateUserInput {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  phoneCode?: string;
  interests: string[];
}

interface UpdateUserInput {
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  phoneCode?: string;
  interests?: string[];
}

const PHONE_HASH_VERSION = "v2";

const SHA256_INITIAL = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
];

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rightRotate = (value: number, amount: number) =>
  (value >>> amount) | (value << (32 - amount));

const sha256Ascii = (input: string) => {
  const bytes = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    bytes[i] = input.charCodeAt(i);
  }

  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 2 ** 32), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let [h0, h1, h2, h3, h4, h5, h6, h7] = SHA256_INITIAL;
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      words[i] = view.getUint32(offset + i * 4, false);
    }

    for (let i = 16; i < 64; i += 1) {
      const s0 =
        rightRotate(words[i - 15], 7) ^
        rightRotate(words[i - 15], 18) ^
        (words[i - 15] >>> 3);
      const s1 =
        rightRotate(words[i - 2], 17) ^
        rightRotate(words[i - 2], 19) ^
        (words[i - 2] >>> 10);
      words[i] =
        (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 =
        rightRotate(e, 6) ^
        rightRotate(e, 11) ^
        rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + words[i]) >>> 0;
      const s0 =
        rightRotate(a, 2) ^
        rightRotate(a, 13) ^
        rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
};

class LocalUserStorageImpl {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;

  constructor() {
    void this.init();
  }

  private async init() {
    try {
      this.db = await SQLite.openDatabaseAsync(DB_NAME);
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          phone_code TEXT NOT NULL,
          phone_hash TEXT NOT NULL UNIQUE,
          phone_last_four TEXT NOT NULL,
          interests_json TEXT NOT NULL DEFAULT '[]',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS local_meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      await this.ensureHashVersion();
      this.isInitialized = true;
      console.log("[LocalUserStorage] Initialized");
    } catch (error) {
      console.error("[LocalUserStorage] Init error:", error);
    }
  }

  private async ensureHashVersion() {
    if (!this.db) return;

    const versionRow = await this.db.getFirstAsync<MetaRow>(
      "SELECT value FROM local_meta WHERE key = ? LIMIT 1",
      ["phone_hash_version"],
    );

    if (versionRow?.value === PHONE_HASH_VERSION) {
      return;
    }

    // The old demo hash implementation produced collisions, so previous
    // records cannot be trusted. Reset the demo users table once.
    await this.db.execAsync("DELETE FROM users;");
    await this.db.runAsync(
      `
        INSERT INTO local_meta (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
      ["phone_hash_version", PHONE_HASH_VERSION],
    );
    await this.clearCurrentUserId();
  }

  private async waitForInit() {
    if (this.isInitialized) return;
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this.isInitialized) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  }

  private normalizePhoneNumber(phoneNumber: string, phoneCode = "90") {
    return `${phoneCode.replace(/\D/g, "")}${phoneNumber.replace(/\D/g, "")}`;
  }

  private getPhoneLastFour(phoneNumber: string) {
    const digits = phoneNumber.replace(/\D/g, "");
    return digits.slice(-4).padStart(4, "0");
  }

  private maskPhoneNumber(phoneCode: string, lastFour: string) {
    return `+${phoneCode} ••• ••• ${lastFour}`;
  }

  private hydrateUser(row: UserRow): DemoUserProfile {
    return {
      id: row.id,
      username: `demo_user_${row.id}`,
      email: "",
      first_name: row.first_name,
      last_name: row.last_name,
      phone_code: row.phone_code,
      phone_number: this.maskPhoneNumber(row.phone_code, row.phone_last_four),
      phone_last_four: row.phone_last_four,
      phone_hash: row.phone_hash,
      interests: JSON.parse(row.interests_json || "[]"),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  public async getUserById(userId: number) {
    if (!this.isInitialized) await this.waitForInit();
    if (!this.db) return null;

    const row = await this.db.getFirstAsync<UserRow>(
      "SELECT * FROM users WHERE id = ? LIMIT 1",
      [userId],
    );
    return row ? this.hydrateUser(row) : null;
  }

  public async getUserByPhone(phoneNumber: string, phoneCode = "90") {
    if (!this.isInitialized) await this.waitForInit();
    if (!this.db) return null;

    const normalizedPhone = this.normalizePhoneNumber(phoneNumber, phoneCode);
    const phoneHash = sha256Ascii(normalizedPhone);
    const row = await this.db.getFirstAsync<UserRow>(
      "SELECT * FROM users WHERE phone_hash = ? LIMIT 1",
      [phoneHash],
    );
    return row ? this.hydrateUser(row) : null;
  }

  public async createUser(input: CreateUserInput) {
    if (!this.isInitialized) await this.waitForInit();
    if (!this.db) return null;

    const normalizedPhone = this.normalizePhoneNumber(
      input.phoneNumber,
      input.phoneCode || "90",
    );
    const phoneHash = sha256Ascii(normalizedPhone);
    const phoneLastFour = this.getPhoneLastFour(input.phoneNumber);
    const now = Date.now();

    await this.db.runAsync(
      `
        INSERT INTO users (
          first_name,
          last_name,
          phone_code,
          phone_hash,
          phone_last_four,
          interests_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.firstName.trim(),
        input.lastName.trim(),
        (input.phoneCode || "90").replace(/\D/g, ""),
        phoneHash,
        phoneLastFour,
        JSON.stringify(input.interests),
        now,
        now,
      ],
    );

    const createdUser = await this.getUserByPhone(
      input.phoneNumber,
      input.phoneCode || "90",
    );
    if (createdUser) {
      await this.setCurrentUserId(createdUser.id);
    }
    return createdUser;
  }

  public async updateUser(userId: number, input: UpdateUserInput) {
    if (!this.isInitialized) await this.waitForInit();
    if (!this.db) return null;

    const current = await this.getUserById(userId);
    if (!current) return null;

    const nextPhoneCode = (input.phoneCode || current.phone_code).replace(
      /\D/g,
      "",
    );
    const nextLastFour = input.phoneNumber
      ? this.getPhoneLastFour(input.phoneNumber)
      : current.phone_last_four;
    const nextPhoneHash = input.phoneNumber
      ? sha256Ascii(
          this.normalizePhoneNumber(input.phoneNumber, nextPhoneCode),
        )
      : null;

    await this.db.runAsync(
      `
        UPDATE users
        SET
          first_name = ?,
          last_name = ?,
          phone_code = ?,
          phone_hash = COALESCE(?, phone_hash),
          phone_last_four = ?,
          interests_json = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        input.firstName.trim(),
        input.lastName.trim(),
        nextPhoneCode,
        nextPhoneHash,
        nextLastFour,
        JSON.stringify(input.interests ?? current.interests),
        Date.now(),
        userId,
      ],
    );

    return this.getUserById(userId);
  }

  public async setCurrentUserId(userId: number) {
    await SecureStore.setItemAsync(CURRENT_USER_ID_KEY, String(userId));
  }

  public async getCurrentUserId() {
    const storedUserId = await SecureStore.getItemAsync(CURRENT_USER_ID_KEY);
    if (!storedUserId) return null;

    const userId = Number(storedUserId);
    if (Number.isNaN(userId)) {
      await this.clearCurrentUserId();
      return null;
    }

    return userId;
  }

  public async clearCurrentUserId() {
    await SecureStore.deleteItemAsync(CURRENT_USER_ID_KEY);
  }

  public async getCurrentUser() {
    const userId = await this.getCurrentUserId();
    if (userId == null) return null;

    const user = await this.getUserById(userId);
    if (!user) {
      await this.clearCurrentUserId();
      return null;
    }

    return user;
  }
}

export const LocalUserStorage = new LocalUserStorageImpl();
