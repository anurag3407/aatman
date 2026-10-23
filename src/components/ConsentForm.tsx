"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Button, Card, LinkButton } from "./ui";

/** Age first: under-18s get the no-account mode (DPDP requires parental consent to process their data). */
export function ConsentForm({ signedIn }: { signedIn: boolean }) {
  const { m } = useI18n();
  const [age, setAge] = useState<"adult" | "minor" | null>(signedIn ? "adult" : null);

  if (age === null) {
    return (
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">{m.consent.ageQuestion}</legend>
        <Button variant="secondary" onClick={() => setAge("adult")}>
          {m.consent.adult}
        </Button>
        <Button variant="secondary" onClick={() => setAge("minor")}>
          {m.consent.minor}
        </Button>
      </fieldset>
    );
  }

  if (age === "minor") {
    return (
      <Card>
        <h2 className="font-semibold">{m.consent.minorTitle}</h2>
        <p className="text-muted">{m.consent.minorBody}</p>
        <LinkButton href="/checkin?mode=stateless">{m.consent.minorStart}</LinkButton>
        <Button variant="ghost" onClick={() => setAge(null)}>
          {m.common.back}
        </Button>
      </Card>
    );
  }

  return (
    <form method="post" action="/api/consent" className="flex flex-col gap-3">
      <Button type="submit">{m.consent.agree}</Button>
    </form>
  );
}
