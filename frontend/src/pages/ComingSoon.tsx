// Written with help from Claude Code (Opus 5.5) (AI assistant). Reviewed and tested by Ryan Griffiths. See frontend/README.md → "AI assistance".
//
// (CHUD-54): Stands in for a menu screen that has not been built yet
import { Card, PageHeader } from "../components/ui";

type Props = { title: string };

export default function ComingSoon({ title }: Props) {
  return (
    <div>
      <PageHeader crumbs={["Records", title]} title={title} subtitle="This screen is not built yet." />
      <Card title="Coming soon">
        <a href="#/records" className="text-sm font-medium text-brand-strong underline">
          Go to the records list
        </a>
      </Card>
    </div>
  );
}
