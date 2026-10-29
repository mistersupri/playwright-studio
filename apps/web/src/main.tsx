import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";
import { applyTheme, useTheme } from "@/lib/theme";
import { LoginPage } from "@/routes/login";
import { RequireAuth } from "@/routes/require-auth";
import { NotFoundPage } from "@/routes/not-found";
import "./index.css";

// The workbench carries Monaco; keep it out of the sign-in bundle.
const WorkbenchPage = lazy(() => import("@/routes/workbench").then((m) => ({ default: m.WorkbenchPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && [401, 403, 404].includes(err.status)) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <Suspense fallback={null}>
          <WorkbenchPage />
        </Suspense>
      </RequireAuth>
    ),
  },
  { path: "*", element: <NotFoundPage /> },
]);

function ThemeSync() {
  const theme = useTheme((s) => s.theme);
  useEffect(() => applyTheme(theme), [theme]);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={400} skipDelayDuration={300}>
        <ThemeSync />
        <RouterProvider router={router} />
        <Toaster position="bottom-right" mobileOffset={{ bottom: 76 }} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
