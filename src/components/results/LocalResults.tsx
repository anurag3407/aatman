"use client";

import { useEffect, useState } from "react";
import { loadLocalResult, type LocalResult } from "@/lib/checkin/localResult";
import { useI18n } from "@/lib/i18n/client";
import { LinkButton } from "@/components/ui";
import { ResultsView } from "./ResultsView";

export function LocalResults() {
  const { m } = useI18n();
  const [result, setResult] = useState<LocalResult | null | undefined>(undefined);

  useEffect(() => {
    // Read after mount: sessionStorage doesn't exist during server rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(loadLocalResult());
  }, []);

  if (result === undefined) return <p className="text-muted">{m.common.loading}</p>;
  if (result === null) return <LinkButton href="/checkin?mode=stateless">{m.results.newCheckin}</LinkButton>;

  return (
    <ResultsView
      mode={result.reason}
      createdAt={result.createdAt}
      triage={result.triage}
      campus={result.campus}
      initialSummary={null}
    />
  );
}
