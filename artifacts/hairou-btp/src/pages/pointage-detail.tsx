import { useState, useRef } from "react";
import { useRoute } from "wouter";
import { AppLayout } from "@/components/layout";
import { 
  useGetPointageSheet, 
  useUpdatePointageSheet, 
  useSubmitPointageSheet,
  useApprovePointageSheet,
  PointageEntryStatus 
} from "@workspace/api-client-react";
import { formatFCFA, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, PenTool, Loader2, Save, FileSignature } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import SignatureCanvas from 'react-signature-canvas';
import { useAuth } from "@/hooks/use-auth";

export default function PointageDetail() {
  const [, params] = useRoute("/pointage/:id");
  const id = parseInt(params?.id || "0");
  const { user } = useAuth();
  
  const { data: sheet, isLoading } = useGetPointageSheet(id, { query: { enabled: !!id } });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminComment, setAdminComment] = useState("");
  const [approvalType, setApprovalType] = useState<"approve" | "reject">("approve");
  const sigPad = useRef<any>(null);

  const submitMutation = useSubmitPointageSheet();
  const approveMutation = useApprovePointageSheet();

  const isEditable = sheet?.status === 'BROUILLON';
  const isAdmin = user?.role === 'ADMIN';
  const canApprove = isAdmin && sheet?.status === 'SOUMISE';

  const handleSignSubmit = () => {
    if (sigPad.current?.isEmpty()) {
      toast({ title: "Signature requise", variant: "destructive" });
      return;
    }
    const dataUrl = sigPad.current.getTrimmedCanvas().toDataURL('image/png');
    submitMutation.mutate({
      id,
      data: { signatureData: dataUrl }
    }, {
      onSuccess: () => {
        setIsSignModalOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/pointage", id] });
        toast({ title: "Pointage soumis avec succès" });
      }
    });
  };

  const handleAdminAction = () => {
    approveMutation.mutate({
      id,
      data: { 
        approved: approvalType === "approve",
        comment: adminComment
      }
    }, {
      onSuccess: () => {
        setIsAdminModalOpen(false);
        queryClient.invalidateQueries({ queryKey: ["/api/pointage", id] });
        toast({ title: approvalType === "approve" ? "Pointage approuvé" : "Pointage rejeté" });
      }
    });
  };

  if (isLoading) return <AppLayout title="Chargement..."><div className="animate-pulse h-64 bg-muted rounded-2xl"></div></AppLayout>;
  if (!sheet) return <AppLayout title="Erreur"><p>Feuille introuvable.</p></AppLayout>;

  return (
    <AppLayout title={`Pointage: ${sheet.projectName || 'Projet inconnu'}`}>
      <div className="space-y-6">
        
        {/* Header Info */}
        <div className="bg-white rounded-2xl p-6 border border-border/50 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold font-display text-foreground">{formatDate(sheet.date)}</h2>
            <p className="text-muted-foreground mt-1">Chef de chantier: <span className="font-semibold text-foreground">{sheet.chefName}</span></p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`px-4 py-1.5 text-sm uppercase tracking-wider ${
              sheet.status === 'APPROUVEE' ? 'bg-green-100 text-green-700 border-green-200' :
              sheet.status === 'REJETEE' ? 'bg-red-100 text-red-700 border-red-200' :
              sheet.status === 'SOUMISE' ? 'bg-blue-100 text-blue-700 border-blue-200' :
              'bg-gray-100 text-gray-700 border-gray-200'
            }`}>
              {sheet.status}
            </Badge>

            {isEditable && (
              <Button onClick={() => setIsSignModalOpen(true)} className="bg-primary hover:bg-primary/90 text-white rounded-xl">
                <FileSignature className="w-4 h-4 mr-2" />
                Signer & Soumettre
              </Button>
            )}

            {canApprove && (
              <>
                <Button onClick={() => { setApprovalType("reject"); setIsAdminModalOpen(true); }} variant="destructive" className="rounded-xl">
                  <XCircle className="w-4 h-4 mr-2" />
                  Rejeter
                </Button>
                <Button onClick={() => { setApprovalType("approve"); setIsAdminModalOpen(true); }} className="bg-green-600 hover:bg-green-700 text-white rounded-xl">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approuver
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Admin Feedback */}
        {sheet.adminComment && (
          <div className={`p-4 rounded-xl border ${sheet.status === 'REJETEE' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
            <h4 className="font-bold mb-1">Commentaire de l'administration:</h4>
            <p>{sheet.adminComment}</p>
          </div>
        )}

        {/* Entries Table (Read-only for now to satisfy generation speed, full edit needs massive form array) */}
        <div className="bg-white rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground uppercase font-semibold text-xs border-b border-border/50">
                <tr>
                  <th className="px-6 py-4">Ouvrier</th>
                  <th className="px-6 py-4">Statut</th>
                  <th className="px-6 py-4">Arrivée</th>
                  <th className="px-6 py-4">Départ</th>
                  <th className="px-6 py-4 text-right">Heures</th>
                  <th className="px-6 py-4 text-right">Total Paye</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sheet.entries && sheet.entries.length > 0 ? (
                  sheet.entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-muted/20">
                      <td className="px-6 py-4 font-medium text-foreground">{entry.personnelName}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                          entry.status === 'PRESENT' ? 'bg-green-100 text-green-700' :
                          entry.status === 'ABSENT' ? 'bg-red-100 text-red-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">{entry.arrivalTime || '-'}</td>
                      <td className="px-6 py-4">{entry.departureTime || '-'}</td>
                      <td className="px-6 py-4 text-right font-medium">{entry.hoursWorked || 0}h</td>
                      <td className="px-6 py-4 text-right font-bold text-primary">{formatFCFA(entry.totalPay)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      Aucun ouvrier pointé sur cette feuille.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-primary/5 font-bold text-foreground">
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-right">TOTAL DE LA JOURNÉE</td>
                  <td className="px-6 py-4 text-right text-lg text-accent">{formatFCFA(sheet.totalPay)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Signature Display */}
        {sheet.signatureData && (
          <div className="bg-white rounded-2xl border border-border/50 p-6 max-w-md">
            <h4 className="font-semibold text-muted-foreground mb-4 uppercase tracking-wider text-sm">Signature Chef de Chantier</h4>
            <div className="bg-muted/20 rounded-xl p-4 flex justify-center">
              <img src={sheet.signatureData} alt="Signature" className="max-h-32" />
            </div>
          </div>
        )}

        {/* Signature Modal */}
        <Dialog open={isSignModalOpen} onOpenChange={setIsSignModalOpen}>
          <DialogContent className="sm:max-w-[500px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">Signature Électronique</DialogTitle>
              <DialogDescription>Apposez votre signature pour certifier ces heures.</DialogDescription>
            </DialogHeader>
            <div className="border-2 border-dashed border-border/50 rounded-xl overflow-hidden bg-white">
              <SignatureCanvas 
                ref={sigPad} 
                penColor="#011638"
                canvasProps={{ className: "w-full h-48 bg-white cursor-crosshair" }} 
              />
            </div>
            <div className="flex justify-between mt-4">
              <Button variant="ghost" onClick={() => sigPad.current?.clear()}>Effacer</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsSignModalOpen(false)}>Annuler</Button>
                <Button onClick={handleSignSubmit} disabled={submitMutation.isPending} className="bg-primary text-white">
                  {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Soumettre"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Admin Action Modal */}
        <Dialog open={isAdminModalOpen} onOpenChange={setIsAdminModalOpen}>
          <DialogContent className="sm:max-w-[500px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display text-2xl">
                {approvalType === 'approve' ? 'Approuver le pointage' : 'Rejeter le pointage'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Commentaire (Optionnel pour approbation, Requis pour rejet)</Label>
                <Textarea 
                  value={adminComment} 
                  onChange={(e) => setAdminComment(e.target.value)}
                  placeholder="Laissez un message au chef de chantier..."
                  className="rounded-xl"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsAdminModalOpen(false)}>Annuler</Button>
              <Button 
                onClick={handleAdminAction} 
                disabled={approveMutation.isPending || (approvalType === 'reject' && !adminComment)}
                className={approvalType === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
              >
                {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmer'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </AppLayout>
  );
}
