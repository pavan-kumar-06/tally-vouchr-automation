"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

interface StatementUploaderProps {
  companyId: string;
  onUploadComplete?: () => void;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function StatementUploader({ companyId, onUploadComplete }: StatementUploaderProps) {
  const [bankOptions, setBankOptions] = useState<string[]>([]);
  const [bankSource, setBankSource] = useState<"BANK_PARENT" | "ALL_UNTAGGED" | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [bankLedgerName, setBankLedgerName] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [filePassword, setFilePassword] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { data: session } = authClient.useSession();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/companies/${companyId}/bank-ledgers`);
        if (!res.ok) return;
        const data = (await res.json()) as { names: string[]; source: "BANK_PARENT" | "ALL_UNTAGGED" };
        if (!cancelled) {
          setBankOptions(data.names ?? []);
          setBankSource(data.source ?? null);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const resetForm = () => {
    setPendingFile(null);
    setBankLedgerName("");
    setPeriodFrom("");
    setPeriodTo("");
    setPasswordProtected(false);
    setFilePassword("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runUpload = useCallback(
    async (file: File, opts: { skipDuplicateModal: boolean }) => {
      if (!session?.user) return;

      if (!opts.skipDuplicateModal) {
        const dupRes = await fetch(
          `/api/companies/${companyId}/statements/duplicate-check?filename=${encodeURIComponent(file.name)}`
        );
        if (dupRes.ok) {
          const dup = (await dupRes.json()) as { exists: boolean };
          if (dup.exists) {
            setDuplicateOpen(true);
            return;
          }
        }
      }

      setIsUploading(true);
      setDuplicateOpen(false);
      setDetailsOpen(false);

      try {
        const urlRes = await fetch("/api/statements/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            userId: session.user.id,
            filename: file.name,
            contentType: file.type || "application/pdf",
            bankLedgerName,
            extractionPeriodFrom: periodFrom || undefined,
            extractionPeriodTo: periodTo || todayIso(),
            passwordProtected
          })
        });

        if (!urlRes.ok) {
          throw new Error("Failed to get upload URL");
        }

        const { statementId, uploadUrl } = (await urlRes.json()) as {
          statementId: string;
          uploadUrl: string;
        };

        if (passwordProtected && filePassword.trim()) {
          try {
            sessionStorage.setItem(`stmt_pdf_pwd:${statementId}`, filePassword.trim());
          } catch {
            /* private mode */
          }
        }

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: {
            "Content-Type": file.type || "application/pdf"
          }
        });

        if (!uploadRes.ok) {
          throw new Error("Cloud upload failed");
        }

        const processRes = await fetch(`/api/statements/${statementId}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filePassword: passwordProtected ? filePassword.trim() : undefined
          })
        });
        if (!processRes.ok) {
          const text = await processRes.text();
          throw new Error(text || "Failed to start extraction");
        }

        toast.success("Statement uploaded and sent for extraction.");
        router.push(`/companies/${companyId}/banking`);
        router.refresh();
        onUploadComplete?.();
        resetForm();
      } catch (error) {
        console.error("[uploader]", error);
        toast.error(error instanceof Error ? error.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [
      session?.user,
      companyId,
      bankLedgerName,
      periodFrom,
      periodTo,
      passwordProtected,
      filePassword,
      router,
      onUploadComplete
    ]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user) return;
    setPendingFile(file);

    // Check for duplicate filename immediately before showing details
    void (async () => {
      try {
        const dupRes = await fetch(
          `/api/companies/${companyId}/statements/duplicate-check?filename=${encodeURIComponent(file.name)}`
        );
        if (dupRes.ok) {
          const dup = (await dupRes.json()) as { exists: boolean };
          if (dup.exists) {
            setDuplicateOpen(true);
            return; // Don't open details yet, wait for user confirmation
          }
        }
      } catch {
        /* ignore - proceed with upload */
      }
      // No duplicate or error - proceed to details
      setDetailsOpen(true);
    })();
  };

  const handleConfirmDetails = () => {
    if (!pendingFile) return;
    if (!bankLedgerName.trim()) {
      toast.warning("Please select a bank ledger.");
      return;
    }
    if (passwordProtected && !filePassword.trim()) {
      toast.warning("Enter the PDF password, or turn off password protection.");
      return;
    }
    void runUpload(pendingFile, { skipDuplicateModal: true }); // Already checked duplicate upfront
  };

  const handleDuplicateContinue = () => {
    if (!pendingFile) return;
    setDuplicateOpen(false);
    setDetailsOpen(true); // Show details form after user confirms duplicate
  };

  return (
    <>
      <div
        className="vouchr-gradient-mint flex h-44 cursor-pointer items-center justify-center rounded-xl text-center text-white transition-opacity hover:opacity-90"
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".pdf,.xlsx,.csv"
          onChange={handleFileChange}
          disabled={isUploading}
        />
        <div>
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-xl font-semibold">Uploading…</p>
            </div>
          ) : (
            <>
              <Upload className="mx-auto mb-2 h-10 w-10 text-white/80" />
              <p className="text-2xl font-semibold">Drag & Drop / Click to Upload Documents</p>
              <p className="text-sm text-white/80">Every PDF is converted to Tally vouchers in seconds.</p>
            </>
          )}
        </div>
      </div>

      {detailsOpen && pendingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="doc-details-title"
          >
            <h2 id="doc-details-title" className="text-lg font-semibold text-slate-900">
              Document Details
            </h2>
            <p className="mt-1 font-medium text-slate-800">{pendingFile.name}</p>
            <p className="text-sm text-slate-500">{formatBytes(pendingFile.size)}</p>

            {bankSource === "ALL_UNTAGGED" && bankOptions.length > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                No ledgers are tagged as bank accounts yet. Sync ledgers from Tally with ledger type, or pick any ledger
                for this statement.
              </p>
            )}

            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="bank-ledger" className="text-slate-700">
                  Bank Ledger <span className="text-red-500">*</span>
                </Label>
                <select
                  id="bank-ledger"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  value={bankLedgerName}
                  onChange={(e) => setBankLedgerName(e.target.value)}
                >
                  <option value="">Select an option</option>
                  {bankOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-slate-700">Extraction Period (optional) [DD-MM-YYYY]</Label>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    value={periodFrom}
                    onChange={(e) => setPeriodFrom(e.target.value)}
                    className="flex-1 min-w-[140px]"
                  />
                  <span className="text-slate-400">→</span>
                  <Input
                    type="date"
                    value={periodTo}
                    onChange={(e) => setPeriodTo(e.target.value)}
                    className="flex-1 min-w-[140px]"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={passwordProtected}
                  onChange={(e) => setPasswordProtected(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                File is Password Protected
              </label>

              {passwordProtected && (
                <div>
                  <Label htmlFor="pdf-pwd">PDF password</Label>
                  <Input
                    id="pdf-pwd"
                    type="password"
                    autoComplete="off"
                    value={filePassword}
                    onChange={(e) => setFilePassword(e.target.value)}
                    placeholder="Required for encrypted PDFs"
                    className="mt-1.5"
                  />
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                className="bg-brand-600 hover:bg-brand-700"
                disabled={isUploading}
                onClick={handleConfirmDetails}
              >
                Upload File
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="border border-brand-200 text-brand-700"
                disabled={isUploading}
                onClick={() => {
                  setDetailsOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {duplicateOpen && pendingFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <p className="text-slate-800">
              You have already uploaded a file named{" "}
              <span className="font-semibold text-brand-600">{pendingFile.name}</span>. Are you sure you want to
              continue?
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" className="bg-brand-600 hover:bg-brand-700" onClick={handleDuplicateContinue}>
                Continue
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="border border-brand-200 text-brand-700"
                onClick={() => setDuplicateOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
