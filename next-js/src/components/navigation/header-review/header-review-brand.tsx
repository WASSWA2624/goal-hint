"use client";

import { HeaderBrand } from "@/components/ui/brand";

/** The gallery shares the approved production artwork while retaining each option's explicit scale. */
export function HeaderReviewBrand({ height = 20 }: { height?: number }) {
  return <HeaderBrand height={height} />;
}
