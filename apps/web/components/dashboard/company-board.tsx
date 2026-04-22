"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api-client";
import { Loader2, Plus, Building2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function CompanyBoard() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [discovered, setDiscovered] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingCompanyId, setSyncingCompanyId] = useState<string | null>(null);
  const { session } = useAuth();

  const fetchData = async () => {
    if (!session?.user) return;
    try {
      const [cmpList, discList] = await Promise.all([
        api.getCompanies().catch(() => []),
        api.getDiscovery().catch(() => []),
      ]);
      setCompanies(Array.isArray(cmpList) ? cmpList : []);
      setDiscovered(Array.isArray(discList) ? discList : []);
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [session]);

  const syncCompany = async (companyObj: any) => {
    if (!companyObj.tallyCompanyRemoteId) {
      toast.error("Company is not mapped to a Tally company yet");
      return;
    }
    setSyncingCompanyId(companyObj.id);
    try {
      const { sync_id: syncId } = await api.triggerSync(
        companyObj.id,
        companyObj.organizationId,
        companyObj.tallyCompanyRemoteId
      );

      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await api.getSyncStatus(syncId);
        if (status?.status === "COMPLETED") {
          toast.success("Masters synced successfully");
          await fetchData();
          break;
        } else if (status?.status === "FAILED") {
          toast.error(`Sync failed: ${status.error || "Unknown error"}`);
          break;
        }
      }
    } catch (e) {
      console.error("Sync failed", e);
      toast.error("Sync failed — make sure the connector is running");
    } finally {
      setSyncingCompanyId(null);
    }
  };

  const createCompany = async (tallyObj?: any) => {
    let name = tallyObj ? tallyObj.tallyCompanyName : prompt("Enter Company Name:");
    if (!name || !session?.user) return;

    try {
      const result = await api.createCompany({
        name,
        tallyCompanyName: tallyObj?.tallyCompanyName,
        tallyCompanyRemoteId: tallyObj?.tallyCompanyRemoteId,
      });
      await fetchData();
      if (tallyObj && result?.id) {
        syncCompany({ id: result.id, tallyCompanyRemoteId: tallyObj.tallyCompanyRemoteId });
      }
    } catch (error) {
      toast.error("Failed to create company");
    }
  };

  const [mappingModal, setMappingModal] = useState<{ isOpen: boolean; tallyObj?: any; type: "new" | "existing" }>({
    isOpen: false,
    type: "new",
  });
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin h-8 w-8 text-brand-600" /></div>;

  const mappedRemoteIds = new Set(companies.map((c) => c.tallyCompanyRemoteId).filter(Boolean));
  const unmappedTally = discovered.filter((d) => !mappedRemoteIds.has(d.tallyCompanyRemoteId));

  const handleMapSubmit = async () => {
    if (!mappingModal.tallyObj) return;

    if (mappingModal.type === "existing") {
      if (!selectedCompanyId) {
        toast.warning("Please select a company to map to.");
        return;
      }
      try {
        await api.patchCompany(selectedCompanyId, {
          tallyCompanyName: mappingModal.tallyObj.tallyCompanyName,
          tallyCompanyRemoteId: mappingModal.tallyObj.tallyCompanyRemoteId,
        });
        setMappingModal({ isOpen: false } as any);
        await fetchData();
        syncCompany({ id: selectedCompanyId, tallyCompanyRemoteId: mappingModal.tallyObj.tallyCompanyRemoteId });
      } catch {
        toast.error("Failed to map company");
      }
    } else {
      await createCompany(mappingModal.tallyObj);
      setMappingModal({ isOpen: false } as any);
    }
  };

  return (
    <>
      {syncingCompanyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8 max-w-md w-full mx-4 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Syncing...</h3>
            <p className="text-sm text-slate-500 mb-8">Just give us a moment to sync company data</p>
            <div className="flex flex-col items-center">
              <Loader2 className="h-10 w-10 text-brand-600 animate-spin mb-4" />
              <p className="text-xs text-slate-400 font-medium">company/ {companies.find((c) => c.id === syncingCompanyId)?.name}</p>
            </div>
          </div>
        </div>
      )}

      {mappingModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4">
            {mappingModal.type === "new" ? (
              <>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Avoid Duplicates</h3>
                <p className="text-sm text-slate-600 mb-6">
                  To avoid creating duplicate company, please check your &quot;My Company&quot; section before adding.
                  <br /><br />
                  Would you like to continue adding <span className="font-bold">{mappingModal.tallyObj?.tallyCompanyName}</span> as a new company?
                </p>
                <div className="flex gap-3">
                  <Button className="w-full bg-brand-600 hover:bg-brand-700" onClick={handleMapSubmit}>Add as New</Button>
                  <Button className="w-full" variant="secondary" onClick={() => setMappingModal({ isOpen: false } as any)}>Cancel</Button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Map to Existing Company</h3>
                <p className="text-sm text-slate-600 mb-4">Select an existing VouchrIt company to map <strong>{mappingModal.tallyObj?.tallyCompanyName}</strong> to.</p>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm mb-6"
                >
                  <option value="">Select a company...</option>
                  {companies.filter((c) => !c.tallyCompanyRemoteId).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div className="flex gap-3">
                  <Button className="w-full bg-brand-600 hover:bg-brand-700" onClick={handleMapSubmit}>Map Company</Button>
                  <Button className="w-full" variant="secondary" onClick={() => setMappingModal({ isOpen: false } as any)}>Cancel</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-[330px_1fr] gap-5">
        <div>
          <h4 className="mb-3 text-xl font-semibold text-slate-800 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-brand-500" />
            Tally Discovered
          </h4>
          <div className="space-y-3">
            {unmappedTally.length === 0 ? (
              <div className="p-4 text-sm text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No new active companies found in Tally. Ensure Vouchr Connector is running.
              </div>
            ) : unmappedTally.map((item) => (
              <Card key={item.id} className="rounded-xl overflow-hidden shadow-sm border border-slate-200">
                <div className="h-1 w-full bg-brand-400" />
                <CardHeader className="py-4 pb-2">
                  <CardTitle className="text-md line-clamp-1">{item.tallyCompanyName}</CardTitle>
                  <p className="text-xs text-slate-500">ID: {item.tallyCompanyRemoteId}</p>
                </CardHeader>
                <CardContent className="pb-4 pt-2">
                  <div className="flex gap-2">
                    <Button onClick={() => setMappingModal({ isOpen: true, tallyObj: item, type: "new" })} size="sm" variant="ghost" className="flex-1 h-8 text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200">Add as New</Button>
                    <Button onClick={() => setMappingModal({ isOpen: true, tallyObj: item, type: "existing" })} size="sm" variant="ghost" className="flex-1 h-8 text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200">Map to Existing</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-xl font-semibold text-slate-800">My Companies</h4>
            <div className="flex items-center gap-3">
              <input className="h-9 w-64 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white px-3 text-sm transition-colors" placeholder="Search companies..." type="search" />
              <Button onClick={() => createCompany()} size="sm" className="bg-brand-600 h-9"><Plus className="h-4 w-4 mr-1" /> New</Button>
            </div>
          </div>

          {companies.length === 0 ? (
            <Card className="border-dashed border-slate-300 bg-slate-50/50">
              <CardContent className="flex h-[350px] flex-col items-center justify-center text-center">
                <p className="text-slate-500 max-w-[200px]">No active Vouchr companies. Map one from Tally or create manually.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-xl border-slate-200 shadow-none min-h-[350px]">
              <CardContent className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                {companies.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-soft hover:border-brand-300 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <p className="text-xs text-slate-500 flex items-center gap-2">
                        {item.tallyCompanyRemoteId && (
                          <button onClick={() => syncCompany(item)} className="text-slate-400 hover:text-brand-600 transition-colors" title="Sync Masters">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <span>Last Synced on: {item.connectorLastSyncedAt ? new Date(item.connectorLastSyncedAt).toLocaleTimeString() : "Never"}</span>
                      </p>
                      <Badge tone="success" className="bg-green-50 text-green-700 border-green-100 h-5 text-[10px]">Active</Badge>
                    </div>
                    <p className="mt-2 text-lg font-bold text-slate-900 line-clamp-1" title={item.name}>{item.name}</p>
                    {item.tallyCompanyName ? (
                      <p className="text-xs text-brand-600 font-medium mt-1 flex items-center gap-1">Linked: {item.tallyCompanyName}</p>
                    ) : (
                      <p className="text-xs text-orange-500 font-medium mt-1 flex items-center gap-1">Unmapped</p>
                    )}
                    <div className="mt-6 flex items-center gap-2">
                      <Link href={`/companies/${item.id}/banking`} className="flex-1">
                        <Button size="sm" className="w-full bg-brand-50 text-brand-700 hover:bg-brand-100 h-8 font-semibold">Workspace</Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
