'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Filter } from 'lucide-react';

interface StoreFilterProps {
  stores: string[];
  selectedStore: string;
  onStoreChange: (store: string) => void;
}

export function StoreFilter({ stores, selectedStore, onStoreChange }: StoreFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground">
        <Filter className="h-4 w-4" />
      </span>
      <Select value={selectedStore} onValueChange={onStoreChange}>
        <SelectTrigger className="w-[200px] border-border/60 bg-background/60 backdrop-blur hover:border-primary/40">
          <SelectValue placeholder="Select store" />
        </SelectTrigger>
        <SelectContent className="border-border/60 bg-popover/95 backdrop-blur">
          <SelectItem value="all">All Stores</SelectItem>
          {stores.map((store) => (
            <SelectItem key={store} value={store}>
              {store}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
