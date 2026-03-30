import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout";
import { useListMessages, useListUsers, useMarkMessageRead } from "@workspace/api-client-react";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Loader2, Plus, ArrowLeft, Reply, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

const BACKEND = "https://btp-gestion-de-projet.onrender.com";

async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem("hairou_token");
  const fullUrl = path.startsWith("http") ? path : `${BACKEND}${path}`;
  const res = await fetch(fullUrl, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || "Erreur serveur");
  }
  return res.json();
}

function roleLabel(role: string) {
  const map: Record<string, string> = {
    ADMIN: "Administrateur",
    CHEF_CHANTIER: "Chef de Chantier",
    OUVRIER: "Ouvrier",
  };
  return map[role] || role;
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function avatarColor(name: string) {
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-green-100 text-green-700",
    "bg-purple-100 text-purple-700",
    "bg-orange-100 text-orange-700",
    "bg-rose-100 text-rose-700",
    "bg-teal-100 text-teal-700",
  ];
  const idx = (name.charCodeAt(0) || 0) % colors.length;
  return colors[idx];
}

// Parse subject from content [subject] body format
function parseMessage(content: string): { subject: string; body: string } {
  const m = /^\[(.+?)\]\s*/.exec(content || "");
  if (m) return { subject: m[1], body: content.slice(m[0].length) };
  return { subject: "Message", body: content || "" };
}

export default function Messages() {
  const { data: messages, isLoading } = useListMessages();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const markReadMutation = useMarkMessageRead();
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false); // for mobile: show detail panel
  const [replyOpen, setReplyOpen] = useState(false);

  const handleSelect = (msg: any) => {
    setSelected(msg);
    setShowDetail(true);
    setReplyOpen(false);
    if (!msg.isRead && msg.recipientId === user?.id) {
      markReadMutation.mutate({ id: msg.id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/messages"] })
      });
    }
  };

  const unreadCount = messages?.filter(m => !m.isRead && m.recipientId === user?.id).length ?? 0;

  // Sort messages: unread first, then by date desc
  const sortedMessages = [...(messages || [])].sort((a, b) => {
    const aUnread = !a.isRead && a.recipientId === user?.id ? 1 : 0;
    const bUnread = !b.isRead && b.recipientId === user?.id ? 1 : 0;
    if (aUnread !== bUnread) return bUnread - aUnread;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <AppLayout title="Messages">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <p className="text-muted-foreground text-sm">
              {unreadCount > 0 ? (
                <span className="font-semibold text-primary">
                  {unreadCount} message{unreadCount > 1 ? "s" : ""} non lu{unreadCount > 1 ? "s" : ""}
                </span>
              ) : (
                "Tous vos messages ont été lus."
              )}
            </p>
          </div>
          <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20">
                <Plus className="w-4 h-4 mr-2" />
                Nouveau Message
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] rounded-2xl">
              <DialogHeader>
                <DialogTitle className="font-display text-xl flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Nouveau Message
                </DialogTitle>
              </DialogHeader>
              <ComposeForm onSuccess={() => { setIsComposeOpen(false); queryClient.invalidateQueries({ queryKey: ["/api/messages"] }); }} />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-muted/50 rounded-2xl animate-pulse" />)}
          </div>
        ) : sortedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 text-center bg-white rounded-3xl border border-border/50 shadow-sm">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-4">
              <MessageSquare className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aucun message</h3>
            <p className="text-muted-foreground mb-6">Commencez une conversation avec votre équipe.</p>
            <Button onClick={() => setIsComposeOpen(true)} className="rounded-xl">Envoyer un message</Button>
          </div>
        ) : (
          /* ─── Two-panel layout ─────────────────────────────────────────── */
          <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">

            {/* LEFT: message list */}
            <div className={`bg-white rounded-2xl border border-border/50 shadow-sm flex flex-col overflow-hidden transition-all ${showDetail ? "hidden lg:flex lg:w-[340px] shrink-0" : "flex flex-1"}`}>
              <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
                <span className="font-bold text-sm text-foreground">Conversations</span>
                <span className="text-xs text-muted-foreground">{sortedMessages.length} message{sortedMessages.length > 1 ? "s" : ""}</span>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-border/30">
                {sortedMessages.map(msg => {
                  const isUnread = !msg.isRead && msg.recipientId === user?.id;
                  const isMine = msg.senderId === user?.id;
                  const { subject } = parseMessage(msg.content);
                  const otherName = isMine ? (msg.recipientName || "Destinataire") : (msg.senderName || "Expéditeur");
                  const color = avatarColor(otherName);

                  return (
                    <button
                      key={msg.id}
                      onClick={() => handleSelect(msg)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/20 transition-colors group ${selected?.id === msg.id ? "bg-primary/5 border-l-2 border-primary" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${color}`}>
                          {getInitials(otherName)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-sm font-semibold truncate ${isUnread ? "text-primary" : "text-foreground"}`}>
                              {otherName}
                              {isMine && <span className="ml-1 text-xs font-normal text-muted-foreground">(envoyé)</span>}
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(msg.createdAt)}</span>
                          </div>
                          <p className={`text-xs truncate mt-0.5 ${isUnread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                            {subject}
                          </p>
                          <p className="text-xs text-muted-foreground/70 truncate">
                            {parseMessage(msg.content).body.slice(0, 55)}
                          </p>
                        </div>
                        {isUnread && <span className="w-2 h-2 bg-primary rounded-full shrink-0 mt-1" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: message detail */}
            <div className={`bg-white rounded-2xl border border-border/50 shadow-sm flex flex-col flex-1 overflow-hidden ${showDetail ? "flex" : "hidden lg:flex"}`}>
              {selected ? (
                <>
                  {/* Detail header */}
                  <div className="px-5 py-4 border-b border-border/50 flex items-start gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="lg:hidden mr-1 rounded-xl h-8 w-8 p-0 shrink-0"
                      onClick={() => setShowDetail(false)}
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${avatarColor(selected.senderName || "")}`}>
                      {getInitials(selected.senderName || "?")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base text-foreground leading-tight">{parseMessage(selected.content).subject}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        De : <span className="font-medium text-foreground">{selected.senderName}</span>
                        {"  ·  "}
                        {formatDateTime(selected.createdAt)}
                      </p>
                    </div>
                    {/* Reply button — available to ALL roles */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setReplyOpen(r => !r)}
                      className="rounded-xl h-8 text-xs border-primary/30 text-primary hover:bg-primary/5 shrink-0"
                    >
                      <Reply className="w-3.5 h-3.5 mr-1" />
                      Répondre
                    </Button>
                  </div>

                  {/* Message body */}
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    {/* Sender info pill */}
                    <div className="flex items-center gap-2 mb-4 p-3 bg-muted/30 rounded-xl">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{selected.senderName}</span>
                        {" → "}
                        <span className="font-semibold text-foreground">{selected.recipientName || "Vous"}</span>
                      </span>
                    </div>
                    <div className="prose prose-sm max-w-none">
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap text-sm">
                        {parseMessage(selected.content).body}
                      </p>
                    </div>
                  </div>

                  {/* Inline reply form */}
                  {replyOpen && (
                    <div className="border-t border-border/50 px-5 py-4 bg-muted/10">
                      <ReplyForm
                        recipientId={selected.senderId === user?.id ? selected.recipientId : selected.senderId}
                        recipientName={selected.senderId === user?.id ? (selected.recipientName || "") : (selected.senderName || "")}
                        originalSubject={parseMessage(selected.content).subject}
                        onSuccess={() => {
                          setReplyOpen(false);
                          queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
                        }}
                        onCancel={() => setReplyOpen(false)}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-8">
                  <div className="w-16 h-16 bg-muted/40 rounded-full flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8 opacity-40" />
                  </div>
                  <p className="font-semibold text-foreground">Sélectionnez un message</p>
                  <p className="text-sm mt-1">pour afficher son contenu ici</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ─── Reply Form ────────────────────────────────────────────────────────────────

function ReplyForm({
  recipientId,
  recipientName,
  originalSubject,
  onSuccess,
  onCancel,
}: {
  recipientId: number;
  recipientName: string;
  originalSubject: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleSend = async () => {
    if (!body.trim()) return;
    setIsSending(true);
    try {
      await apiFetch("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          recipientId,
          subject: `Re: ${originalSubject}`,
          body: body.trim(),
        }),
      });
      toast({ title: "Réponse envoyée" });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message || "Impossible d'envoyer", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Reply className="w-4 h-4 text-primary" />
        <span>Répondre à <span className="font-semibold text-foreground">{recipientName}</span></span>
      </div>
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Votre réponse..."
        rows={3}
        className="rounded-xl resize-none text-sm"
      />
      <div className="flex items-center gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel} className="rounded-xl h-8 text-xs">Annuler</Button>
        <Button
          size="sm"
          onClick={handleSend}
          disabled={isSending || !body.trim()}
          className="rounded-xl h-8 text-xs bg-primary hover:bg-primary/90 text-white"
        >
          {isSending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
          Envoyer
        </Button>
      </div>
    </div>
  );
}

// ─── Compose Form ──────────────────────────────────────────────────────────────

function ComposeForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const { data: users } = useListUsers();
  const { user: currentUser } = useAuth();
  const [isSending, setIsSending] = useState(false);
  const [form, setForm] = useState({ recipientId: "", subject: "", body: "" });

  // All users except self, sorted by role then name
  const recipients = (users || [])
    .filter((u: any) => u.id !== currentUser?.id && u.status === "APPROVED")
    .sort((a: any, b: any) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.recipientId || !form.subject || !form.body) return;
    setIsSending(true);
    try {
      await apiFetch("/api/messages", {
        method: "POST",
        body: JSON.stringify({
          recipientId: parseInt(form.recipientId),
          subject: form.subject,
          body: form.body,
        }),
      });
      toast({ title: "Message envoyé avec succès" });
      setForm({ recipientId: "", subject: "", body: "" });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message || "Impossible d'envoyer le message.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-2">
      <div className="space-y-2">
        <Label>Destinataire *</Label>
        <Select value={form.recipientId} onValueChange={v => setForm({ ...form, recipientId: v })}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Choisir un destinataire" />
          </SelectTrigger>
          <SelectContent>
            {recipients.map((u: any) => (
              <SelectItem key={u.id} value={u.id.toString()}>
                <div className="flex items-center gap-2">
                  <span>{u.name}</span>
                  <span className="text-xs text-muted-foreground">— {roleLabel(u.role)}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Objet *</Label>
        <Input
          type="text"
          value={form.subject}
          onChange={e => setForm({ ...form, subject: e.target.value })}
          placeholder="Sujet du message"
          className="rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label>Message *</Label>
        <Textarea
          value={form.body}
          onChange={e => setForm({ ...form, body: e.target.value })}
          placeholder="Écrivez votre message..."
          rows={5}
          className="rounded-xl resize-none"
        />
      </div>
      <div className="pt-2 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onSuccess} className="rounded-xl">Annuler</Button>
        <Button
          type="submit"
          disabled={isSending || !form.recipientId || !form.subject || !form.body}
          className="rounded-xl bg-primary hover:bg-primary/90 text-white"
        >
          {isSending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Envoyer
        </Button>
      </div>
    </form>
  );
}
