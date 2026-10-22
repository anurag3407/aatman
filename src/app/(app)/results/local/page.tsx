import { LocalResults } from "@/components/results/LocalResults";
import { Page } from "@/components/ui";

/** Stateless (under-18) and offline results, read from sessionStorage in the browser. */
export default function LocalResultsPage() {
  return (
    <Page width="wide">
      <LocalResults />
    </Page>
  );
}
