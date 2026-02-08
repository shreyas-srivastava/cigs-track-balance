import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Minus, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currency";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface PersonFinancials {
  id: string;
  name: string;
  price_per_cig: number | null;
  cig_count: number;
  eff_price_per_cig: number;
  cig_total: number;
  loans_total: number;
  repayments_total: number;
  grand_total: number;
}

interface Event {
  id: string;
  delta: number;
  created_at: string;
  is_deleted: boolean;
}

interface Loan {
  id: string;
  amount: number;
  loan_date: string;
  reason: string | null;
  created_at: string;
  is_deleted: boolean;
}

interface Repayment {
  id: string;
  amount: number;
  repayment_date: string;
  note: string | null;
  created_at: string;
  is_deleted: boolean;
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  const [deleteLoanId, setDeleteLoanId] = useState<string | null>(null);
  const [deleteRepaymentId, setDeleteRepaymentId] = useState<string | null>(null);
  const [isAddLoanOpen, setIsAddLoanOpen] = useState(false);
  const [loanAmount, setLoanAmount] = useState("");
  const [loanDate, setLoanDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loanReason, setLoanReason] = useState("");
  const [isAddRepaymentOpen, setIsAddRepaymentOpen] = useState(false);
  const [repaymentAmount, setRepaymentAmount] = useState("");
  const [repaymentDate, setRepaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [repaymentNote, setRepaymentNote] = useState("");
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState("");

  // Fetch person financials
  const { data: person } = useQuery({
    queryKey: ["person-financials", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_person_financials")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as PersonFinancials;
    },
    enabled: !!id,
  });

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("id", "global")
        .single();

      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (person?.price_per_cig !== undefined) {
      setPriceInput(person.price_per_cig?.toString() || "");
    }
  }, [person]);

  // Fetch events
  const { data: events = [] } = useQuery({
    queryKey: ["person-events", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("person_id", id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Event[];
    },
    enabled: !!id,
  });

  // Fetch loans
  const { data: loans = [] } = useQuery({
    queryKey: ["person-loans", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("*")
        .eq("person_id", id)
        .eq("is_deleted", false)
        .order("loan_date", { ascending: false });

      if (error) throw error;
      return data as Loan[];
    },
    enabled: !!id,
  });

  // Fetch repayments
  const { data: repayments = [] } = useQuery({
    queryKey: ["person-repayments", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repayments")
        .select("*")
        .eq("person_id", id)
        .eq("is_deleted", false)
        .order("repayment_date", { ascending: false });

      if (error) throw error;
      return data as Repayment[];
    },
    enabled: !!id,
  });

  // Real-time subscriptions
  useEffect(() => {
    if (!id) return;

    const eventsChannel = supabase
      .channel("person-events-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `person_id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["person-events", id] });
          queryClient.invalidateQueries({ queryKey: ["person-financials", id] });
        }
      )
      .subscribe();

    const loansChannel = supabase
      .channel("person-loans-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "loans",
          filter: `person_id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["person-loans", id] });
          queryClient.invalidateQueries({ queryKey: ["person-financials", id] });
        }
      )
      .subscribe();

    const repaymentsChannel = supabase
      .channel("person-repayments-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "repayments",
          filter: `person_id=eq.${id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["person-repayments", id] });
          queryClient.invalidateQueries({ queryKey: ["person-financials", id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(eventsChannel);
      supabase.removeChannel(loansChannel);
      supabase.removeChannel(repaymentsChannel);
    };
  }, [id, queryClient]);

  // Increment mutation
  const incrementMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("events").insert({
        person_id: id!,
        delta: 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["person-events", id] });
      queryClient.invalidateQueries({ queryKey: ["person-financials", id] });
    },
  });

  // Decrement mutation
  const decrementMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("events").insert({
        person_id: id!,
        delta: -1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["person-events", id] });
      queryClient.invalidateQueries({ queryKey: ["person-financials", id] });
    },
  });

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("events")
        .update({ is_deleted: true })
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["person-events", id] });
      queryClient.invalidateQueries({ queryKey: ["person-financials", id] });
      toast({ title: "Event deleted" });
      setDeleteEventId(null);
    },
  });

  // Add loan mutation
  const addLoanMutation = useMutation({
    mutationFn: async (loan: { amount: number; loan_date: string; reason: string | null }) => {
      const { error } = await supabase.from("loans").insert({
        person_id: id!,
        ...loan,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["person-loans", id] });
      queryClient.invalidateQueries({ queryKey: ["person-financials", id] });
      toast({ title: "Loan added successfully" });
      setIsAddLoanOpen(false);
      setLoanAmount("");
      setLoanDate(format(new Date(), "yyyy-MM-dd"));
      setLoanReason("");
    },
  });

  // Delete loan mutation
  const deleteLoanMutation = useMutation({
    mutationFn: async (loanId: string) => {
      const { error } = await supabase
        .from("loans")
        .update({ is_deleted: true })
        .eq("id", loanId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["person-loans", id] });
      queryClient.invalidateQueries({ queryKey: ["person-financials", id] });
      toast({ title: "Loan deleted" });
      setDeleteLoanId(null);
    },
  });

  // Add repayment mutation
  const addRepaymentMutation = useMutation({
    mutationFn: async (repayment: { amount: number; repayment_date: string; note: string | null }) => {
      const { error } = await supabase.from("repayments").insert({
        person_id: id!,
        ...repayment,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["person-repayments", id] });
      queryClient.invalidateQueries({ queryKey: ["person-financials", id] });
      queryClient.invalidateQueries({ queryKey: ["global-receivable"] });
      toast({ title: "Repayment recorded successfully" });
      setIsAddRepaymentOpen(false);
      setRepaymentAmount("");
      setRepaymentDate(format(new Date(), "yyyy-MM-dd"));
      setRepaymentNote("");
    },
  });

  // Delete repayment mutation
  const deleteRepaymentMutation = useMutation({
    mutationFn: async (repaymentId: string) => {
      const { error } = await supabase
        .from("repayments")
        .update({ is_deleted: true })
        .eq("id", repaymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["person-repayments", id] });
      queryClient.invalidateQueries({ queryKey: ["person-financials", id] });
      queryClient.invalidateQueries({ queryKey: ["global-receivable"] });
      toast({ title: "Repayment deleted" });
      setDeleteRepaymentId(null);
    },
  });

  // Update price mutation
  const updatePriceMutation = useMutation({
    mutationFn: async (price: number | null) => {
      const { error } = await supabase
        .from("people")
        .update({ price_per_cig: price })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["person-financials", id] });
      setIsEditingPrice(false);
    },
  });

  const handlePriceSave = () => {
    const newPrice = priceInput === "" ? null : parseFloat(priceInput);
    if (newPrice === null || !isNaN(newPrice)) {
      updatePriceMutation.mutate(newPrice);
    }
  };

  const handleAddLoan = () => {
    const amount = parseFloat(loanAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount greater than 0",
        variant: "destructive",
      });
      return;
    }

    addLoanMutation.mutate({
      amount,
      loan_date: loanDate,
      reason: loanReason || null,
    });
  };

  const handleAddRepayment = () => {
    const amount = parseFloat(repaymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount greater than 0",
        variant: "destructive",
      });
      return;
    }

    addRepaymentMutation.mutate({
      amount,
      repayment_date: repaymentDate,
      note: repaymentNote || null,
    });
  };

  const handleDeleteEvent = (eventId: string) => {
    const event = events.find((e) => e.id === eventId);
    if (!event) return;

    // Check if deleting this event would make count negative
    const newCount = (person?.cig_count || 0) - event.delta;
    if (newCount < 0) {
      toast({
        title: "Cannot delete",
        description: "Deleting this event would result in a negative count",
        variant: "destructive",
      });
      return;
    }

    setDeleteEventId(eventId);
  };

  if (!person) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const effectivePrice = person.price_per_cig ?? settings?.default_price ?? 12;
  const totalOwed = person.cig_total + person.loans_total;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">
                {person.name}
              </h1>
              <div className="flex items-center gap-2">
                {isEditingPrice ? (
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">₹</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      onBlur={handlePriceSave}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handlePriceSave();
                        if (e.key === "Escape") {
                          setIsEditingPrice(false);
                          setPriceInput(person.price_per_cig?.toString() || "");
                        }
                      }}
                      className="w-24 h-8"
                      autoFocus
                    />
                    <span className="text-sm text-muted-foreground">/pc</span>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsEditingPrice(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ₹{effectivePrice.toFixed(2)}/pc
                    {person.price_per_cig === null && " (default)"}
                  </button>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm text-muted-foreground mb-1">
                Pending Amount
              </div>
              <div className="text-4xl font-bold text-primary">
                {formatCurrency(person.grand_total)}
              </div>
              {person.repayments_total > 0 && (
                <div className="text-sm text-muted-foreground mt-1">
                  Total: {formatCurrency(totalOwed)} − Paid: {formatCurrency(person.repayments_total)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Cigarettes</div>
            <div className="text-xl font-bold">{formatCurrency(person.cig_total)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Loans</div>
            <div className="text-xl font-bold">{formatCurrency(person.loans_total)}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-success">Repaid</div>
            <div className="text-xl font-bold text-success">{formatCurrency(person.repayments_total)}</div>
          </Card>
          <Card className="p-4 border-primary/30 bg-primary/5">
            <div className="text-sm text-primary font-medium">Pending</div>
            <div className="text-xl font-bold text-primary">{formatCurrency(person.grand_total)}</div>
          </Card>
        </div>

        {/* Cigarettes Section */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Cigarettes</h2>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                onClick={() => decrementMutation.mutate()}
                disabled={person.cig_count <= 0}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[60px]">
                <div className="number-emphasis">{person.cig_count}</div>
                <div className="text-xs text-muted-foreground">pcs</div>
              </div>
              <Button
                size="icon"
                variant="default"
                onClick={() => incrementMutation.mutate()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-sm text-muted-foreground">History</h3>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No events yet
              </p>
            ) : (
              <div className="space-y-2">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
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
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteEvent(event.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Loans Section */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold">Loans</h2>
            <Dialog open={isAddLoanOpen} onOpenChange={setIsAddLoanOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Loan
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Loan</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Amount (₹)</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="date">Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={loanDate}
                      onChange={(e) => setLoanDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="reason">Reason (optional)</Label>
                    <Textarea
                      id="reason"
                      value={loanReason}
                      onChange={(e) => setLoanReason(e.target.value)}
                      placeholder="e.g., Cash short"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddLoan}>Add Loan</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="text-right mb-4">
            <div className="text-sm text-muted-foreground">Loans Total</div>
            <div className="text-2xl font-bold text-accent">
              {formatCurrency(person.loans_total)}
            </div>
          </div>

          <div className="space-y-2">
            {loans.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No loans yet
              </p>
            ) : (
              <div className="space-y-2">
                {loans.map((loan) => (
                  <div
                    key={loan.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="font-semibold text-accent">
                          {formatCurrency(loan.amount)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(loan.loan_date), "PP")}
                        </div>
                      </div>
                      {loan.reason && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {loan.reason}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteLoanId(loan.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Repayments Section */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold flex items-center gap-2">
              <Wallet className="h-6 w-6 text-success" />
              Repayments
            </h2>
            <Dialog open={isAddRepaymentOpen} onOpenChange={setIsAddRepaymentOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-success/50 text-success hover:bg-success/10 hover:text-success">
                  <Plus className="h-4 w-4" />
                  Add Repayment
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Repayment</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="repayment-amount">Amount (₹)</Label>
                    <Input
                      id="repayment-amount"
                      type="number"
                      step="0.01"
                      value={repaymentAmount}
                      onChange={(e) => setRepaymentAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="repayment-date">Date</Label>
                    <Input
                      id="repayment-date"
                      type="date"
                      value={repaymentDate}
                      onChange={(e) => setRepaymentDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="repayment-note">Note (optional)</Label>
                    <Textarea
                      id="repayment-note"
                      value={repaymentNote}
                      onChange={(e) => setRepaymentNote(e.target.value)}
                      placeholder="e.g., Partial payment via UPI"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAddRepayment} className="bg-success hover:bg-success/90 text-success-foreground">
                    Record Repayment
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="text-right mb-4">
            <div className="text-sm text-muted-foreground">Total Repaid</div>
            <div className="text-2xl font-bold text-success">
              {formatCurrency(person.repayments_total)}
            </div>
          </div>

          <div className="space-y-2">
            {repayments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No repayments yet
              </p>
            ) : (
              <div className="space-y-2">
                {repayments.map((repayment) => (
                  <div
                    key={repayment.id}
                    className="flex items-center justify-between p-3 border border-success/20 bg-success/5 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="font-semibold text-success">
                          {formatCurrency(repayment.amount)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(repayment.repayment_date), "PP")}
                        </div>
                      </div>
                      {repayment.note && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {repayment.note}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteRepaymentId(repayment.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Delete Event Confirmation */}
        <AlertDialog
          open={!!deleteEventId}
          onOpenChange={() => setDeleteEventId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Event?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this cigarette event and update the
                totals.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteEventId && deleteEventMutation.mutate(deleteEventId)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Loan Confirmation */}
        <AlertDialog
          open={!!deleteLoanId}
          onOpenChange={() => setDeleteLoanId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Loan?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this loan entry and update the totals.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteLoanId && deleteLoanMutation.mutate(deleteLoanId)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Repayment Confirmation */}
        <AlertDialog
          open={!!deleteRepaymentId}
          onOpenChange={() => setDeleteRepaymentId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Repayment?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this repayment entry and update the pending amount.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteRepaymentId && deleteRepaymentMutation.mutate(deleteRepaymentId)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
