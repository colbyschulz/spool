import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/** Last-resort catch for render-time throws (e.g. canvas code) — avoids a silent white screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ padding: "2rem", textAlign: "center" }}>
          Something went wrong. Reload the page to continue.
        </div>
      );
    }
    return this.props.children;
  }
}
