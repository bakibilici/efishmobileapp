import { io, Socket } from "socket.io-client";
import { DriveSessionStore } from "./DriveSessionStore";

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || "https://api.efish.com"; // Placeholder

class SocketService {
  private socket: Socket | null = null;
  private userId: string | null = null;

  public connect(userId: string) {
    if (this.socket?.connected && this.userId === userId) return;

    this.userId = userId;
    this.socket = io(SOCKET_URL, {
      transports: ["websocket"],
      query: { userId },
    });

    this.socket.on("connect", () => {
      console.log("[SocketService] Connected to backend");
    });

    this.socket.on("disconnect", () => {
      console.log("[SocketService] Disconnected");
    });

    // Listen for route planning outcomes from Atlas tool calls
    this.socket.on("route", (data: { 
      routeId: string; 
      polyline: string; 
      summary: { duration: number; distance: number };
      steps: any[];
    }) => {
      console.log("[SocketService] Received route plan:", data.routeId);
      DriveSessionStore.updateRouteFromSocket(data);
    });

    this.socket.on("route_start", (data: { routeId: string }) => {
      console.log("[SocketService] Navigation started for route:", data.routeId);
      DriveSessionStore.startNavigation();
    });

    this.socket.on("error", (err) => {
      console.error("[SocketService] Socket error:", err);
    });
  }

  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.userId = null;
    }
  }

  public isConnected() {
    return this.socket?.connected || false;
  }
}

export const socketService = new SocketService();
