import { notFound } from "next/navigation";
import { ResultsView } from "@/components/results/ResultsView";
import { Page } from "@/components/ui";
import { requireStudentPage } from "@/lib/auth/guards";
import { getCheckin } from "@/lib/services/checkins";

export default async function ResultsPage({ params }: PageProps<"/results/[id]">) {
  const session = await requireStudentPage();
  const { id } = await params;
  const checkin = await getCheckin(session.sub, id);
  if (!checkin) notFound();

  return (
    <Page>
      <ResultsView
        mode="saved"
        checkinId={checkin.id}
        createdAt={checkin.createdAt.toISOString()}
        triage={checkin.triage}
        campus={checkin.campus}
        initialSummary={checkin.summary}
      />
    </Page>
  );
}
