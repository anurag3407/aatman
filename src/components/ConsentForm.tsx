"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Button, Card, Choice, LinkButton } from "./ui";

/** Age first: under-18s get the no-account mode (DPDP requires parental consent to process their data). */
export function ConsentForm({ signedIn }: { signedIn: boolean }) {
  const { m } = useI18n();
  const [age, setAge] = useState<"adult" | "minor" | null>(signedIn ? "adult" : null);

  if (age === null) {
    return (
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-serif text-[1.25rem] font-medium">{m.consent.ageQuestion}</legend>
        <Choice onClick={() => setAge("adult")}>{m.consent.adult}</Choice>
        <Choice onClick={() => setAge("minor")}>{m.consent.minor}</Choice>
      </fieldset>
    );
  }

  if (age === "minor") {
    return (
      <Card className="animate-rise">
        <h2 className="font-serif text-[1.2rem] font-medium">{m.consent.minorTitle}</h2>
        <p className="text-muted">{m.consent.minorBody}</p>
        <LinkButton href="/checkin?mode=stateless">{m.consent.minorStart}</LinkButton>
        <Button variant="ghost" className="self-start" onClick={() => setAge(null)}>
          {m.common.back}
        </Button>
      </Card>
    );
  }

  return (
    <form method="post" action="/api/consent" className="animate-rise flex flex-col gap-3">
      <Button type="submit" className="w-full">
        {m.consent.agree}
      </Button>
    </form>
  );
}
