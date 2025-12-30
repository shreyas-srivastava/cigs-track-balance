import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Share2, Copy, Check, Eye, EyeOff, Download, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface ShareLinkDialogProps {
  personId: string;
  personName: string;
}

// Generate cryptographically strong token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Hash passcode client-side
async function hashPasscode(passcode: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(passcode);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function ShareLinkDialog({ personId, personName }: ShareLinkDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"configure" | "generated">("configure");
  const [generatedLink, setGeneratedLink] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [copied, setCopied] = useState(false);

  // Configuration state
  const [expiryOption, setExpiryOption] = useState("24h");
  const [customDays, setCustomDays] = useState("");
  const [requirePasscode, setRequirePasscode] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [allowExport, setAllowExport] = useState(false);
  const [maskSensitive, setMaskSensitive] = useState(false);
  const [label, setLabel] = useState("");

  const getExpiryDate = (): Date => {
    const now = new Date();
    switch (expiryOption) {
      case "1h":
        return new Date(now.getTime() + 60 * 60 * 1000);
      case "24h":
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case "7d":
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case "30d":
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      case "custom":
        const days = parseInt(customDays) || 1;
        return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const token = generateToken();
      const expires = getExpiryDate();
      let passcodeHash = null;

      if (requirePasscode && passcode) {
        passcodeHash = await hashPasscode(passcode);
      }

      const { error } = await supabase.from("share_links").insert({
        person_id: personId,
        token,
        label: label || `Share link for ${personName}`,
        expires_at: expires.toISOString(),
        passcode_hash: passcodeHash,
        allow_export: allowExport,
        mask_sensitive: maskSensitive,
      });

      if (error) throw error;

      return { token, expires };
    },
    onSuccess: ({ token, expires }) => {
      const link = `${window.location.origin}/shared/${token}`;
      setGeneratedLink(link);
      setExpiresAt(expires.toLocaleString());
      setStep("generated");
      queryClient.invalidateQueries({ queryKey: ["share-links", personId] });
      toast({ title: "Share link generated successfully" });
    },
    onError: () => {
      toast({
        title: "Failed to generate link",
        variant: "destructive",
      });
    },
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link copied to clipboard" });
  };

  const handleClose = () => {
    setOpen(false);
    // Reset state after dialog closes
    setTimeout(() => {
      setStep("configure");
      setGeneratedLink("");
      setExpiresAt("");
      setExpiryOption("24h");
      setCustomDays("");
      setRequirePasscode(false);
      setPasscode("");
      setAllowExport(false);
      setMaskSensitive(false);
      setLabel("");
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share View-Only Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "configure" ? "Create Share Link" : "Link Generated"}
          </DialogTitle>
        </DialogHeader>

        {step === "configure" ? (
          <div className="space-y-6 py-4">
            {/* Label */}
            <div className="space-y-2">
              <Label htmlFor="label">Link Label (optional)</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Share link for ${personName}`}
              />
            </div>

            {/* Expiry */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Link Expiry
              </Label>
              <Select value={expiryOption} onValueChange={setExpiryOption}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1 Hour</SelectItem>
                  <SelectItem value="24h">24 Hours</SelectItem>
                  <SelectItem value="7d">7 Days</SelectItem>
                  <SelectItem value="30d">30 Days</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {expiryOption === "custom" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    placeholder="Number of days"
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              )}
            </div>

            {/* Passcode */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="passcode-toggle" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Require Passcode
                </Label>
                <Switch
                  id="passcode-toggle"
                  checked={requirePasscode}
                  onCheckedChange={setRequirePasscode}
                />
              </div>
              {requirePasscode && (
                <Input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter passcode"
                />
              )}
            </div>

            {/* Allow Export */}
            <div className="flex items-center justify-between">
              <Label htmlFor="export-toggle" className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Allow Download/Export
              </Label>
              <Switch
                id="export-toggle"
                checked={allowExport}
                onCheckedChange={setAllowExport}
              />
            </div>

            {/* Mask Sensitive */}
            <div className="flex items-center justify-between">
              <Label htmlFor="mask-toggle" className="flex items-center gap-2">
                <EyeOff className="h-4 w-4" />
                Mask Sensitive Fields
              </Label>
              <Switch
                id="mask-toggle"
                checked={maskSensitive}
                onCheckedChange={setMaskSensitive}
              />
            </div>

            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending || (requirePasscode && !passcode)}
              className="w-full"
            >
              {generateMutation.isPending ? "Generating..." : "Generate Link"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Generated Link */}
            <div className="space-y-2">
              <Label>Share Link</Label>
              <div className="flex gap-2">
                <Input value={generatedLink} readOnly className="font-mono text-sm" />
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Expiry Info */}
            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Expires: {expiresAt}</span>
              </div>
              {requirePasscode && (
                <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                  <Eye className="h-4 w-4" />
                  <span>Passcode protected</span>
                </div>
              )}
            </div>

            <Button variant="outline" onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
