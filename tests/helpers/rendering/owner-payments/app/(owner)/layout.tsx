import type { ReactNode } from "react";
import OwnerLayout from "@/app/(owner)/layout";
import { seed } from "../fixture";

/** Exercise the actual persistent owner layout over synthetic, process-local services. */
export default function Layout({ children }: { children: ReactNode }) {
  seed();
  return <OwnerLayout>{children}</OwnerLayout>;
}
