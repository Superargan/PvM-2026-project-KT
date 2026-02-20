import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import Index from "./pages/Index";
import ClientenPage from "./pages/ClientenPage";
import AanmeldingenPage from "./pages/AanmeldingenPage";
import ProgrammasPage from "./pages/ProgrammasPage";
import ScholenPage from "./pages/ScholenPage";
import MedewerkersPage from "./pages/MedewerkersPage";
import DocumentenPage from "./pages/DocumentenPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout><Index /></AppLayout>} />
          <Route path="/clienten" element={<AppLayout><ClientenPage /></AppLayout>} />
          <Route path="/aanmeldingen" element={<AppLayout><AanmeldingenPage /></AppLayout>} />
          <Route path="/programmas" element={<AppLayout><ProgrammasPage /></AppLayout>} />
          <Route path="/scholen" element={<AppLayout><ScholenPage /></AppLayout>} />
          <Route path="/medewerkers" element={<AppLayout><MedewerkersPage /></AppLayout>} />
          <Route path="/documenten" element={<AppLayout><DocumentenPage /></AppLayout>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
