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

const rightRotate = (value: number, amount: number) =>
  (value >>> amount) | (value << (32 - amount));

const sha256Ascii = (ascii: string) => {
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate += 1) {
    if (!isComposite[candidate]) {
      for (let multiple = 0; multiple < 313; multiple += candidate) {
        isComposite[multiple] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter += 1;
    }
  }

  const asciiWithPadding = `${ascii}\x80`;
  for (let i = 0; i < asciiWithPadding.length; i += 1) {
    const code = asciiWithPadding.charCodeAt(i);
    words[i >> 2] |= code << (((3 - i) % 4) * 8);
  }

  words[((asciiWithPadding.length + 8) >> 6) * 16 + 15] = asciiBitLength;

  for (let blockStart = 0; blockStart < words.length; blockStart += 16) {
    const w = words.slice(blockStart, blockStart + 16);
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i += 1) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }

    for (let i = 0; i < 8; i += 1) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  return hash
    .map((value) => {
      const hex = (value >>> 0).toString(16);
      return hex.padStart(8, "0");
    })
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
      this.isInitialized = true;
      console.log("[LocalUserStorage] Initialized");
    } catch (error) {
      console.error("[LocalUserStorage] Init error:", error);
    }
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

  public async clearCurrentUserId() {
    await SecureStore.deleteItemAsync(CURRENT_USER_ID_KEY);
  }

  public async getCurrentUser() {
    const storedUserId = await SecureStore.getItemAsync(CURRENT_USER_ID_KEY);
    if (!storedUserId) return null;

    const userId = Number(storedUserId);
    if (Number.isNaN(userId)) return null;
    return this.getUserById(userId);
  }
}

export const LocalUserStorage = new LocalUserStorageImpl();
