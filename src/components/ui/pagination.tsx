import * as React from "react";
import { cn } from "@/lib/utils";

const Pagination = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center justify-center gap-2", className)}
    {...props}
  />
));
Pagination.displayName = "Pagination";

export { Pagination }; 