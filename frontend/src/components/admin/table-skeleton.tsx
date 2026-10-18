import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";

export interface ColumnSkeletonDef {
  header?: string;
  width?: string;
  align?: "left" | "right" | "center";
}

export function TableSkeleton({
  columns,
  rowCount = 8,
}: {
  columns: ColumnSkeletonDef[];
  rowCount?: number;
}) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {/* Desktop Table Skeleton */}
      <div className="hidden rounded-2xl bg-card shadow-(--shadow-card) overflow-hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              {columns.map((col, idx) => (
                <TableHead
                  key={idx}
                  className={`text-xs font-semibold ${col.width ?? ""} ${
                    col.align === "right" ? "text-right" : ""
                  }`}
                >
                  {col.header ? (
                    <span>{col.header}</span>
                  ) : (
                    <Skeleton className="h-4 w-16" />
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rowCount }).map((_, rowIdx) => (
              <TableRow key={rowIdx} className="hover:bg-muted/30">
                {columns.map((col, colIdx) => {
                  const isRight = col.align === "right";
                  return (
                    <TableCell key={colIdx} className={col.width ?? ""}>
                      <div
                        className={`space-y-1.5 ${
                          isRight ? "flex flex-col items-end" : ""
                        }`}
                      >
                        <Skeleton
                          className={`h-4 ${
                            colIdx === 0
                              ? "w-28"
                              : colIdx === 1
                                ? "w-36"
                                : isRight
                                  ? "w-20"
                                  : "w-24"
                          }`}
                        />
                        {colIdx < 2 && (
                          <Skeleton className="h-3 w-20 opacity-70" />
                        )}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards Skeleton */}
      <div className="md:hidden space-y-3">
        {Array.from({ length: Math.min(4, rowCount) }).map((_, idx) => (
          <Card key={idx} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="border-t pt-2 flex items-center justify-between">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
