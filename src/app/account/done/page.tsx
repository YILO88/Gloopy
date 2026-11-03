"use client";
// Back from Discord / Google: finish signing in, then carry on.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, ErrorNote, Page } from "@/components/AccountUI";
import { Gloop } from "@/components/Gloop";
import { finishSignIn } from "@/lib/client/account";

export default function Done() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    finishSignIn()
      .then((next) => next !== "redirecting" && router.replace(next))
      .catch((e) => setError((e as Error).message));
  }, [router]);
  return (
    <Page title="Signing in">
      <Card className="flex flex-col items-center gap-2 text-center">
        <Gloop id="lime" face={error ? "sad" : "happy"} size={80} className={error ? "" : "wobble"} />
        {error ? (
          <>
            <ErrorNote text={error} />
            <Link href="/account" className="btn mt-2 bg-lime px-4 py-1.5">
              Try again
            </Link>
          </>
        ) : (
          <p className="font-display text-xl font-extrabold">One moment…</p>
        )}
      </Card>
    </Page>
  );
}
