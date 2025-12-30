import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { Lock, AlertCircle, Download, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/currency";
import { Helmet } from "react-helmet-async";

interface PersonData {
  id: string;
  name: string;
  price_per_cig: number | null;
  cig_count: number;
  eff_price_per_cig: number;
  cig_total: number;
  loans_total: number;
  grand_total: number;
}

interface EventData {
  id: string;
  delta: number;
  created_at: string;
}

interface LoanData {
  id: string;
  amount: number;
  loan_date: string;
  reason: string | null;
  created_at: string;
}

interface SharedData {
  person: PersonData;
  events: EventData[];
  loans: LoanData[];
  settings: {
    allowExport: boolean;
    maskSensitive: boolean;
  };
}

type PageState = "loading" | "passcode" | "success" | "error";

export default function SharedViewPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<PageState>("loading");
  const [error, setError] = useState("");
  const [passcode, setPasscode] = useState("");
  const [data, setData] = useState<SharedData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateToken = async (providedPasscode?: string) => {
    if (!token) {
      setError("Invalid link");
      setState("error");
      return;
    }

    setIsSubmitting(true);

    try {
      // Use direct fetch for better control over non-2xx responses
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-share-token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ token, passcode: providedPasscode }),
        }
      );

      const responseData = await response.json();

      // Handle passcode required (401 with requiresPasscode flag)
      if (responseData.requiresPasscode) {
        setState("passcode");
        setIsSubmitting(false);
        return;
      }

      // Handle errors from the edge function
      if (responseData.error) {
        setError(responseData.error);
        setState("error");
        setIsSubmitting(false);
        return;
      }

      // Success case
      if (responseData.success) {
        setData(responseData);
        setState("success");
      }
    } catch (err) {
      console.error("Validation error:", err);
      setError("Failed to validate link. Please try again.");
      setState("error");
    }

    setIsSubmitting(false);
  };

  useEffect(() => {
    validateToken();
  }, [token]);

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validateToken(passcode);
  };

  const handleExport = () => {
    if (!data) return;

    const exportData = {
      name: data.person.name,
      exportedAt: new Date().toISOString(),
      summary: {
        cigaretteCount: data.person.cig_count,
        cigaretteTotal: data.person.cig_total,
        loansTotal: data.person.loans_total,
        grandTotal: data.person.grand_total,
      },
      events: data.events.map((e) => ({
        date: e.created_at,
        change: e.delta,
      })),
      loans: data.loans.map((l) => ({
        date: l.loan_date,
        amount: l.amount,
        reason: l.reason,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statement-${data.person.name.toLowerCase().replace(/\s+/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Loading state
  if (state === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Helmet>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Validating link...</p>
        </div>
      </div>
    );
  }

  // Passcode required state
  if (state === "passcode") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Helmet>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <Card className="w-full max-w-sm p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-xl font-semibold">Protected Link</h1>
            <p className="text-sm text-muted-foreground mt-1">
              This link requires a passcode to access
            </p>
          </div>

          <form onSubmit={handlePasscodeSubmit} className="space-y-4">
            <Input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={isSubmitting || !passcode}>
              {isSubmitting ? "Verifying..." : "Access"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Helmet>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <Card className="w-full max-w-sm p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">{error}</p>
        </Card>
      </div>
    );
  }

  // Success state - show data
  if (!data) return null;

  const { person, events, loans, settings } = data;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Statement - {person.name}</title>
      </Helmet>

      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Eye className="h-4 w-4" />
            View-Only Statement
          </div>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-1">
                {settings.maskSensitive ? person.name.charAt(0) + "***" : person.name}
              </h1>
              <p className="text-muted-foreground">
                ₹{person.eff_price_per_cig?.toFixed(2)}/pc
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground mb-1">Total Amount Due</div>
              <div className="text-4xl font-bold text-primary">
                {formatCurrency(person.grand_total)}
              </div>
            </div>
          </div>

          {settings.allowExport && (
            <Button variant="outline" className="mt-4 gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Download Statement
            </Button>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Cigarettes</div>
            <div className="text-2xl font-bold">{person.cig_count} pcs</div>
            <div className="text-lg text-primary">{formatCurrency(person.cig_total)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Loans</div>
            <div className="text-2xl font-bold">{loans.length} entries</div>
            <div className="text-lg text-primary">{formatCurrency(person.loans_total)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Grand Total</div>
            <div className="text-3xl font-bold text-primary">
              {formatCurrency(person.grand_total)}
            </div>
          </Card>
        </div>

        {/* Cigarette History */}
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Cigarette History</h2>
          {events.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No history</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div
                    className={`font-mono ${
                      event.delta > 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {event.delta > 0 ? "+" : ""}
                    {event.delta}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(event.created_at), "PPp")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Loans History */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Loan History</h2>
          {loans.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No loans</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {loans.map((loan) => (
                <div
                  key={loan.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-semibold text-primary">
                      {formatCurrency(loan.amount)}
                    </div>
                    {loan.reason && (
                      <div className="text-sm text-muted-foreground">
                        {settings.maskSensitive ? (
                          <span className="flex items-center gap-1">
                            <EyeOff className="h-3 w-3" /> Masked
                          </span>
                        ) : (
                          loan.reason
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(loan.loan_date), "PP")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>This is a read-only view. No modifications can be made.</p>
          <p className="mt-1">Generated by Mamu Tracker</p>
        </div>
      </div>
    </div>
  );
}
