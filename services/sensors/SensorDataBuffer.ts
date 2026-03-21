import { SensorDataPayload } from './types';

/**
 * A memory-efficient, pre-allocated circular buffer designed to hold time-series sensor data.
 * Adheres to continuous sliding window constraints by keeping recent data based on a retention period.
 */
export class SensorDataBuffer {
  private buffer: SensorDataPayload[];
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;
  
  private readonly capacity: number;
  private readonly retentionMs: number;

  /**
   * @param retentionSeconds How many seconds of history to keep (default: 15)
   * @param maxExpectedHz Expected max sample rate per second to pre-allocate memory (default: 20Hz)
   */
  constructor(retentionSeconds: number = 15, maxExpectedHz: number = 20) {
    this.retentionMs = retentionSeconds * 1000;
    // Pre-allocate array capacity based on worst-case sampling rate + 50% safety margin
    this.capacity = Math.ceil(retentionSeconds * maxExpectedHz * 1.5);
    this.buffer = new Array<SensorDataPayload>(this.capacity);
  }

  /**
   * Adds a new data point to the buffer. O(1) time complexity.
   * Evicts any data older than the retention period.
   * 
   * Thread-safety in JS/TS: Since JS is single-threaded, synchronous mutations 
   * are inherently race-condition free. No locks are needed.
   */
  public add(dataPoint: SensorDataPayload): void {
    // Write new data point
    this.buffer[this.tail] = dataPoint;
    this.tail = (this.tail + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Buffer overflow: we circled around and are overwriting the oldest (head) element.
      // Move head forward by 1.
      this.head = (this.head + 1) % this.capacity;
      console.warn(`[SensorDataBuffer] Reached max capacity of ${this.capacity}. Buffer overflowed, consider increasing maxExpectedHz.`);
    }

    // Pass the timestamp to evictOldData so we can prune based on the freshest data time
    const latestTime = dataPoint.timestamp;
    this.evictOldData(latestTime);
  }

  /**
   * Retrieves data points from the last `seconds`. O(N) where N is current count.
   */
  public getLast(seconds: number): SensorDataPayload[] {
    const cutoffTime = Date.now() - (seconds * 1000);
    return this.getSince(cutoffTime);
  }

  /**
   * Returns all valid data currently retained in the buffer (up to max retention time).
   */
  public getAll(): SensorDataPayload[] {
    const cutoffTime = Date.now() - this.retentionMs;
    return this.getSince(cutoffTime);
  }

  /**
   * Moves the head pointer forward to "evict" stale data. O(1) amortized.
   */
  private evictOldData(latestTime: number): void {
    const cutoffTime = latestTime - this.retentionMs;

    // Keep evicting from the head while the oldest item is before our cutoff time.
    while (this.count > 0) {
      const oldestItem = this.buffer[this.head];
      
      if (oldestItem && oldestItem.timestamp < cutoffTime) {
        // Discarding obsolete reference to allow garbage collection
        this.buffer[this.head] = undefined as any;
        this.head = (this.head + 1) % this.capacity;
        this.count--;
      } else {
        // Since sequence is chronologically ordered, if the oldest is valid, the rest are too.
        break;
      }
    }
  }

  /**
   * Helper that traverses the circular array and collects items newer than cutoff.
   */
  private getSince(cutoffTime: number): SensorDataPayload[] {
    const result: SensorDataPayload[] = [];
    let currentIdx = this.head;
    let itemsToRead = this.count;

    while (itemsToRead > 0) {
      const item = this.buffer[currentIdx];
      if (item && item.timestamp >= cutoffTime) {
        result.push(item);
      }
      currentIdx = (currentIdx + 1) % this.capacity;
      itemsToRead--;
    }

    return result;
  }
}
