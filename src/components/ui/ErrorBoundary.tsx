import { Component, ReactNode } from "react";

/** Catches render crashes in a panel and shows a fallback instead of unmounting the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[Forge] ${this.props.label} panel crashed:`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-[#121214] px-6 py-8 text-center">
          <div className="text-xs font-semibold text-red-300">The {this.props.label} panel crashed</div>
          <div className="w-full truncate font-mono text-[10px] text-neutral-500" title={String(this.state.error?.stack || this.state.error)}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-1 rounded-md border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-medium text-neutral-200 hover:bg-white/[0.1]"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
