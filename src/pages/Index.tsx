import { useEffect, useState } from "react";
import { Search, Settings as SettingsIcon, TrendingUp, Users, IndianRupee, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PersonCard } from "@/components/PersonCard";
import { AddPersonDialog } from "@/components/AddPersonDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { formatCurrency } from "@/lib/currency";

interface PersonFinancials {
  id: string;
  name: string;
  price_per_cig: number | null;
  is_active: boolean;
  created_at: string;
  cig_count: number;
  eff_price_per_cig: number;
  cig_total: number;
  loans_total: number;
  grand_total: number;
}

const Index = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [globalPrice, setGlobalPrice] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [personToDelete, setPersonToDelete] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch global settings
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
    if (settings?.default_price) {
      setGlobalPrice(settings.default_price.toString());
    }
  }, [settings]);

  // Fetch people with financials
  const { data: people = [], isLoading } = useQuery({
    queryKey: ["people-financials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_person_financials")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data as PersonFinancials[];
    },
  });

  // Fetch global receivable
  const { data: globalReceivable } = useQuery({
    queryKey: ["global-receivable"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_global_receivable")
        .select("*")
        .single();

      if (error) throw error;
      return data as { total_receivable: number };
    },
  });

  // Real-time subscriptions
  useEffect(() => {
    const peopleChannel = supabase
      .channel("people-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "people",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["people-financials"] });
          queryClient.invalidateQueries({ queryKey: ["global-receivable"] });
        }
      )
      .subscribe();

    const eventsChannel = supabase
      .channel("events-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["people-financials"] });
          queryClient.invalidateQueries({ queryKey: ["global-receivable"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(peopleChannel);
      supabase.removeChannel(eventsChannel);
    };
  }, [queryClient]);

  // Add person mutation
  const addPersonMutation = useMutation({
    mutationFn: async ({
      name,
      priceOverride,
    }: {
      name: string;
      priceOverride: number | null;
    }) => {
      const { data, error } = await supabase
        .from("people")
        .insert({
          name,
          price_per_cig: priceOverride,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Person added successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add person",
        variant: "destructive",
      });
    },
  });

  // Increment mutation with optimistic update
  const incrementMutation = useMutation({
    mutationFn: async (personId: string) => {
      const { error } = await supabase.from("events").insert({
        person_id: personId,
        delta: 1,
      });

      if (error) throw error;
    },
    onMutate: async (personId) => {
      await queryClient.cancelQueries({ queryKey: ["people-financials"] });
      const previousPeople = queryClient.getQueryData(["people-financials"]);

      queryClient.setQueryData(["people-financials"], (old: PersonFinancials[]) =>
        old.map((person) =>
          person.id === personId
            ? {
                ...person,
                cig_count: person.cig_count + 1,
                cig_total:
                  (person.cig_count + 1) *
                  (person.price_per_cig ?? settings?.default_price ?? 12),
                grand_total:
                  (person.cig_count + 1) *
                  (person.price_per_cig ?? settings?.default_price ?? 12) +
                  person.loans_total,
              }
            : person
        )
      );

      return { previousPeople };
    },
    onError: (error, variables, context) => {
      if (context?.previousPeople) {
        queryClient.setQueryData(["people-financials"], context.previousPeople);
      }
      toast({
        title: "Error",
        description: "Failed to increment count",
        variant: "destructive",
      });
    },
  });

  // Decrement mutation with optimistic update
  const decrementMutation = useMutation({
    mutationFn: async (personId: string) => {
      const { error } = await supabase.from("events").insert({
        person_id: personId,
        delta: -1,
      });

      if (error) throw error;
    },
    onMutate: async (personId) => {
      await queryClient.cancelQueries({ queryKey: ["people-financials"] });
      const previousPeople = queryClient.getQueryData(["people-financials"]);

      queryClient.setQueryData(["people-financials"], (old: PersonFinancials[]) =>
        old.map((person) =>
          person.id === personId && person.cig_count > 0
            ? {
                ...person,
                cig_count: person.cig_count - 1,
                cig_total:
                  (person.cig_count - 1) *
                  (person.price_per_cig ?? settings?.default_price ?? 12),
                grand_total:
                  (person.cig_count - 1) *
                  (person.price_per_cig ?? settings?.default_price ?? 12) +
                  person.loans_total,
              }
            : person
        )
      );

      return { previousPeople };
    },
    onError: (error, variables, context) => {
      if (context?.previousPeople) {
        queryClient.setQueryData(["people-financials"], context.previousPeople);
      }
      toast({
        title: "Error",
        description: "Failed to decrement count",
        variant: "destructive",
      });
    },
  });

  // Update person price mutation
  const updatePriceMutation = useMutation({
    mutationFn: async ({
      personId,
      price,
    }: {
      personId: string;
      price: number | null;
    }) => {
      const { error } = await supabase
        .from("people")
        .update({ price_per_cig: price })
        .eq("id", personId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people-financials"] });
      queryClient.invalidateQueries({ queryKey: ["global-receivable"] });
    },
  });

  // Update global price mutation
  const updateGlobalPriceMutation = useMutation({
    mutationFn: async (price: number) => {
      const { error } = await supabase
        .from("settings")
        .update({ default_price: price })
        .eq("id", "global");

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["people-financials"] });
      queryClient.invalidateQueries({ queryKey: ["global-receivable"] });
      toast({
        title: "Success",
        description: "Global price updated",
      });
    },
  });

  // Delete person mutation
  const deletePersonMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("people")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;
    },
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["people-financials"] });
      const previousPeople = queryClient.getQueryData(["people-financials"]);

      queryClient.setQueryData(
        ["people-financials"],
        (old: PersonFinancials[] | undefined) =>
          old?.filter((p) => p.id !== id) || []
      );

      return { previousPeople };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people-financials"] });
      queryClient.invalidateQueries({ queryKey: ["global-receivable"] });
      toast({
        title: "Success",
        description: "Person deleted",
      });
    },
    onError: (_error, _id, context) => {
      if (context?.previousPeople) {
        queryClient.setQueryData(["people-financials"], context.previousPeople);
      }
      toast({
        title: "Error",
        description: "Failed to delete person",
        variant: "destructive",
      });
    },
  });

  const handleDeletePerson = (id: string, name: string) => {
    setPersonToDelete({ id, name });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (personToDelete) {
      deletePersonMutation.mutate(personToDelete.id);
      setDeleteDialogOpen(false);
      setPersonToDelete(null);
    }
  };

  const filteredPeople = people.filter((person) =>
    person.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-7xl mx-auto px-4 py-8 md:px-8 md:py-12">
        {/* Header */}
        <div className="mb-10 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="space-y-2">
              <h1 className="text-5xl md:text-6xl font-heading font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Mamu
              </h1>
              <p className="text-lg text-muted-foreground">Track cigarettes and manage loans with ease</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <AddPersonDialog
                onAdd={async (name, priceOverride) => {
                  await addPersonMutation.mutateAsync({ name, priceOverride });
                }}
                defaultPrice={settings?.default_price ?? 12}
              />
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Total Getting Back */}
            <div className="stat-card bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Total Getting Back</p>
                  <p className="text-3xl font-heading font-bold text-primary tabular-nums">
                    {formatCurrency(globalReceivable?.total_receivable || 0)}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
              </div>
            </div>

            {/* Active Customers */}
            <div className="stat-card bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Active Customers</p>
                  <p className="text-3xl font-heading font-bold text-foreground tabular-nums">
                    {filteredPeople.length}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-accent" />
                </div>
              </div>
            </div>

            {/* Default Price */}
            <div className="stat-card bg-gradient-to-br from-success/10 to-success/5 border-success/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Default Price</p>
                  <p className="text-3xl font-heading font-bold text-foreground tabular-nums">
                    {formatCurrency(settings?.default_price || 0)}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center">
                  <IndianRupee className="h-6 w-6 text-success" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Settings */}
        <div className="flex flex-col lg:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
            <Input
              type="text"
              placeholder="Search customers by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 text-base border-2 focus:border-primary rounded-xl"
            />
          </div>
          
          <div className="flex gap-3 items-center bg-card p-4 rounded-xl border-2 shadow-sm">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <SettingsIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-muted-foreground">Default Price</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={globalPrice}
                    onChange={(e) => setGlobalPrice(e.target.value)}
                    className="w-24 h-9 font-semibold"
                    step="0.01"
                  />
                  <Button 
                    size="sm"
                    onClick={() => {
                      const price = parseFloat(globalPrice);
                      if (!isNaN(price)) {
                        updateGlobalPriceMutation.mutate(price);
                      }
                    }}
                    disabled={updateGlobalPriceMutation.isPending}
                    className="h-9"
                  >
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* People Grid */}
        {isLoading ? (
          <div className="text-center py-20">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
            <p className="text-muted-foreground">Loading customers...</p>
          </div>
        ) : filteredPeople.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-4">
              <Users className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-heading font-semibold mb-2">No customers yet</h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery ? "No customers match your search" : "Add your first customer to start tracking"}
            </p>
            {!searchQuery && (
              <AddPersonDialog
                onAdd={async (name, priceOverride) => {
                  await addPersonMutation.mutateAsync({ name, priceOverride });
                }}
                defaultPrice={settings?.default_price ?? 12}
              />
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
            {filteredPeople.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                defaultPrice={settings?.default_price ?? 12}
                onIncrement={(id) => incrementMutation.mutate(id)}
                onDecrement={(id) => decrementMutation.mutate(id)}
                onPriceUpdate={(id, price) =>
                  updatePriceMutation.mutate({ personId: id, price })
                }
                onNameClick={(id) => navigate(`/person/${id}`)}
                onDelete={handleDeletePerson}
              />
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Person</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {personToDelete?.name}? This will hide their record and all associated history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDelete} 
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default Index;
