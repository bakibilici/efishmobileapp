# Atlas Application Technical Schema (AI Context)

This document provides a high-level technical overview of the **Atlas** (internal: `tubitak-app`) mobile application. It is designed to give an AI agent immediate context on the architecture, data flow, and core services.

---

## 🏗️ Core Architecture
- **Framework**: [Expo SDK 54](https://docs.expo.dev/) (React Native 0.81.5)
- **Language**: TypeScript
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based navigation in `app/`)
- **State Management**: React Context API + Custom Service Stores (Zustand-like patterns seen in `services/`)
- **Persistence**: 
  - `expo-sqlite`: Local relational data
  - `@react-native-async-storage/async-storage`: Key-value pairs
  - `expo-secure-store`: Sensitive data (tokens)

---

## 🧭 Navigation & Routes (`app/`)
- **`app/_layout.tsx`**: Root layout managing global providers (Auth, Theme, Sentry).
- **`(tabs)/`**: Main application screens.
  - `mainpage.tsx`: The primary Map-centric interaction hub. Huge file (130KB+) containing map logic, UI overlays, and state integrations.
  - `sessions.tsx`: Displays history of driving/charging sessions.
  - `profile.tsx`: User settings and personalization.
- **`auth/`**: Authentication flow (`register.tsx`).
- **Utility Routes**: `qr-scanner.tsx`, `route-plan.tsx`, `devices.tsx`, `network-logger.tsx`.

---

## 🧠 Core Services & Logic (`services/`)
The app's brain resides in the `services/` directory, focusing on activity classification, session management, and EV integrations.

### 1. Activity Management
- **`ActivityStateMachine.ts`**: A FSM (Finite State Machine) that manages transitions between `IDLE`, `WALKING`, `CAR`, `RUNNING`, and `CHARGING`. It uses debouncing (hysteresis) to prevent state flickering.
- **`ActivityService.ts`**: Orchestrated sensors process raw data and feed it to the State Machine.

### 2. Session Tracking
- **`DriveSessionStore.ts`**: Manages the lifecycle of a driving event (start, end, location tracking, energy usage).
- **`ChargingSessionStore.ts`**: Specifically for EV charging sessions.
- **`driveSessionHistory.ts`**: Handles retrieval and storage of past sessions in SQLite.

### 3. Mapping & Routing (AI-Driven Drawing)
- **Hybrid Drawing Logic**:
  - **Stage 1 (Logical Rota)**: Backend (Electrip/HERE) generates EV-specific routing (charging stops, SOC calculations). AI triggers this via `create_route_plan`.
  - **Stage 2 (High-Fidelity Snapping)**: After logic is received, **`GoogleMapsService.ts`** fetches road-snapped polylines using Google Directions API to ensure precise map rendering.
- **`routePlanGateway.ts`**: Interface for complex route planning logic.
- **`routePersonalization.ts`**: Adapts routes based on user behavior or EV needs.

### 4. Communication & AI
- **`SocketService.ts`**: Real-time updates via Socket.io.
- **`api.ts`**: Axios-based API client for REST endpoints.
- **LiveKit**: Used for real-time voice/video streaming (`@livekit/react-native`).
- **ElevenLabs Integration**: 
  - **Agentic AI**: Not just TTS, but a conversational agent with **Tool Calling** capabilities.
  - **Client Tools**: The primary tool is `create_route_plan`, which allows the AI to autonomously update the map and navigation based on voice intent.
  - **State Feedback**: Triggers UI states like `PLANNING_ROUTE` (plays hold sound/haptics) while backend logic is executing.

---

## 🛠️ AI Infrastructure Replacement Requirements
To replace ElevenLabs with a custom infrastructure, the new system MUST support:
1.  **Intent Extraction**: Convert voice/text to structured tool calls (e.g., `create_route_plan(destination)`).
2.  **Context Injection**: Ingest `Dynamic Variables` (Username, SOC, Current Location, Interests) at session startup.
3.  **JSON Data Contract**: Return a standardized route object containing `locations` (departure, stops, destination), `summary`, and `waypoints`.
4.  **Low Latency Streaming**: Support real-time audio playback while the app handles background map operations.

---

## 🧪 Simulation Engine (`services/simulation/`)
A critical part of the developer workflow for testing logic without physical movement.
- **`runSimulation.ts`**: Allows developers to simulate movement (walking, driving, charging) in the simulator.
- **CLI Scripts**: `npm run sim:car`, `npm run sim:walk`, `npm run sim:charge`.

---

## 📡 Sensors & Data (`services/sensors/`)
- Uses `expo-sensors` (Accelerometer, Gyroscope) and `expo-location`.
- **`ActivityClassifier`**: Processes raw sensor data to suggest a high-level activity state to the FSM.
- **`ActivityPipeline`**: Connects sensors to the Classifier and FSM.

---

## 🛠️ Key Dependencies
- **UI**: `react-native-reanimated`, `lottie-react-native`, `@gorhom/bottom-sheet`, `iconsax-react-native`.
- **Maps**: `react-native-maps`, `react-native-google-places-autocomplete`.
- **AI/Voice**: `@elevenlabs/react-native`, `@react-native-voice/voice`.

---

## 🔄 Data Flow Summary (Voice-to-Map)
1.  **Trigger**: `ActivityStateMachine` detects `CAR` mode -> starts Session.
2.  **Voice Input**: User requests a destination -> AI interprets Intent.
3.  **Action**: AI calls `create_route_plan` tool -> App plays "Planning" audio/haptics.
4.  **Processing**: App fetches Electrip Logic -> Background Google Snap -> Updates `DriveSessionStore`.
5.  **UI Sync**: `mainpage.tsx` re-renders, draws the Polyline, zooms (Auto-fit) to the route, and the AI confirms the plan.
