import { AppLayout } from "@/components/layout";
import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@workspace/api-client-react";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck, Loader2, Info, AlertTriangle, CheckCircle2, MessageSquare } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function getNotifIcon(type: string) {
  switch (type) {
    case "SUCCESS": return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case "WARNING": return <AlertTriangle className="w-5 h-5 text-orange-500" />;
    case "MESSAGE": return <MessageSquare className="w-5 h-5 text-blue-500" />;
    default: return <Info className="w-5 h-5 text-primary" />;
  }
}

export default function Notifications() {
  const { data: notifications, isLoading } = useListNotifications();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const markReadMutation = useMarkNotificationRead();
  const markAllMutation = useMarkAllNotificationsRead();

  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;

  const handleMarkRead = (id: number) => {
    markReadMutation.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] })
    });
  };

  const handleMarkAll = () => {
    markAllMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        toast({ title: "Toutes les notifications marquées comme lues" });
      }
    });
  };

  return (
    <AppLayout title="Notifications">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground">
            {unreadCount > 0 ? (
              <span className="font-semibold text-primary">{unreadCount} notification{unreadCount > 1 ? 's' : ''} non lue{unreadCount > 1 ? 's' : ''}</span>
            ) : (
              "Vous êtes à jour !"
            )}
          </p>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              onClick={handleMarkAll}
              disabled={markAllMutation.isPending}
              className="rounded-xl text-sm"
            >
              {markAllMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-2" />}
              Tout marquer lu
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-muted/50 rounded-2xl animate-pulse" />)}
          </div>
        ) : notifications?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 text-center bg-white rounded-3xl border border-border/50 shadow-sm">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <Bell className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucune notification</h3>
            <p className="text-muted-foreground">Vous recevrez ici les alertes et mises à jour importantes.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications?.map(notif => (
              <div
                key={notif.id}
                className={`bg-white rounded-2xl border shadow-sm p-4 flex items-start gap-4 transition-all ${
                  !notif.isRead ? 'border-primary/30 bg-primary/2' : 'border-border/50 opacity-80'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  !notif.isRead ? 'bg-primary/10' : 'bg-muted'
                }`}>
                  {getNotifIcon(notif.type || 'INFO')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${!notif.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {notif.title}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{notif.message}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-2">{formatDateTime(notif.createdAt)}</p>
                </div>
                {!notif.isRead && (
                  <button
                    onClick={() => handleMarkRead(notif.id)}
                    disabled={markReadMutation.isPending}
                    className="shrink-0 text-xs text-muted-foreground hover:text-primary transition-colors font-medium py-1 px-2 rounded-lg hover:bg-primary/5"
                  >
                    Marquer lu
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
