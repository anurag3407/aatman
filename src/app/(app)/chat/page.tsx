import { ChatView } from "@/components/ChatView";
import { Banner, LinkButton, Page, PageTitle } from "@/components/ui";
import { requireStudentPage } from "@/lib/auth/guards";
import { getMessages } from "@/lib/i18n/server";
import { llmAvailable } from "@/lib/llm";

export default async function ChatPage() {
  await requireStudentPage();
  const { m } = await getMessages();
  const available = llmAvailable();
  return (
    <Page>
      <PageTitle eyebrow={m.common.appName} sub={available ? undefined : m.chat.intro}>
        {m.chat.title}
      </PageTitle>
      {available ? (
        <ChatView />
      ) : (
        <>
          <Banner>{m.chat.unavailable}</Banner>
          <LinkButton href="/exercises" variant="secondary">
            {m.results.exercises.cta}
          </LinkButton>
        </>
      )}
    </Page>
  );
}
