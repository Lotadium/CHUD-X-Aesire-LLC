// Refresh page (CHUD-33): start a refresh, show its progress, and report the result.
// Layout follows the Figma mockups "Screen 2 - Refresh", "Screen 2 - Refresh running (progress)"
// and the two pop-ups. AI use: written with help from Claude (Anthropic).
import { useEffect, useRef, useState } from "react";
import { Button, Card, ErrorBanner, PageHeader } from "../components/ui";
import RefreshResultDialog from "../components/RefreshResultDialog";
import { nextRefreshBatch, startRefresh } from "../lib/refreshApi";
import type { RefreshProgress } from "../lib/refreshApi";

type State =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "running"; progress: RefreshProgress }
  | { status: "failed"; progress: RefreshProgress | null; message: string }
  | { status: "finished"; progress: RefreshProgress; showDialog: boolean };

const percent = (p: RefreshProgress) => (p.total === 0 ? 100 : Math.floor((p.processed / p.total) * 100));

function ProgressBar({ progress }: { progress: RefreshProgress }) {
  const pct = percent(progress);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span>
          {progress.processed} of {progress.total} records processed
        </span>
        <span className="font-semibold text-brand-strong">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Refresh progress"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.processed}
        aria-valuetext={`${progress.processed} of ${progress.total} records processed`}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function RefreshPage() {
  const [state, setState] = useState<State>({ status: "idle" });
  // A ref (not state) so a double click can't start two runs
  const busy = useRef(false);
  // Stop asking for batches if the user leaves the page
  const unmounted = useRef(false);
  const attentionRef = useRef<HTMLDivElement>(null);
  const [showAttention, setShowAttention] = useState(false);

  // Reset on mount too: in development, React's StrictMode mounts, unmounts and remounts once
  useEffect(() => {
    unmounted.current = false;
    return () => { unmounted.current = true; };
  }, []);

  const running = state.status === "starting" || state.status === "running";

  // Warn before closing the tab or reloading while a refresh is running
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  // Keep asking for the next batch until the run is done (see src/lib/refreshApi.ts)
  async function drive(progress: RefreshProgress) {
    let current = progress;
    try {
      while (!current.done) {
        setState({ status: "running", progress: current });
        current = await nextRefreshBatch(current.run_id);
        if (unmounted.current) return;
      }
      setState({ status: "finished", progress: current, showDialog: true });
    } catch (err) {
      if (unmounted.current) return;
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setState({ status: "failed", progress: current, message });
    } finally {
      busy.current = false;
    }
  }

  async function begin() {
    if (busy.current) return;
    busy.current = true;
    setShowAttention(false);
    setState({ status: "starting" });
    let progress: RefreshProgress;
    try {
      progress = await startRefresh();
    } catch (err) {
      busy.current = false;
      if (unmounted.current) return;
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setState({ status: "failed", progress: null, message });
      return;
    }
    if (unmounted.current) return;
    await drive(progress);
  }

  // Pick up where a failed run stopped. Records already processed were saved, so they aren't redone.
  async function resume(progress: RefreshProgress) {
    if (busy.current) return;
    busy.current = true;
    await drive(progress);
  }

  function closeDialog(review: boolean) {
    if (state.status !== "finished") return;
    setState({ ...state, showDialog: false });
    if (review) {
      setShowAttention(true);
      // Wait for the section to render, then move focus to it (focusing also scrolls it into view)
      setTimeout(() => attentionRef.current?.focus(), 0);
    }
  }

  return (
    <div>
      <PageHeader crumbs={["Records", "Refresh"]} title="Refresh" subtitle="Re-check every record and fill in any missing information." />

      <div className="space-y-6">
        <RefreshCard state={state} onStart={begin} onResume={resume} />

        {state.status === "finished" && showAttention && state.progress.unverified.length > 0 && (
          <div ref={attentionRef} tabIndex={-1} className="scroll-mt-6 outline-none">
            {/* CHUD-37 (Jaden): the "N records need attention" list replaces this card.
                The records and reasons are in state.progress.unverified. */}
            <Card
              title={`${state.progress.unverified.length} ${state.progress.unverified.length === 1 ? "record needs" : "records need"} attention`}
              subtitle="Select a record to fix it by hand, then search again to update it."
            >
              <p className="text-sm text-muted">The review list is coming in CHUD-37.</p>
            </Card>
          </div>
        )}

        {/* "Missing information?" form. The Search + Update behavior is CHUD-37 (Jaden).
            Greyed out while a refresh is running, as in the mockup. */}
        <fieldset disabled={running} className={`transition-opacity ${running ? "opacity-50" : ""}`}>
          <Card
            title="Missing information?"
            subtitle="If a record couldn’t be completed automatically, enter its domain and entity name below, then search to update it."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Domain
                <input
                  type="text"
                  placeholder="e.g. example.com"
                  className="mt-1.5 block h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-normal placeholder:text-muted/70 disabled:bg-canvas"
                />
              </label>
              <label className="block text-sm font-medium">
                Entity’s name
                <input
                  type="text"
                  placeholder="e.g. Example Inc."
                  className="mt-1.5 block h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-normal placeholder:text-muted/70 disabled:bg-canvas"
                />
              </label>
            </div>
            <Button type="button" className="mt-4">
              Search + Update
            </Button>
          </Card>
        </fieldset>
      </div>

      {state.status === "finished" && state.showDialog && (
        <RefreshResultDialog
          total={state.progress.total}
          verified={state.progress.verified}
          updated={state.progress.updated}
          unverified={state.progress.unverified}
          onDone={() => closeDialog(false)}
          onReview={() => closeDialog(true)}
        />
      )}
    </div>
  );
}

// The top card: changes with the state of the run
function RefreshCard({ state, onStart, onResume }: { state: State; onStart: () => void; onResume: (p: RefreshProgress) => void }) {
  if (state.status === "idle") {
    return (
      <Card title="Refresh your records" subtitle="Click Refresh to re-check every record and automatically fill in any missing information. This may take a moment.">
        <Button type="button" onClick={onStart}>
          Refresh
        </Button>
      </Card>
    );
  }

  if (state.status === "starting" || state.status === "running") {
    const progress = state.status === "running" ? state.progress : null;
    return (
      <Card title="Refreshing your records…" subtitle="Please keep this page open until the refresh finishes.">
        <div aria-live="polite">
          {progress ? <ProgressBar progress={progress} /> : <p className="text-sm text-muted">Starting the refresh…</p>}
        </div>
        <Button type="button" variant="secondary" className="mt-5" disabled>
          Refreshing…
        </Button>
      </Card>
    );
  }

  if (state.status === "failed") {
    const p = state.progress;
    return (
      <Card title="The refresh stopped" subtitle={p ? `${p.processed} of ${p.total} records were processed before it stopped. Those updates were saved.` : "The refresh couldn’t start."}>
        <div className="space-y-4">
          <ErrorBanner text={state.message} />
          {p && <ProgressBar progress={p} />}
          <div className="flex flex-wrap gap-3">
            {p ? (
              <>
                <Button type="button" onClick={() => onResume(p)}>
                  Continue refresh
                </Button>
                <Button type="button" variant="secondary" onClick={onStart}>
                  Start over
                </Button>
              </>
            ) : (
              <Button type="button" onClick={onStart}>
                Try again
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  // Finished
  const { progress } = state;
  const failed = progress.unverified.length;
  return (
    <Card
      title="Refresh complete"
      subtitle={`${progress.verified} of ${progress.total} records verified${failed > 0 ? `, ${failed} ${failed === 1 ? "needs" : "need"} your attention` : ""}.`}
      aside={
        <Button type="button" variant="secondary" onClick={onStart}>
          Refresh again
        </Button>
      }
    >
      <ProgressBar progress={progress} />
    </Card>
  );
}
