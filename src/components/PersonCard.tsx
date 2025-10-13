import { useState } from "react";
import { Minus, Plus, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/currency";

interface PersonCardProps {
  person: {
    id: string;
    name: string;
    price_per_cig: number | null;
    count: number;
    total: number;
  };
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onPriceUpdate: (id: string, price: number | null) => void;
  onOpenHistory: (id: string, name: string) => void;
  defaultPrice: number;
}

export function PersonCard({
  person,
  onIncrement,
  onDecrement,
  onPriceUpdate,
  onOpenHistory,
  defaultPrice,
}: PersonCardProps) {
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState(
    person.price_per_cig?.toString() || ""
  );

  const effectivePrice = person.price_per_cig ?? defaultPrice;

  const handlePriceSave = () => {
    const newPrice = priceInput === "" ? null : parseFloat(priceInput);
    if (newPrice === null || !isNaN(newPrice)) {
      onPriceUpdate(person.id, newPrice);
      setIsEditingPrice(false);
    }
  };

  return (
    <Card className="p-4 animate-slide-up hover:shadow-md transition-smooth">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg truncate">{person.name}</h3>
          <div className="flex items-center gap-2 mt-1">
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
                  className="w-20 h-7 text-sm"
                  autoFocus
                />
              </div>
            ) : (
              <button
                onClick={() => setIsEditingPrice(true)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ₹{effectivePrice.toFixed(2)}/pc
                {person.price_per_cig === null && " (default)"}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="number-emphasis">{person.count}</div>
            <div className="text-xs text-muted-foreground">pcs</div>
          </div>

          <div className="text-right">
            <div className="currency-display text-primary">
              {formatCurrency(person.total)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            onClick={() => onDecrement(person.id)}
            disabled={person.count <= 0}
            className="h-9 w-9 hover-lift"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="default"
            onClick={() => onIncrement(person.id)}
            className="h-9 w-9 hover-lift"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onOpenHistory(person.id, person.name)}
            className="h-9 w-9"
          >
            <History className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
