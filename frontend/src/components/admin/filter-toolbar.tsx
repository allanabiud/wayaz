import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export function FilterToolbar({
  search,
  filters,
  trailing,
}: {
  search: ReactNode;
  filters?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {search}
      {filters}
      {trailing && (
        <div className="ml-auto flex items-center gap-2">{trailing}</div>
      )}
    </div>
  );
}

export function FilterSearch({
  value,
  onValueChange,
  placeholder,
  onSubmit,
  onClear,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  onClear?: () => void;
}) {
  const handleClear = () => {
    if (onClear) onClear();
    else onValueChange("");
  };

  const field = (
    <>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onBlur={onSubmit}
        placeholder={placeholder}
        className="pl-9 pr-8 h-9 text-xs"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={handleClear}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </>
  );

  const className = "relative min-w-[200px] flex-1 sm:max-w-xs";

  if (!onSubmit) {
    return <div className={className}>{field}</div>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={className}
    >
      {field}
    </form>
  );
}
