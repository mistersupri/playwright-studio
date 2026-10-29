import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <main className="grid h-full place-items-center p-6">
      <div className="text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-xl font-semibold">There is nothing at this address.</h1>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/">Back to the workbench</Link>
        </Button>
      </div>
    </main>
  );
}
