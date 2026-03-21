import { MockSensorProvider } from '../MockSensorProvider';
import { SensorDataPayload } from '../types';

describe('MockSensorProvider', () => {
  let provider: MockSensorProvider;

  beforeEach(() => {
    provider = new MockSensorProvider();
    jest.useFakeTimers();
  });

  afterEach(() => {
    provider.stop();
    jest.useRealTimers();
  });

  it('can start and stop without errors', async () => {
    await expect(provider.start()).resolves.toBeUndefined();
    provider.stop();
  });

  it('emits payload at configured intervals', async () => {
    const mockCallback = jest.fn();
    provider.subscribe(mockCallback);

    await provider.start({ samplingRateMs: 1000 });

    provider.currentSpeed = 15;
    provider.currentStepsAccumulator = 5;

    // Fast-forward 1 second
    jest.advanceTimersByTime(1000);

    expect(mockCallback).toHaveBeenCalledTimes(1);
    
    const payload = mockCallback.mock.calls[0][0] as SensorDataPayload;
    expect(payload.speed).toBe(15);
    expect(payload.steps).toBe(5);

    // Verify accumulator has been reset
    expect(provider.currentStepsAccumulator).toBe(0);

    // Fast-forward another second (expecting 0 steps this time)
    jest.advanceTimersByTime(1000);
    expect(mockCallback).toHaveBeenCalledTimes(2);
    
    const secondPayload = mockCallback.mock.calls[1][0] as SensorDataPayload;
    expect(secondPayload.steps).toBe(0);
    expect(secondPayload.speed).toBe(15); // Speed persists until physically slowed
  });

  it('allows manual tick firing via simulateTickNow', () => {
    const mockCallback = jest.fn();
    provider.subscribe(mockCallback);

    provider.simulateTickNow({
        steps: 10,
        speed: 1.2,
    });

    expect(mockCallback).toHaveBeenCalledTimes(1);
    const payload = mockCallback.mock.calls[0][0] as SensorDataPayload;
    expect(payload.steps).toBe(10);
    expect(payload.speed).toBe(1.2);
  });
});
