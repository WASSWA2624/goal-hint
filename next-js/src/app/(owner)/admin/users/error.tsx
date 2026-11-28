"use client";

import { Button } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/feedback";

export default function AdminUsersError({ retry }: { error: unknown; retry: () => void }) {
  return <section aria-label="Users" data-user-workspace-error>
    <div role="alert">
      <EmptyState title="Users could not be loaded"
        description="Try loading the Users workspace again."
        action={<Button type="button" onClick={retry}>Try again</Button>} />
    </div>
  </section>;
}
