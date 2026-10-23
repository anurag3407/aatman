import { ChatView } from "@/components/ChatView";
import { Banner, LinkButton, Page, PageTitle } from "@/components/ui";
import { requireStudentPage } from "@/lib/auth/guards";
import { getMessages } from "@/lib/i18n/server";
import { llmAvailable } from "@/lib/llm";

export default async function ChatPage() {
  await requireStudentPage();
  const { m } = await getMessages();
  return (
    <Page>
      <PageTitle sub={m.chat.intro}>{m.chat.title}</PageTitle>
      {llmAvailable() ? (
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
