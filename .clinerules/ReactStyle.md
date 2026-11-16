<!-- AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. -->
# React style (frontend/)

Applies to everything under `frontend/src/`. Match the code that is already there; do not introduce a new pattern.

- You must write function components with hooks. Never write class components.
- You must use TypeScript with explicit prop types (`type Props = { ... }`). Never use `any`.
- You must style with Tailwind classes and the colors defined in `frontend/src/index.css` (`ink`, `canvas`, `brand`, `brand-hover`, `brand-strong`, `line`, `muted`). Never hard-code a new hex color and never add a CSS framework or component library.
- You must reuse the shared pieces in `frontend/src/components/ui.tsx` (`PageHeader`, `Card`, `Button`, `SavedPill`, `ErrorBanner`, `FlaggedBanner`) before writing a new one. Screens must match the approved Figma mockups.
- You must validate user input with the zod schemas in `frontend/src/lib/validation.ts`. Add a rule there instead of checking fields inside a component.
- Keep one component per file, named like the file, in `components/` (reusable) or `pages/` (whole screens). Keep a component small: move data loading and formatting into `lib/`.
- Every input needs a visible label. Buttons and links need an accessible name. Never rely on color alone to show a state.
- Show "Not Found" instead of leaving a value blank (project charter 2.3 e.v).
- Never add a delete button, a delete function, or a "remove record" option. Records are flagged as no longer valid and stay in the database (charter 2.3 f.iv).
- Never add a dependency without asking the developer first.
