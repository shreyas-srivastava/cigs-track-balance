import { useEffect, useState } from "react";
import { X, Undo2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Event {
  id: string;
  delta: number;
  created_at: string;
}

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  personId: string | null;
  personName: string;
}

export function HistoryDrawer({
  open,
  onClose,
  personId,
  personName,
}: HistoryDrawerProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (personId && open) {
      loadEvents();
    }
  }, [personId, open]);

  const loadEvents = async () => {
    if (!personId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("person_id", personId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error("Failed to load events:", error);
      toast({
        title: "Error",
        description: "Failed to load history",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUndo = async (eventId: string, createdAt: string) => {
    const eventTime = new Date(createdAt);
    const now = new Date();
    const diffSeconds = (now.getTime() - eventTime.getTime()) / 1000;

    if (diffSeconds > 10) {
      toast({
        title: "Cannot undo",
        description: "This action is older than 10 seconds",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from("events").delete().eq("id", eventId);

      if (error) throw error;

      toast({
        title: "Undone",
        description: "Action has been reversed",
      });

      loadEvents();
    } catch (error) {
      console.error("Failed to undo:", error);
      toast({
        title: "Error",
        description: "Failed to undo action",
        variant: "destructive",
      });
    }
  };

  const canUndo = (createdAt: string) => {
    const eventTime = new Date(createdAt);
    const now = new Date();
    const diffSeconds = (now.getTime() - eventTime.getTime()) / 1000;
    return diffSeconds <= 10;
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>History - {personName}</SheetTitle>
          <SheetDescription>
            Recent cigarette count changes
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Loading...
            </p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No history yet
            </p>
          ) : (
            events.map((event, index) => (
              <div
                key={event.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`font-bold text-lg ${
                      event.delta > 0 ? "text-accent" : "text-destructive"
                    }`}
                  >
                    {event.delta > 0 ? "+" : ""}
                    {event.delta}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(event.created_at), {
                      addSuffix: true,
                    })}
                  </div>
                </div>

                {index === 0 && canUndo(event.created_at) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUndo(event.id, event.created_at)}
                    className="gap-1"
                  >
                    <Undo2 className="h-3 w-3" />
                    Undo
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
