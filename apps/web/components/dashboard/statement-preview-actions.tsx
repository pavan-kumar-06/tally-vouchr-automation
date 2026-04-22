"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { api } from "@/lib/api-client";

type Props = {
  companyId: string;
  statementId: string;
  status: string;
  passwordProtected: boolean;
};

export function StatementPreviewActions({ companyId, statementId, status, passwordProtected }: Props) {
  const router = useRouter();
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const v = sessionStorage.getItem(`stmt_pdf_pwd:${statementId}`);
      if (v) setPwd(v);
    } catch {
      /* */
    }
  }, [statementId]);

  if (status === "PROCESSING") {
    return (
      <div className="mt-8 flex items-center gap-2 text-amber-700">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="font-medium">Extraction in progress… refresh the banking page in a moment.</span>
      </div>
    );
  }

  if (status === "REVIEW") {
    return (
      <div className="mt-8 space-y-3">
        <p className="text-sm text-mint-700">Extraction finished. Open the review screen to map ledgers.</p>
        <Link href={`/companies/${companyId}/statements/${statementId}/review`}>
          <Button type="button" className="bg-brand-600 hover:bg-brand-700">
            Review transactions
          </Button>
        </Link>
      </div>
    );
  }

  if (status === "SYNCED") {
    return <p className="mt-8 text-sm text-slate-600">This statement is already synced to Tally.</p>;
  }

  if (status === "FAILED") {
    return (
      <div className="mt-8 space-y-3">
        <p className="text-sm text-red-600">Last extraction failed. Fix the issue and try again.</p>
        <ExtractForm
          companyId={companyId}
          statementId={statementId}
          passwordProtected={passwordProtected}
          pwd={pwd}
          setPwd={setPwd}
          busy={busy}
          setBusy={setBusy}
          err={err}
          setErr={setErr}
          router={router}
        />
      </div>
    );
  }

  if (status !== "UPLOADED") {
    return <p className="mt-8 text-sm text-slate-600">This document is not waiting for extraction.</p>;
  }

  return (
    <ExtractForm
      companyId={companyId}
      statementId={statementId}
      passwordProtected={passwordProtected}
      pwd={pwd}
      setPwd={setPwd}
      busy={busy}
      setBusy={setBusy}
      err={err}
      setErr={setErr}
      router={router}
    />
  );
}

function ExtractForm({
  companyId,
  statementId,
  passwordProtected,
  pwd,
  setPwd,
  busy,
  setBusy,
  err,
  setErr,
  router
}: {
  companyId: string;
  statementId: string;
  passwordProtected: boolean;
  pwd: string;
  setPwd: (v: string) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  err: string | null;
  setErr: (v: string | null) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const start = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api.processStatement(statementId, passwordProtected ? pwd.trim() : undefined);
      try {
        sessionStorage.removeItem(`stmt_pdf_pwd:${statementId}`);
      } catch {
        /* */
      }
      router.push(`/companies/${companyId}/banking`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start extraction";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 space-y-4">
      {passwordProtected && (
        <div>
          <Label htmlFor="preview-pwd">PDF password</Label>
          <Input
            id="preview-pwd"
            type="password"
            autoComplete="off"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="Same password you used at upload"
            className="mt-1.5"
          />
        </div>
      )}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button
        type="button"
        disabled={busy || (passwordProtected && !pwd.trim())}
        className="bg-brand-600 hover:bg-brand-700"
        onClick={() => void start()}
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting…
          </>
        ) : (
          "Start AI extraction"
        )}
      </Button>
    </div>
  );
}
