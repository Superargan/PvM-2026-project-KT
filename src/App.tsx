import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import AuthPage from "./pages/AuthPage";
import Index from "./pages/Index";
import ClientenPage from "./pages/ClientenPage";
import AanmeldingenPage from "./pages/AanmeldingenPage";
import ProgrammasPage from "./pages/ProgrammasPage";
import ScholenPage from "./pages/ScholenPage";
import MedewerkersPage from "./pages/MedewerkersPage";
import DocumentenPage from "./pages/DocumentenPage";
import AanmeldenPublicPage from "./pages/AanmeldenPublicPage";
import RapportagesPage from "./pages/RapportagesPage";
import ClientDetailPage from "./pages/ClientDetailPage";
import ProgramDetailPage from "./pages/ProgramDetailPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import PlanningPage from "./pages/PlanningPage";
import WachtlijstPage from "./pages/WachtlijstPage";
import TrainingslocatiesPage from "./pages/TrainingslocatiesPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 300_000,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary font-display text-lg font-black text-primary-foreground animate-pulse">
          K
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RootLayout() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary font-display text-lg font-black text-primary-foreground animate-pulse">
          K
        </div>
      </div>
    );
  }

  return <Outlet />;
}

function LoginRoute() {
  const { session } = useAuth();
  if (session) return <Navigate to="/" replace />;
  return <AuthPage />;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <ProtectedRoute><AppLayout><Index /></AppLayout></ProtectedRoute> },
      { path: "login", element: <LoginRoute /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
      { path: "aanmelden", element: <ProtectedRoute><AppLayout><AanmeldenPublicPage /></AppLayout></ProtectedRoute> },
      { path: "clienten", element: <ProtectedRoute><AppLayout><ClientenPage /></AppLayout></ProtectedRoute> },
      { path: "clienten/:id", element: <ProtectedRoute><AppLayout><ClientDetailPage /></AppLayout></ProtectedRoute> },
      { path: "aanmeldingen", element: <ProtectedRoute><AppLayout><AanmeldingenPage /></AppLayout></ProtectedRoute> },
      { path: "wachtlijst", element: <ProtectedRoute><AppLayout><WachtlijstPage /></AppLayout></ProtectedRoute> },
      { path: "programmas", element: <ProtectedRoute><AppLayout><ProgrammasPage /></AppLayout></ProtectedRoute> },
      { path: "planning", element: <ProtectedRoute><AppLayout><PlanningPage /></AppLayout></ProtectedRoute> },
      { path: "programmas/:id", element: <ProtectedRoute><AppLayout><ProgramDetailPage /></AppLayout></ProtectedRoute> },
      { path: "scholen", element: <ProtectedRoute><AppLayout><ScholenPage /></AppLayout></ProtectedRoute> },
      { path: "trainingslocaties", element: <ProtectedRoute><AppLayout><TrainingslocatiesPage /></AppLayout></ProtectedRoute> },
      { path: "medewerkers", element: <ProtectedRoute><AppLayout><MedewerkersPage /></AppLayout></ProtectedRoute> },
      { path: "rapportages", element: <ProtectedRoute><AppLayout><RapportagesPage /></AppLayout></ProtectedRoute> },
      { path: "documenten", element: <ProtectedRoute><AppLayout><DocumentenPage /></AppLayout></ProtectedRoute> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppErrorBoundary>
        <RouterProvider router={router} />
      </AppErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
