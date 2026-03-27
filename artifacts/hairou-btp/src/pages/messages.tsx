import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { useListMessages, useSendMessage, useListUsers, useMarkMessageRead } from "@workspace/api-client-react";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Send, Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export default function Messages() {
  const { data: messages, isLoading } = useListMessages();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const markReadMutation = useMarkMessageRead();
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const handleSelect = (msg: any) => {
    setSelected(msg);
    if (!msg.isRead && msg.recipientId === user?.id) {
      markReadMutation.mutate({ id: msg.id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/messages"] })
      });
    }
  };

  const unreadCount = messages?.filter(m => !m.isRead && m.recipientId === user?.id).length ?? 0;

  return (
    <AppLayout title="Messages">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-muted-foreground">
            {unreadCount > 0 ? (
              <span className="font-semibold text-primary">{unreadCount} message{unreadCount > 1 ? 's' : ''} non lu{unreadCount > 1 ? 's' : ''}</span>
            ) : (
              "Tous vos messages ont été lus."
            )}
          </p>
          <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau Message
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Envoyer un Message</DialogTitle>
              </DialogHeader>
              <ComposeForm onSuccess={() => setIsComposeOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted/50 rounded-2xl animate-pulse" />)}
          </div>
        ) : messages?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center bg-white rounded-3xl border border-border/50 shadow-sm">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <MessageSquare className="w-10 h-10 text-muted-foreground/50" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucun message</h3>
            <p className="text-muted-foreground mb-6">Commencez une conversation avec votre équipe.</p>
            <Button onClick={() => setIsComposeOpen(true)} className="rounded-xl">Envoyer un message</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
            {/* Message List */}
            <div className="lg:col-span-1 bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-border/50 font-semibold text-sm text-foreground">
                Boîte de réception
              </div>
              <div className="flex-1 overflow-auto divide-y divide-border/50">
                {messages?.map(msg => (
                  <button
                    key={msg.id}
                    onClick={() => handleSelect(msg)}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors ${selected?.id === msg.id ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {!msg.isRead && msg.recipientId === user?.id && (
                            <span className="w-2 h-2 bg-primary rounded-full shrink-0" />
                          )}
                          <p className={`text-sm font-semibold truncate ${!msg.isRead && msg.recipientId === user?.id ? 'text-primary' : 'text-foreground'}`}>
                            {msg.senderName || 'Inconnu'}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{msg.subject}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(msg.createdAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Message Detail */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-border/50 shadow-sm flex flex-col overflow-hidden">
              {selected ? (
                <>
                  <div className="px-6 py-4 border-b border-border/50">
                    <h3 className="font-bold text-lg text-foreground">{selected.subject}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      De: <span className="font-medium text-foreground">{selected.senderName}</span>
                      {' · '}
                      {formatDateTime(selected.createdAt)}
                    </p>
                  </div>
                  <div className="flex-1 p-6 overflow-auto">
                    <p className="text-foreground leading-relaxed whitespace-pre-wrap">{selected.body}</p>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
                  <div>
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Sélectionnez un message</p>
                    <p className="text-sm">pour le lire ici</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function ComposeForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: users } = useListUsers();

  const sendMutation = useSendMessage({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
        toast({ title: "Message envoyé avec succès" });
        onSuccess();
      },
      onError: () => toast({ title: "Erreur", description: "Impossible d'envoyer le message.", variant: "destructive" })
    }
  });

  const [form, setForm] = useState({ recipientId: "", subject: "", body: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.recipientId || !form.subject || !form.body) return;
    sendMutation.mutate({ data: { ...form, recipientId: parseInt(form.recipientId) } });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label>Destinataire *</Label>
        <Select value={form.recipientId} onValueChange={v => setForm({ ...form, recipientId: v })}>
          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Choisir un destinataire" /></SelectTrigger>
          <SelectContent>{users?.map(u => <SelectItem key={u.id} value={u.id.toString()}>{u.name} — {u.role.replace('_', ' ')}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Objet *</Label>
        <input
          type="text"
          value={form.subject}
          onChange={e => setForm({ ...form, subject: e.target.value })}
          placeholder="Sujet du message"
          required
          className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>
      <div className="space-y-2">
        <Label>Message *</Label>
        <Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Écrivez votre message..." rows={5} className="rounded-xl" required />
      </div>
      <div className="pt-4 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button type="submit" disabled={sendMutation.isPending || !form.recipientId || !form.subject || !form.body} className="rounded-xl bg-primary hover:bg-primary/90 text-white">
          {sendMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Envoyer
        </Button>
      </div>
    </form>
  );
}
