import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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

function AppRoutes() {
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

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <AuthPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/aanmelden" element={<ProtectedRoute><AppLayout><AanmeldenPublicPage /></AppLayout></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute><AppLayout><Index /></AppLayout></ProtectedRoute>} />
      <Route path="/clienten" element={<ProtectedRoute><AppLayout><ClientenPage /></AppLayout></ProtectedRoute>} />
      <Route path="/clienten/:id" element={<ProtectedRoute><AppLayout><ClientDetailPage /></AppLayout></ProtectedRoute>} />
      <Route path="/aanmeldingen" element={<ProtectedRoute><AppLayout><AanmeldingenPage /></AppLayout></ProtectedRoute>} />
      <Route path="/programmas" element={<ProtectedRoute><AppLayout><ProgrammasPage /></AppLayout></ProtectedRoute>} />
      <Route path="/scholen" element={<ProtectedRoute><AppLayout><ScholenPage /></AppLayout></ProtectedRoute>} />
      <Route path="/medewerkers" element={<ProtectedRoute><AppLayout><MedewerkersPage /></AppLayout></ProtectedRoute>} />
      <Route path="/rapportages" element={<ProtectedRoute><AppLayout><RapportagesPage /></AppLayout></ProtectedRoute>} />
      <Route path="/documenten" element={<ProtectedRoute><AppLayout><DocumentenPage /></AppLayout></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppErrorBoundary>
          <AppRoutes />
        </AppErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
