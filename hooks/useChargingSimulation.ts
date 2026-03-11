import { useEffect, useRef, useState } from 'react';

export type ChargingMode = 'AC' | 'DC' | 'HPC';

export type ChargingState = {
    isActive: boolean;
    isMinimized: boolean;
    mode: ChargingMode;
    batteryLevel: number; // 0-100
    power: number; // kW
    chargedAmount: number; // kWh
    cost: number; // TL
    duration: number; // seconds
    startTime: number | null;
    startedAt: string | null; // ISO string from backend
    startSoc: number | null; // Initial battery level when charging started
    // Estimates for DC
    estTime80: number | null; // minutes remaining to 80%
    estTime100: number | null; // minutes remaining to 100%
    hasError?: boolean;
    isFinishing?: boolean;
};

export const useChargingSimulation = () => {
    const [state, setState] = useState<ChargingState>({
        isActive: false,
        isMinimized: false,
        mode: 'DC', // Type requested in chat for start
        batteryLevel: 23,
        power: 0,
        chargedAmount: 0,
        cost: 0,
        duration: 0,
        startTime: null,
        startedAt: null,
        startSoc: null,
        estTime80: null,
        estTime100: null,
        hasError: false,
        isFinishing: false,
    });

    const timerRef = useRef<any>(null);
    const isLiveFromBackendRef = useRef(false);

    /** Update charging state from backend WebSocket meter values. When power > 0 or session is active, widget is shown. */
    const updateFromMeterValues = (data: {
        batteryLevel?: number;
        soc?: number;
        state_of_charge?: number;
        power?: number;
        power_kw?: number;
        chargedAmount?: number;
        energy_kwh?: number;
        charged_kwh?: number;
        cost?: number;
        duration?: number;
        duration_sec?: number;
        mode?: ChargingMode;
        socket_type?: string; // HPC, DC, AC from backend
        started_at?: string;
        start_soc?: number; // Initial battery level when charging started
        status?: string; // INITIATED, CHARGING, etc. from backend
    }) => {
        const batteryLevel = data.batteryLevel ?? data.soc ?? data.state_of_charge;
        const power = data.power_kw ?? data.power ?? 0;
        const chargedAmount = data.charged_kwh ?? data.chargedAmount ?? data.energy_kwh ?? 0;
        const cost = data.cost;
        const duration = data.duration ?? data.duration_sec;
        // Prefer socket_type from backend, then explicit mode, then power-based heuristic
        const socketType = data.socket_type?.toUpperCase() as ChargingMode | undefined;
        const mode: ChargingMode = socketType && ['HPC', 'DC', 'AC'].includes(socketType)
            ? socketType
            : data.mode ?? (power >= 150 ? 'HPC' : power >= 50 ? 'DC' : 'AC');
        const startedAt = data.started_at;
        const startSoc = data.start_soc ?? null;

        // Consider session active if power > 0, batteryLevel is known, OR status indicates an active session
        const activeStatuses = ['INITIATED', 'CHARGING', 'PREPARING', 'SUSPENDED'];
        const isActiveStatus = data.status ? activeStatuses.includes(data.status.toUpperCase()) : false;
        const hasCharging = power > 0 || (batteryLevel != null && batteryLevel > 0) || isActiveStatus;

        setState(prev => {
            if (prev.isFinishing) {
                console.log("[CHARGING_HOOK] Ignoring update because isFinishing is TRUE");
                // Ignore other updates while waiting to finish to avoid resetting
                return prev;
            }

            if (data.status) {
                const upperStatus = data.status.toUpperCase();
                console.log("[CHARGING_HOOK] Received status:", upperStatus);
                if (upperStatus === 'FINISHING') {
                    console.log("[CHARGING_HOOK] Status is FINISHING! Enabling timeout.");
                    if (timerRef.current) clearInterval(timerRef.current);

                    // Show finishing state for 5.5 seconds before stopping
                    // This gives the widget exactly 5 second visibility + 500ms exit animation timeframe.
                    setTimeout(() => {
                        console.log("[CHARGING_HOOK] 5.5 second timeout elapsed. Calling stopSimulation()");
                        stopSimulation();
                    }, 5500);

                    return {
                        ...prev,
                        isActive: true, // Keep it active to show the finishing UI
                        hasError: false,
                        isFinishing: true
                    };
                }

                if (upperStatus === 'SUSPENDEDEV' || upperStatus === 'SUSPENDEDEVSE' || upperStatus === 'FAULTED') {
                    console.log("[CHARGING_HOOK] Setting hasError due to:", upperStatus);
                    return {
                        ...prev,
                        hasError: true,
                        // Not killing active state immediately so the error modal can render
                    };
                }
            }

            if (hasCharging && !prev.isActive) {
                isLiveFromBackendRef.current = true;
                return {
                    ...prev,
                    isActive: true,
                    isMinimized: true,
                    mode,
                    batteryLevel: batteryLevel ?? prev.batteryLevel,
                    power: power || prev.power,
                    chargedAmount: chargedAmount || prev.chargedAmount,
                    cost: cost ?? prev.cost,
                    duration: duration ?? prev.duration,
                    startTime: prev.startTime ?? Date.now(),
                    startedAt: startedAt ?? prev.startedAt,
                    startSoc: startSoc ?? prev.startSoc,
                    estTime80: null,
                    estTime100: null,
                    hasError: false,
                    isFinishing: false,
                };
            }

            if (hasCharging) {
                return {
                    ...prev,
                    mode,
                    batteryLevel: batteryLevel ?? prev.batteryLevel,
                    power: power || prev.power,
                    chargedAmount: chargedAmount || prev.chargedAmount,
                    cost: cost ?? prev.cost,
                    duration: duration ?? prev.duration,
                    startedAt: startedAt ?? prev.startedAt,
                    startSoc: startSoc ?? prev.startSoc,
                };
            }

            if (!hasCharging && !['SUSPENDEDEV', 'SUSPENDEDEVSE', 'FAULTED', 'FINISHING'].includes(data.status?.toUpperCase() || '')) {
                if (timerRef.current) clearInterval(timerRef.current);
                isLiveFromBackendRef.current = false;
                if (prev.isActive) {
                    return { ...prev, isActive: false, startTime: null, startedAt: null, startSoc: null, hasError: false, isFinishing: false };
                }
            }

            return prev;
        });
    };

    const startSimulation = (mode: ChargingMode = 'DC') => {
        isLiveFromBackendRef.current = false;
        let power = 22;
        if (mode === 'DC') power = 120;
        if (mode === 'HPC') power = 300;

        setState({
            isActive: true,
            isMinimized: true,
            mode,
            batteryLevel: mode === 'AC' ? 0 : 23, // DC/HPC starts at 23%
            power,
            chargedAmount: 0,
            cost: 0,
            duration: 0,
            startTime: Date.now(),
            startedAt: null,
            startSoc: null,
            estTime80: mode !== 'AC' ? 20 : null, // Faster estimates
            estTime100: mode !== 'AC' ? 40 : null,
            isFinishing: false,
        });
    };

    const stopSimulation = () => {
        isLiveFromBackendRef.current = false;
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
        setState(prev => ({ ...prev, isActive: false, startTime: null, startedAt: null, startSoc: null, isFinishing: false }));
    };

    const toggleMinimize = () => {
        setState(prev => ({ ...prev, isMinimized: !prev.isMinimized }));
    };

    const setMinimized = (val: boolean) => {
        setState(prev => ({ ...prev, isMinimized: val }));
    };

    const setMode = (mode: ChargingMode) => {
        let power = 22;
        if (mode === 'DC') power = 120;
        if (mode === 'HPC') power = 300;

        // Only update mode and power, preserving progress
        setState(prev => ({
            ...prev,
            mode,
            power,
            // Keep estimates or recalc simplistically? Keep for now to avoid jump
        }));
    }

    useEffect(() => {
        if (state.isActive) {
            timerRef.current = setInterval(() => {
                setState(prev => {
                    let newLevel = prev.batteryLevel;
                    let newCharged = prev.chargedAmount;
                    let newCost = prev.cost;
                    let newEst80 = prev.estTime80;
                    let newEst100 = prev.estTime100;
                    let newDuration = prev.duration;

                    // Calculate real duration
                    if (prev.startedAt) {
                        const startMs = new Date(prev.startedAt).getTime();
                        newDuration = Math.floor((Date.now() - startMs) / 1000);
                    } else if (prev.startTime) {
                        newDuration = Math.floor((Date.now() - prev.startTime) / 1000);
                    } else {
                        newDuration++;
                    }

                    // Simulation Logic (Only if not from backend)
                    if (!isLiveFromBackendRef.current) {
                        if (prev.mode === 'AC') {
                            newLevel = Math.min(100, prev.batteryLevel + 0.5);
                            newCharged = prev.chargedAmount + (22 / 3600);
                            newCost = prev.cost + ((22 / 3600) * 8.5);
                        } else if (prev.mode === 'DC') {
                            let increment = prev.batteryLevel < 80 ? 1.5 : 0.2;
                            newLevel = Math.min(100, prev.batteryLevel + increment);
                            newCharged = prev.chargedAmount + (120 / 3600);
                            newCost = prev.cost + ((120 / 3600) * 12.0);
                        } else {
                            let increment = prev.batteryLevel < 80 ? 3.0 : 0.5;
                            newLevel = Math.min(100, prev.batteryLevel + increment);
                            newCharged = prev.chargedAmount + (300 / 3600);
                            newCost = prev.cost + ((300 / 3600) * 12.0);
                        }

                        if (prev.mode !== 'AC') {
                            if (newEst80 && newEst80 > 0) newEst80 -= (1 / 60);
                            if (newEst100 && newEst100 > 0) newEst100 -= (1 / 60);
                        }

                        if (newLevel >= 100) {
                            newLevel = 100;
                        }
                    }

                    return {
                        ...prev,
                        batteryLevel: newLevel,
                        chargedAmount: newCharged,
                        cost: newCost,
                        duration: newDuration,
                        estTime80: newEst80,
                        estTime100: newEst100
                    };
                });
            }, 1000);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [state.isActive]);

    return {
        ...state,
        startSimulation,
        stopSimulation,
        toggleMinimize,
        setMinimized,
        setMode,
        updateFromMeterValues,
    };
};
