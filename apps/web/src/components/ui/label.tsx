"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `required`/`optional` render a consistent marker next to any label in the
 * app (asterisk + sr-only "required" text, or a muted "(optional)" suffix) —
 * a single primitive change so every field gets the same treatment instead
 * of ad hoc copy per form.
 */
function Label({
  className,
  required,
  optional,
  children,
  ...props
}: React.ComponentProps<"label"> & { required?: boolean; optional?: boolean }) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {required && (
        <>
          <span aria-hidden="true" className="text-destructive">*</span>
          <span className="sr-only"> required</span>
        </>
      )}
      {optional && <span className="text-xs font-normal text-muted-foreground">(optional)</span>}
    </label>
  )
}

export { Label }
