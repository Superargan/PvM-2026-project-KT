import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export default class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("App runtime error:", error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <AlertTriangle className="h-5 w-5 text-foreground" />
            </div>
            <h1 className="font-display text-xl font-bold text-card-foreground">Preview tijdelijk onderbroken</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Er is een fout opgetreden. Herladen herstelt meestal direct de preview.
            </p>
            <Button className="mt-5 w-full" onClick={this.handleRetry}>
              <RefreshCw className="h-4 w-4" /> Opnieuw laden
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
