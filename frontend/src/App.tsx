// Written with help from Claude Code (Opus 5.5) (AI assistant). Reviewed and tested by Ryan Griffiths. See frontend/README.md → "AI assistance".
//
// (CHUD-54): The navigation menu
// #/activity/<id> (the activity log filtered to one record) was added for the history panel (CHUD-57)
// with help from Claude Code (Opus 5.5) (AI assistant). Reviewed and tested by Rachel.
import { Fragment, useEffect, useState } from "react";
import AppShell from "./components/AppShell";
import { findScreen } from "./screens";

// Which screen to show comes from the address bar, so a link like #/entity/5 opens entity 5
// (the activity log links each entry to its record this way, CHUD-38).
// The browser's back and forward buttons change the address too, so they work the same way.
// The screens and their addresses are listed in screens.tsx.
export default function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const { active, content } = findScreen(hash);

  return (
    <AppShell active={active}>
      {/* key: a new address (a different id, for example) loads a fresh screen */}
      <Fragment key={hash}>{content}</Fragment>
    </AppShell>
  );
}
