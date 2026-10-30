import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useMe } from "@/hooks/use-auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) {
    return (
      <div className="grid h-full place-items-center" role="status" aria-label="Loading">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-sm text-center">
          <p className="font-medium">The server did not answer.</p>
          <p className="mt-1 text-sm text-muted-foreground">{me.error.message}</p>
          <Button className="mt-4" variant="outline" onClick={() => me.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  if (!me.data) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} replace />;
  }
  return children;
}
