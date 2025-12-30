import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link2, Link2Off, ExternalLink, Trash2, Eye, Clock, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface ShareLink {
  id: string;
  token: string;
  label: string | null;
  expires_at: string;
  status: string;
  created_at: string;
  last_accessed_at: string | null;
  access_count: number;
  allow_export: boolean;
  mask_sensitive: boolean;
  passcode_hash: string | null;
}

interface SharedLinksSectionProps {
  personId: string;
}

export function SharedLinksSection({ personId }: SharedLinksSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["share-links", personId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("share_links")
        .select("*")
        .eq("person_id", personId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ShareLink[];
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("share_links")
        .update({ status: "revoked" })
        .eq("id", linkId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["share-links", personId] });
      toast({ title: "Link revoked successfully" });
      setRevokeId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from("share_links")
        .delete()
        .eq("id", linkId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["share-links", personId] });
      toast({ title: "Link deleted successfully" });
      setDeleteId(null);
    },
  });

  const getStatusBadge = (link: ShareLink) => {
    const now = new Date();
    const expiresAt = new Date(link.expires_at);

    if (link.status === "revoked") {
      return (
        <Badge variant="destructive" className="gap-1">
          <Link2Off className="h-3 w-3" />
          Revoked
        </Badge>
      );
    }

    if (expiresAt < now || link.status === "expired") {
      return (
        <Badge variant="secondary" className="gap-1">
          <Clock className="h-3 w-3" />
          Expired
        </Badge>
      );
    }

    return (
      <Badge variant="default" className="gap-1 bg-green-600">
        <Link2 className="h-3 w-3" />
        Active
      </Badge>
    );
  };

  const isLinkActive = (link: ShareLink) => {
    const now = new Date();
    const expiresAt = new Date(link.expires_at);
    return link.status === "active" && expiresAt > now;
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="text-muted-foreground">Loading shared links...</div>
      </Card>
    );
  }

  if (links.length === 0) {
    return null;
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Link2 className="h-5 w-5" />
        Shared Links
      </h2>

      <div className="space-y-3">
        {links.map((link) => (
          <div
            key={link.id}
            className="border rounded-lg p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">
                    {link.label || "Unnamed link"}
                  </span>
                  {getStatusBadge(link)}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Created {format(new Date(link.created_at), "PPp")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isLinkActive(link) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/shared/${link.token}`, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
                {isLinkActive(link) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRevokeId(link.id)}
                  >
                    <Link2Off className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteId(link.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Expires: {format(new Date(link.expires_at), "PPp")}
              </div>
              <div className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                Views: {link.access_count}
              </div>
              {link.last_accessed_at && (
                <div>
                  Last accessed: {format(new Date(link.last_accessed_at), "PPp")}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {link.passcode_hash && (
                <Badge variant="outline" className="gap-1">
                  <Shield className="h-3 w-3" />
                  Passcode Protected
                </Badge>
              )}
              {link.allow_export && (
                <Badge variant="outline">Export Enabled</Badge>
              )}
              {link.mask_sensitive && (
                <Badge variant="outline">Masking Enabled</Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Revoke Dialog */}
      <AlertDialog open={!!revokeId} onOpenChange={() => setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Share Link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately invalidate the link. Anyone with the link will
              no longer be able to access the data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeId && revokeMutation.mutate(revokeId)}
            >
              Revoke Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Share Link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this share link and its access logs.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
