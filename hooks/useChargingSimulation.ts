import { useEffect, useRef, useState } from 'react';

export type ChargingMode = 'AC' | 'DC' | 'HPC';

// Backend-aligned status enum. FINISHED is kept as a synonym of COMPLETED for
// backward compatibility with older consumers; new code should use COMPLETED.
export type ChargeSessionStatus =
    | 'INITIATING'
    | 'INITIATED'
    | 'PREPARING'
    | 'CHARGING'
    | 'STOPPING'
    | 'FINISHING'   // StopTransaction received, free-park grace period active
    | 'PARKING'     // grace period expired, paid parking accruing
    | 'COMPLETED'   // cable unplugged, invoices created
    | 'FAILED'      // start/remote-stop error path
    | 'FINISHED'    // legacy alias of COMPLETED
    | 'DISMISSING';

export type ParkingTariff = {
    price: number;       // TL per minute
    max_price?: number;  // TL cap
};

export type ParkingSessionInfo = {
    uuid: string;
    started_at: string;     // ISO timestamp when grace expired
    price: number;          // TL per minute
    max_price?: number;     // TL cap
    ended_at?: string;
    total_price?: number;   // final fee (in session_ended)
    end_reason?: string;    // USER_STOPPED | MAX_REACHED
};

export type InvoiceRef = { type: 'CHARGING' | 'PARKING'; id: number };

export type ChargeSessionPayload = {
    charge_session_uuid?: string;
    price?: number;
    start_meter?: number;
    total_energy?: number;
    total_price?: number;
    power?: number;
    status?: string;
    started_at?: string;
    ended_at?: string | null;
    stop_reason?: string;
    is_active?: boolean;
    start_type?: string;
    socket_type?: string;
    start_soc?: number | null;
    vehicle?: {
        plate_number?: string;
        name?: string;
        battery_capacity?: number;
        model?: string;
        brand?: string;
    } | null;
    socket?: {
        code?: string;
        no?: number;
        power?: number;
        connector_type?: string;
    } | null;
    charge_point?: {
        name?: string;
        cpid?: string;
    } | null;
    charge_area?: {
        uuid?: string;
        name?: string;
        address?: string;
        lat?: number;
        lng?: number;
    } | null;
};

export type ChargingState = {
    isActive: boolean;
    isMinimized: boolean;
    isFinishing: boolean;
    isDismissing: boolean;
    mode: ChargingMode;
    sessionStatus: ChargeSessionStatus | null;
    chargeSessionData: ChargeSessionPayload | null;
    isStarting?: boolean;
    batteryLevel: number | null; // 0-100
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

    // ── FINISHING phase (free-park grace) ──
    endedAt: string | null;                     // ISO; when StopTransaction landed
    endMeter: number | null;                    // final meter (kWh)
    freeParkDurationMinutes: number | null;     // grace window length
    parkingTariff: ParkingTariff | null;        // null => free park indefinitely

    // ── PARKING phase (paid parking) ──
    parkingSession: ParkingSessionInfo | null;

    // ── COMPLETED / FAILED ──
    invoicesCreated: InvoiceRef[];
    endReason: string | null;
    isFailed: boolean;
};

export const useChargingSimulation = () => {
    const [state, setState] = useState<ChargingState>({
        isActive: false,
        isMinimized: false,
        mode: 'DC',
        sessionStatus: null,
        chargeSessionData: null,
        isStarting: false,
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
        isDismissing: false,
        endedAt: null,
        endMeter: null,
        freeParkDurationMinutes: null,
        parkingTariff: null,
        parkingSession: null,
        invoicesCreated: [],
        endReason: null,
        isFailed: false,
    });

    const timerRef = useRef<any>(null);
    const isLiveFromBackendRef = useRef(false);
    const stoppingAtRef = useRef<number | null>(null);

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
        status?: string; // INITIATING, INITIATED, CHARGING, STOPPING, FINISHED etc. from backend
        chargeSessionData?: ChargeSessionPayload; // Full session payload
    }) => {
        // Set stoppingAtRef immediately synchronously upon receive, outside React state dispatch!
        // This prevents race conditions where FINISHED closely follows STOPPING
        if (data.status?.toUpperCase() === 'STOPPING' && !stoppingAtRef.current) {
            stoppingAtRef.current = Date.now();
        }

        const batteryLevel = data.batteryLevel ?? data.soc ?? data.state_of_charge;
        const power = data.power_kw ?? data.power ?? 0;
        const chargedAmount = data.charged_kwh ?? data.chargedAmount ?? data.energy_kwh ?? 0;
        const cost = data.cost;
        const duration = data.duration ?? data.duration_sec;
        const resolvedDuration = (duration != null && duration > 0) ? duration : undefined;
        // Mode is authoritative from backend (socket.power_type → socket_type),
        // or explicit `mode`. We deliberately DO NOT fall back to a power-based
        // heuristic anymore — meter_value_update frames don't carry power_type,
        // and the heuristic flipped AC/DC mid-session as power changed.
        // When neither is provided we keep prev.mode (handled below).
        const socketType = data.socket_type?.toUpperCase() as ChargingMode | undefined;
        const incomingMode: ChargingMode | undefined =
            socketType && ['HPC', 'DC', 'AC'].includes(socketType)
                ? socketType
                : data.mode;
        const startedAt = data.started_at;
        const startSoc = data.start_soc ?? null;

        // Consider session active if power > 0, batteryLevel is known, OR status indicates an active session
        const activeStatuses = ['INITIATING', 'INITIATED', 'PREPARING', 'CHARGING', 'STOPPING', 'FINISHED'];
        const isActiveStatus = data.status ? activeStatuses.includes(data.status.toUpperCase()) : false;
        const hasCharging = power > 0 || (batteryLevel != null && batteryLevel > 0) || isActiveStatus;

        setState(prev => {
            const upperStatus = data.status?.toUpperCase();

            // 1. Handle transitions to FINISHED (always check 2s protection if stoppingAtRef is set)
            if (upperStatus === 'FINISHED') {
                if (stoppingAtRef.current) {
                    const elapsed = Date.now() - stoppingAtRef.current;
                    if (elapsed < 2000) {
                        const delay = 2000 - elapsed;
                        console.log(`[CHARGING_HOOK] Delaying FINISHED by ${delay}ms to guarantee 2s STOPPING display`);
                        setTimeout(() => {
                            updateFromMeterValues(data);
                        }, delay);
                        return prev; // Return current state (likely STOPPING) to keep the UI fixed
                    }
                }
                
                console.log("[CHARGING_HOOK] Transitioning to FINISHED view");
                stoppingAtRef.current = null;
                if (timerRef.current) clearInterval(timerRef.current);
                return {
                    ...prev,
                    isActive: true,
                    isFinishing: false,
                    isStarting: false,
                    isDismissing: false,
                    sessionStatus: 'FINISHED' as ChargeSessionStatus,
                    chargeSessionData: data.chargeSessionData ?? prev.chargeSessionData,
                    // Update final values from FINISHED payload
                    chargedAmount: chargedAmount || prev.chargedAmount,
                    cost: data.chargeSessionData?.total_price ?? cost ?? prev.cost,
                    power: 0,
                    hasError: false,
                };
            }

            // 2. Protect the "Stopping" UI from other updates (WebSocket CHARGING msg etc.)
            if (prev.isFinishing) {
                console.log("[CHARGING_HOOK] Ignoring status update during 'Stopping' phase (status:", upperStatus, ")");
                return prev;
            }

            // If we have an error, ONLY allow the STOPPING/FINISHED status to pass through
            if (prev.hasError && upperStatus !== 'STOPPING' && upperStatus !== 'FINISHED') {
                console.log("[CHARGING_HOOK] Ignoring update because hasError is TRUE");
                return prev;
            }

            if (data.status) {
                console.log("[CHARGING_HOOK] Received status:", upperStatus);

                // INITIATING / INITIATED / PREPARING → Show starting animation
                if (upperStatus === 'INITIATING' || upperStatus === 'INITIATED' || upperStatus === 'PREPARING') {
                    console.log("[CHARGING_HOOK] Status is", upperStatus, "→ showing starting UI");
                    isLiveFromBackendRef.current = true;
                    return {
                        ...prev,
                        isActive: true,
                        isMinimized: true,
                        isStarting: true,
                        isFinishing: false,
                        isDismissing: false,
                        sessionStatus: upperStatus as ChargeSessionStatus,
                        chargeSessionData: data.chargeSessionData ?? prev.chargeSessionData,
                        mode: incomingMode ?? prev.mode,
                        startedAt: startedAt ?? prev.startedAt,
                        startSoc: startSoc ?? prev.startSoc,
                        startTime: prev.startTime ?? Date.now(),
                        hasError: false,
                    };
                }

                // CHARGING → Live data mode
                if (upperStatus === 'CHARGING') {
                    console.log("[CHARGING_HOOK] Status is CHARGING → live data mode");
                    isLiveFromBackendRef.current = true;
                    return {
                        ...prev,
                        isActive: true,
                        isMinimized: prev.isStarting ? true : prev.isMinimized, // Keep minimized if was starting
                        isStarting: false,
                        isFinishing: false,
                        isDismissing: false,
                        sessionStatus: 'CHARGING' as ChargeSessionStatus,
                        chargeSessionData: data.chargeSessionData ?? prev.chargeSessionData,
                        mode: incomingMode ?? prev.mode,
                        batteryLevel: batteryLevel ?? prev.batteryLevel,
                        power: power || prev.power,
                        chargedAmount: chargedAmount || prev.chargedAmount,
                        cost: cost ?? prev.cost,
                        duration: resolvedDuration ?? prev.duration,
                        startedAt: startedAt ?? prev.startedAt,
                        startSoc: startSoc ?? prev.startSoc,
                        startTime: prev.startTime ?? Date.now(),
                        hasError: false,
                    };
                }

                if (upperStatus === 'STOPPING') {
                    // Prevent regression if we're already FINISHED (Completed)
                    if (prev.sessionStatus === 'FINISHED') {
                        console.log("[CHARGING_HOOK] Ignoring STOPPING because session is already FINISHED");
                        return prev;
                    }
                    console.log("[CHARGING_HOOK] Status is STOPPING → showing finishing UI");
                    if (timerRef.current) clearInterval(timerRef.current);
                    return {
                        ...prev,
                        isActive: true,
                        isStarting: false,
                        isFinishing: true,
                        isDismissing: false,
                        sessionStatus: 'STOPPING' as ChargeSessionStatus,
                        hasError: prev.hasError,
                    };
                }

                // FINISHED → Charge complete, cable still plugged (Handled above in consolidated logic)
                if (upperStatus === 'FINISHED') {
                    return prev;
                }

                // Legacy: FINISHING (synthetic status from old flow)
                if (upperStatus === 'FINISHING') {
                    // Prevent regression if we're already FINISHED (Completed)
                    if (prev.sessionStatus === 'FINISHED') {
                        console.log("[CHARGING_HOOK] Ignoring FINISHING because session is already FINISHED");
                        return prev;
                    }
                    console.log("[CHARGING_HOOK] Status is FINISHING! Waiting for socket update.");
                    if (timerRef.current) clearInterval(timerRef.current);

                    return {
                        ...prev,
                        isActive: true,
                        hasError: prev.hasError,
                        isStarting: false,
                        isFinishing: true,
                        isDismissing: false,
                    };
                }

                if (upperStatus === 'SUSPENDEDEV' || upperStatus === 'SUSPENDEDEVSE' || upperStatus === 'FAULTED') {
                    console.log("[CHARGING_HOOK] Setting hasError due to:", upperStatus);
                    return {
                        ...prev,
                        hasError: true,
                    };
                }
            }

            if (hasCharging && !prev.isActive) {
                isLiveFromBackendRef.current = true;
                return {
                    ...prev,
                    isActive: true,
                    isMinimized: true,
                    mode: incomingMode ?? prev.mode,
                    sessionStatus: (upperStatus as ChargeSessionStatus) ?? prev.sessionStatus,
                    chargeSessionData: data.chargeSessionData ?? prev.chargeSessionData,
                    isStarting: false,
                    isFinishing: false,
                    isDismissing: false,
                    batteryLevel: batteryLevel ?? prev.batteryLevel,
                    power: power || prev.power,
                    chargedAmount: chargedAmount || prev.chargedAmount,
                    cost: cost ?? prev.cost,
                    duration: resolvedDuration ?? prev.duration,
                    startTime: prev.startTime ?? Date.now(),
                    startedAt: startedAt ?? prev.startedAt,
                    startSoc: startSoc ?? prev.startSoc,
                    estTime80: null,
                    estTime100: null,
                    hasError: false,
                };
            }

            if (hasCharging) {
                return {
                    ...prev,
                    mode: incomingMode ?? prev.mode,
                    sessionStatus: (upperStatus as ChargeSessionStatus) ?? prev.sessionStatus,
                    chargeSessionData: data.chargeSessionData ?? prev.chargeSessionData,
                    batteryLevel: batteryLevel ?? prev.batteryLevel,
                    power: power || prev.power,
                    chargedAmount: chargedAmount || prev.chargedAmount,
                    cost: cost ?? prev.cost,
                    duration: resolvedDuration ?? prev.duration,
                    startedAt: startedAt ?? prev.startedAt,
                    startSoc: startSoc ?? prev.startSoc,
                };
            }

            if (!hasCharging && !['SUSPENDEDEV', 'SUSPENDEDEVSE', 'FAULTED', 'FINISHING', 'STOPPING', 'FINISHED'].includes(data.status?.toUpperCase() || '')) {
                if (timerRef.current) clearInterval(timerRef.current);
                isLiveFromBackendRef.current = false;
                if (prev.isActive) {
                    return { ...prev, isActive: false, startTime: null, startedAt: null, startSoc: null, hasError: false, isFinishing: false, isStarting: false, isDismissing: false, sessionStatus: null, chargeSessionData: null };
                }
            }

            return prev;
        });
    };

    /**
     * Normalise an incoming socket.power_type string into our ChargingMode
     * enum. Returns undefined if the input isn't a recognised variant so
     * callers can fall back to `prev.mode`.
     */
    const parseChargingMode = (raw?: string | null): ChargingMode | undefined => {
        const norm = raw?.toUpperCase();
        return norm === 'AC' || norm === 'DC' || norm === 'HPC' ? norm : undefined;
    };

    /**
     * Compute the charging duration in seconds. Prefers an explicit backend
     * `duration`, else derives from started_at → ended_at, else 0.
     */
    const computeChargingDurationSec = (
        explicit?: number | null,
        startedAt?: string | null,
        endedAt?: string | null,
        prev?: number,
    ): number => {
        if (explicit != null && Number.isFinite(explicit)) return Math.floor(Number(explicit));
        if (startedAt && endedAt) {
            const s = new Date(startedAt).getTime();
            const e = new Date(endedAt).getTime();
            if (Number.isFinite(s) && Number.isFinite(e) && e > s) return Math.floor((e - s) / 1000);
        }
        return prev ?? 0;
    };

    /**
     * Apply a FINISHING-phase payload (StopTransaction received, free-park grace started).
     * Source: session_status_update with status=FINISHING OR charge_session_detail snapshot
     * with status=FINISHING.
     *
     * Hydrates the bottom card (Enerji / Ücret / Süre) from the snapshot so a
     * reconnect during FINISHING/PARKING shows real values instead of zeros.
     */
    const applyFinishingPhase = (payload: {
        status?: string;
        ended_at?: string | null;
        end_meter?: number | null;
        total_energy?: number | null;
        free_park_duration_minutes?: number | null;
        parking_tariff?: ParkingTariff | null;
        // charging-side hydration (so the bottom card is correct on reconnect)
        started_at?: string | null;
        duration?: number | null;
        total_price?: number | null;
        // Backend-authoritative charging type (AC/DC/HPC). Without this the
        // mode badge can be wrong on reconnect because the only other source
        // (the power-based heuristic) was removed.
        socket_type?: string | null;
        chargeSessionData?: ChargeSessionPayload;
    }) => {
        isLiveFromBackendRef.current = true;
        if (timerRef.current) clearInterval(timerRef.current);
        stoppingAtRef.current = null;
        const newMode = parseChargingMode(payload.socket_type);
        setState(prev => {
            const newDuration = computeChargingDurationSec(
                payload.duration,
                payload.started_at ?? prev.startedAt,
                payload.ended_at ?? prev.endedAt,
                prev.duration,
            );
            return {
                ...prev,
                isActive: true,
                isStarting: false,
                isFinishing: false,
                isDismissing: false,
                sessionStatus: 'FINISHING',
                mode: newMode ?? prev.mode,
                endedAt: payload.ended_at ?? prev.endedAt,
                endMeter: payload.end_meter != null ? Number(payload.end_meter) : prev.endMeter,
                chargedAmount: payload.total_energy != null ? Number(payload.total_energy) : prev.chargedAmount,
                cost: payload.total_price != null ? Number(payload.total_price) : prev.cost,
                duration: newDuration,
                startedAt: payload.started_at ?? prev.startedAt,
                freeParkDurationMinutes: payload.free_park_duration_minutes ?? prev.freeParkDurationMinutes,
                parkingTariff: payload.parking_tariff ?? prev.parkingTariff,
                chargeSessionData: payload.chargeSessionData ?? prev.chargeSessionData,
                power: 0,
                hasError: false,
            };
        });
    };

    /**
     * Apply a PARKING-phase payload (grace expired, paid parking accruing).
     * Hydrates the bottom card from the snapshot in the same way as FINISHING.
     */
    const applyParkingPhase = (payload: {
        status?: string;
        ended_at?: string | null;
        parking_session?: ParkingSessionInfo | null;
        // charging-side hydration
        total_energy?: number | null;
        started_at?: string | null;
        duration?: number | null;
        total_price?: number | null;
        socket_type?: string | null;
        chargeSessionData?: ChargeSessionPayload;
    }) => {
        isLiveFromBackendRef.current = true;
        if (timerRef.current) clearInterval(timerRef.current);
        const newMode = parseChargingMode(payload.socket_type);
        setState(prev => {
            const newDuration = computeChargingDurationSec(
                payload.duration,
                payload.started_at ?? prev.startedAt,
                payload.ended_at ?? prev.endedAt,
                prev.duration,
            );
            return {
                ...prev,
                isActive: true,
                isStarting: false,
                isFinishing: false,
                isDismissing: false,
                sessionStatus: 'PARKING',
                mode: newMode ?? prev.mode,
                endedAt: payload.ended_at ?? prev.endedAt,
                parkingSession: payload.parking_session ?? prev.parkingSession,
                chargedAmount: payload.total_energy != null ? Number(payload.total_energy) : prev.chargedAmount,
                cost: payload.total_price != null ? Number(payload.total_price) : prev.cost,
                duration: newDuration,
                startedAt: payload.started_at ?? prev.startedAt,
                chargeSessionData: payload.chargeSessionData ?? prev.chargeSessionData,
                power: 0,
                hasError: false,
            };
        });
    };

    /**
     * Apply a terminal session_ended payload (COMPLETED or FAILED).
     * After this fires the server closes the WS with 4410 — caller must not reconnect.
     */
    const applySessionEnded = (payload: {
        status?: string;
        ended_at?: string | null;
        total_energy?: number | null;
        parking_session?: ParkingSessionInfo | null;
        invoices_created?: InvoiceRef[];
        end_reason?: string;
        chargeSessionData?: ChargeSessionPayload;
    }) => {
        const upper = payload.status?.toUpperCase();
        const isFailed = upper === 'FAILED';
        if (timerRef.current) clearInterval(timerRef.current);
        stoppingAtRef.current = null;
        isLiveFromBackendRef.current = true;
        setState(prev => ({
            ...prev,
            isActive: true,
            isStarting: false,
            isFinishing: false,
            isDismissing: false,
            sessionStatus: isFailed ? 'FAILED' : 'COMPLETED',
            chargeSessionData: payload.chargeSessionData ?? prev.chargeSessionData,
            chargedAmount: payload.total_energy != null ? Number(payload.total_energy) : prev.chargedAmount,
            parkingSession: payload.parking_session ?? prev.parkingSession,
            invoicesCreated: payload.invoices_created ?? prev.invoicesCreated,
            endReason: payload.end_reason ?? prev.endReason,
            endedAt: payload.ended_at ?? prev.endedAt,
            cost: payload.parking_session?.total_price != null
                ? Number(payload.parking_session.total_price) + prev.cost
                : prev.cost,
            power: 0,
            isFailed,
            hasError: isFailed,
        }));
    };

    /** Called when socket_status_update → Available is received. Closes all charging UI. */
    const handleSessionComplete = (withAnimation = false) => {
        console.log("[CHARGING_HOOK] handleSessionComplete → Socket Available, closing UI");
        isLiveFromBackendRef.current = false;
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }

        const reset = (prev: ChargingState): ChargingState => ({
            ...prev,
            isActive: false,
            isMinimized: false,
            sessionStatus: null,
            chargeSessionData: null,
            power: 0,
            batteryLevel: null,
            chargedAmount: 0,
            duration: 0,
            cost: 0,
            isStarting: false,
            isFinishing: false,
            isDismissing: false,
            startTime: null,
            startedAt: null,
            startSoc: null,
            hasError: false,
            endedAt: null,
            endMeter: null,
            freeParkDurationMinutes: null,
            parkingTariff: null,
            parkingSession: null,
            invoicesCreated: [],
            endReason: null,
            isFailed: false,
        });

        if (withAnimation) {
            setState(prev => ({
                ...prev,
                isDismissing: true,
                sessionStatus: 'DISMISSING',
            }));
            setTimeout(() => {
                setState(reset);
                stoppingAtRef.current = null;
            }, 3500); // Wait 3.5s for the green animation to finish
        } else {
            setState(reset);
            stoppingAtRef.current = null;
        }
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
            sessionStatus: 'INITIATING',
            chargeSessionData: null,
            isStarting: true,
            batteryLevel: mode === 'AC' ? 0 : 23,
            power,
            chargedAmount: 0,
            cost: 0,
            duration: 0,
            startTime: Date.now(),
            startedAt: null,
            startSoc: null,
            estTime80: mode !== 'AC' ? 20 : null,
            estTime100: mode !== 'AC' ? 40 : null,
            isFinishing: false,
            isDismissing: false,
            hasError: false,
            endedAt: null,
            endMeter: null,
            freeParkDurationMinutes: null,
            parkingTariff: null,
            parkingSession: null,
            invoicesCreated: [],
            endReason: null,
            isFailed: false,
        });
    };

    const stopSimulation = () => {
        isLiveFromBackendRef.current = false;
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }
        // Do not reset hasError so error modal persists until specifically dismissed
        setState(prev => ({ ...prev, isActive: false, startTime: null, startedAt: null, startSoc: null, isFinishing: false, isStarting: false, isDismissing: false, sessionStatus: null, chargeSessionData: null }));
    };

    const clearError = () => {
        setState(prev => ({ ...prev, hasError: false }));
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

        setState(prev => ({
            ...prev,
            mode,
            power,
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

                    // Charging duration is FROZEN once charging is done.
                    // FINISHING / PARKING / COMPLETED / FAILED already carry the
                    // final duration from the backend snapshot — keep it as-is.
                    const isPostCharging =
                        prev.sessionStatus === 'FINISHING' ||
                        prev.sessionStatus === 'PARKING' ||
                        prev.sessionStatus === 'COMPLETED' ||
                        prev.sessionStatus === 'FAILED' ||
                        prev.sessionStatus === 'FINISHED';

                    if (isPostCharging) {
                        // Keep duration frozen, return early — nothing else to tick here.
                        return prev;
                    }

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
                        const currentLevel = prev.batteryLevel ?? 0;
                        if (prev.mode === 'AC') {
                            newLevel = Math.min(100, currentLevel + 0.5);
                            newCharged = prev.chargedAmount + (22 / 3600);
                            newCost = prev.cost + ((22 / 3600) * 8.5);
                        } else if (prev.mode === 'DC') {
                            let increment = currentLevel < 80 ? 1.5 : 0.2;
                            newLevel = Math.min(100, currentLevel + increment);
                            newCharged = prev.chargedAmount + (120 * increment / 100);
                            newCost = prev.cost + ((120 / 3600) * 12.0);
                        } else {
                            let increment = currentLevel < 80 ? 3.0 : 0.5;
                            newLevel = Math.min(100, currentLevel + increment);
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
        clearError,
        handleSessionComplete,
        applyFinishingPhase,
        applyParkingPhase,
        applySessionEnded,
    };
};
