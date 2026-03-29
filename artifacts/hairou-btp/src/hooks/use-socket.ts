import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";

let sharedSocket: Socket | null = null;

export function useSocket() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) return;

    if (!sharedSocket || !sharedSocket.connected) {
      sharedSocket = io(import.meta.env.VITE_API_URL ?? "", {
        path: "/api/socket.io",
        transports: ["websocket", "polling"],
      });
    }

    const socket = sharedSocket;
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join", user.id.toString());
    });

    if (socket.connected) {
      socket.emit("join", user.id.toString());
    }

    const onRefreshProjects = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    };
    const onRefreshTasks = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    };
    const onRefreshNotifications = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    };
    const onRefreshUsers = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    };
    const onRefreshPointage = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pointage"] });
    };
    const onRefreshMessages = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    };
    const onNotification = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    };

    socket.on("refresh:projects", onRefreshProjects);
    socket.on("refresh:tasks", onRefreshTasks);
    socket.on("refresh:notifications", onRefreshNotifications);
    socket.on("refresh:users", onRefreshUsers);
    socket.on("refresh:pointage", onRefreshPointage);
    socket.on("refresh:messages", onRefreshMessages);
    socket.on("notification", onNotification);

    return () => {
      socket.off("refresh:projects", onRefreshProjects);
      socket.off("refresh:tasks", onRefreshTasks);
      socket.off("refresh:notifications", onRefreshNotifications);
      socket.off("refresh:users", onRefreshUsers);
      socket.off("refresh:pointage", onRefreshPointage);
      socket.off("refresh:messages", onRefreshMessages);
      socket.off("notification", onNotification);
    };
  }, [user, queryClient]);

  return socketRef.current;
}
