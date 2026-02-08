import { useState } from "react";
import { Minus, Plus, Edit2, Check, IndianRupee, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/currency";

interface PersonCardProps {
  person: {
    id: string;
    name: string;
    price_per_cig: number | null;
    cig_count: number;
    eff_price_per_cig: number;
    cig_total: number;
    loans_total: number;
    repayments_total: number;
    grand_total: number;
  };
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onPriceUpdate: (id: string, price: number | null) => void;
  onNameClick: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  defaultPrice: number;
}

export function PersonCard({
  person,
  onIncrement,
  onDecrement,
  onPriceUpdate,
  onNameClick,
  onDelete,
}: PersonCardProps) {
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [editPrice, setEditPrice] = useState(
    person.price_per_cig?.toString() || ""
  );

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingPrice(true);
  };

  const handleSavePrice = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newPrice = editPrice === "" ? null : parseFloat(editPrice);
    if (newPrice === null || !isNaN(newPrice)) {
      onPriceUpdate(person.id, newPrice);
      setIsEditingPrice(false);
    }
  };

  return (
    <Card className="group relative overflow-hidden hover-lift cursor-pointer border-2 transition-all duration-300 hover:border-primary/50" onClick={() => onNameClick(person.id)}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-2xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-2xl font-heading truncate group-hover:text-primary transition-colors">
              {person.name}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                <IndianRupee className="h-3 w-3 text-primary" />
              </div>
              {isEditingPrice ? (
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Input
                    type="number"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="h-8 w-24 font-medium"
                    step="0.01"
                    autoFocus
                  />
                  <Button size="sm" onClick={handleSavePrice} className="h-8 px-3">
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={handleEditClick}
                  className="font-medium hover:text-primary transition-colors flex items-center gap-1.5"
                >
                  {formatCurrency(person.eff_price_per_cig)}/pc
                  <Edit2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(person.id, person.name);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Count Display */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl">
          <span className="text-sm font-medium text-muted-foreground">Cigarette Count</span>
          <span className="text-3xl font-heading font-bold tabular-nums">{person.cig_count}</span>
        </div>

        {/* Financial Breakdown */}
        <div className="space-y-3 bg-gradient-to-br from-muted/30 to-muted/10 p-4 rounded-xl">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Cigarettes</span>
            <span className="font-semibold tabular-nums">{formatCurrency(person.cig_total)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Loans</span>
            <span className="font-semibold tabular-nums">{formatCurrency(person.loans_total)}</span>
          </div>
          {person.repayments_total > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-success">Repaid</span>
              <span className="font-semibold tabular-nums text-success">−{formatCurrency(person.repayments_total)}</span>
            </div>
          )}
          <Separator className="my-2" />
          <div className="flex justify-between items-center">
            <span className="font-semibold">Pending</span>
            <span className="text-2xl font-heading font-bold text-primary tabular-nums">
              {formatCurrency(person.grand_total)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-12 border-2 hover:border-destructive hover:text-destructive transition-all"
            onClick={() => onDecrement(person.id)}
            disabled={person.cig_count <= 0}
          >
            <Minus className="h-5 w-5 mr-1" />
            Remove
          </Button>
          <Button
            size="lg"
            className="flex-1 h-12 shadow-md hover:shadow-lg transition-all"
            onClick={() => onIncrement(person.id)}
          >
            <Plus className="h-5 w-5 mr-1" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}