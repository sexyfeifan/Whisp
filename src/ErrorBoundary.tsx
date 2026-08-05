import React from "react";

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          height: "100vh", background: "#1a1a1a", color: "#fff", fontFamily: "system-ui", padding: "2rem"
        }}>
          <h2 style={{ marginBottom: "1rem", fontSize: "1.2rem" }}>Something went wrong</h2>
          <pre style={{
            background: "#2a2a2a", padding: "1rem", borderRadius: "8px", fontSize: "0.8rem",
            maxWidth: "600px", overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all"
          }}>
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); }}
            style={{
              marginTop: "1rem", padding: "0.5rem 1.5rem", background: "#4a9eff",
              color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer"
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
