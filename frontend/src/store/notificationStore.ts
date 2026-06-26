import { create } from "zustand";

export interface ToastNotification {
  id: string;
  type: "success" | "info" | "warning" | "error";
  title: string;
  message: string;
  duration?: number;
}

interface NotificationState {
  notifications: ToastNotification[];
  addNotification: (notification: Omit<ToastNotification, "id">) => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  addNotification: (notification) => {
    const id = Math.random().toString(36).substring(2, 9);
    const item = { ...notification, id };
    set((state) => ({ notifications: [...state.notifications, item] }));
    
    const timeout = notification.duration !== 0 ? (notification.duration || 4500) : 0;
    if (timeout > 0) {
      setTimeout(() => {
        set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }));
      }, timeout);
    }
  },
  removeNotification: (id) => {
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }));
  },
}));
