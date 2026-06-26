import React from "react";
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from "lucide-react";
import { useNotificationStore } from "../store/notificationStore";

const iconMap = {
  success: <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />,
  info: <Info className="h-4.5 w-4.5 text-blue-500" />,
  warning: <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />,
  error: <XCircle className="h-4.5 w-4.5 text-red-500" />
};

const borderMap = {
  success: "border-emerald-500/20 bg-emerald-500/5",
  info: "border-blue-500/20 bg-blue-500/5",
  warning: "border-amber-500/20 bg-amber-500/5",
  error: "border-red-500/20 bg-red-500/5"
};

export const NotificationToast: React.FC = () => {
  const { notifications, removeNotification } = useNotificationStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-3.5 max-w-sm w-full pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`pointer-events-auto p-4 rounded-xl border glass-panel shadow-2xl flex items-start space-x-3 slide-in-right ${borderMap[n.type]}`}
        >
          <div className="flex-shrink-0 mt-0.5">{iconMap[n.type]}</div>
          <div className="flex-1 min-w-0">
            <h5 className="text-xs font-bold text-white leading-tight">{n.title}</h5>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              {n.message}
            </p>
          </div>
          <button
            onClick={() => removeNotification(n.id)}
            className="flex-shrink-0 p-1 text-muted-foreground hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
