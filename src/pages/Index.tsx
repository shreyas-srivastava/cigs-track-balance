import { useEffect, useState } from "react";
import { Search, Settings, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PersonCard } from "@/components/PersonCard";
import { AddPersonDialog } from "@/components/AddPersonDialog";
import { HistoryDrawer } from "@/components/HistoryDrawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  const [historyDrawer, setHistoryDrawer] = useState<{
    open: boolean;
    personId: string | null;
    personName: string;
  }>({ open: false, personId: null, personName: "" });
  const [globalPrice, setGlobalPrice] = useState("");
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

  const filteredPeople = people.filter((person) =>
    person.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            The new Mamu
          </h1>
          <p className="text-muted-foreground">
            Track cigarette usage and amounts owed
          </p>
        </div>

        {/* Total Receivable Pill */}
        {globalReceivable && (
          <div className="mb-6 flex justify-end">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                Total Getting Back:
              </span>
              <span className="text-lg font-bold text-primary">
                {formatCurrency(globalReceivable.total_receivable)}
              </span>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <AddPersonDialog
            onAdd={async (name, priceOverride) => {
              await addPersonMutation.mutateAsync({ name, priceOverride });
            }}
            defaultPrice={settings?.default_price ?? 12}
          />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Settings className="h-4 w-4" />
                Global Price
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Default Price</h4>
                  <p className="text-sm text-muted-foreground">
                    Set the default price per cigarette
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="global-price">Price (₹)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="global-price"
                      type="number"
                      step="0.01"
                      value={globalPrice}
                      onChange={(e) => setGlobalPrice(e.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        const price = parseFloat(globalPrice);
                        if (!isNaN(price)) {
                          updateGlobalPriceMutation.mutate(price);
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* People List */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Loading...
          </div>
        ) : filteredPeople.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {searchQuery
              ? "No people found matching your search"
              : "No people added yet. Click 'Add Person' to get started."}
          </div>
        ) : (
          <div className="grid gap-4">
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
                onOpenHistory={(id, name) =>
                  setHistoryDrawer({ open: true, personId: id, personName: name })
                }
                onNameClick={(id) => navigate(`/person/${id}`)}
              />
            ))}
          </div>
        )}

        {/* History Drawer */}
        <HistoryDrawer
          open={historyDrawer.open}
          onClose={() =>
            setHistoryDrawer({ open: false, personId: null, personName: "" })
          }
          personId={historyDrawer.personId}
          personName={historyDrawer.personName}
        />
      </div>
    </div>
  );
};

export default Index;
