import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Dices } from "lucide-react";

const DICE = [4, 6, 8, 10, 12, 20, 100];

const DiceRoller = () => {
  const [last, setLast] = useState<{ d: number; roll: number } | null>(null);

  const roll = (d: number) => {
    const r = 1 + Math.floor(Math.random() * d);
    setLast({ d, roll: r });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Dices className="mr-2 h-4 w-4" />
          {last ? `d${last.d}: ${last.roll}` : "Roll"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56">
        <div className="grid grid-cols-4 gap-2">
          {DICE.map((d) => (
            <Button key={d} variant="secondary" size="sm" onClick={() => roll(d)}>
              d{d}
            </Button>
          ))}
        </div>
        {last && (
          <p className="mt-3 text-center font-display text-2xl text-gradient-ember">
            {last.roll}
            <span className="ml-1 text-xs text-muted-foreground">/ d{last.d}</span>
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default DiceRoller;