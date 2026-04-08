"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, ListPlus, Loader2, Plus, Shield, X } from "lucide-react";

interface Hitlist {
  id: string;
  name: string;
  status: string;
  description: string | null;
}

type ApiResp<T> =
  | { success: true; data: T }
  | { success: false; error: string };

interface Props {
  plate: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  vehicleCategory?: string | null;
  country?: string | null;
}

export function AddToHitlistModal({
  plate,
  open,
  onClose,
  onSuccess,
  vehicleMake,
  vehicleModel,
  vehicleColor,
  vehicleCategory,
  country,
}: Props) {
  const [hitlists, setHitlists] = useState<Hitlist[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const fetchHitlists = useCallback(async () => {
    setLoadingLists(true);
    setFetchError(null);
    try {
      const resp = await api.get<ApiResp<Hitlist[]>>("/api/hitlists");
      if (resp.success) setHitlists(resp.data ?? []);
      else setFetchError(resp.error);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to load hitlists");
    } finally {
      setLoadingLists(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSuccess(false);
    setSubmitError(null);
    setShowCreate(false);
    setNewName("");
    setNewDesc("");
    void fetchHitlists();
  }, [open, fetchHitlists]);

  async function addEntry(hitlistId: string) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const resp = await api.post<ApiResp<unknown>>(
        `/api/hitlists/${hitlistId}/entries`,
        {
          plate,
          vehicleMake: vehicleMake ?? undefined,
          vehicleModel: vehicleModel ?? undefined,
          vehicleColor: vehicleColor ?? undefined,
          vehicleCategory: vehicleCategory ?? undefined,
          countryOrRegion: country ?? undefined,
        },
      );
      if (!resp.success) {
        setSubmitError(resp.error);
        return;
      }
      setSuccess(true);
      onSuccess?.();
      setTimeout(() => onClose(), 800);
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Failed to add to hitlist",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const createResp = await api.post<ApiResp<{ id: string }>>(
        "/api/hitlists",
        {
          name: newName.trim(),
          description: newDesc.trim() || undefined,
        },
      );
      if (!createResp.success) {
        setSubmitError(createResp.error);
        setSubmitting(false);
        return;
      }
      await addEntry(createResp.data.id);
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : "Failed to create hitlist",
      );
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const activeHitlists = hitlists.filter((h) => h.status === "ACTIVE");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative glass-heavy rounded-xl p-6 w-full max-w-md border border-border">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Add to Hitlist
              </h2>
              <p className="text-xs text-muted-foreground">
                Plate:{" "}
                <span className="font-mono font-bold text-foreground tracking-wider">
                  {plate}
                </span>
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground h-6 w-6"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="rounded-full bg-success/15 p-4">
              <Check className="h-8 w-8 text-success" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Added to hitlist
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {submitError && (
              <div className="glass rounded-lg px-3 py-2.5 border border-destructive/30 bg-destructive/5 flex items-center gap-2">
                <p className="text-xs text-destructive flex-1">{submitError}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSubmitError(null)}
                  className="h-5 w-5 text-destructive hover:text-destructive/70 shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {loadingLists ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : fetchError ? (
              <div className="glass rounded-lg px-3 py-2.5 border border-destructive/30 bg-destructive/5">
                <p className="text-xs text-destructive">{fetchError}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void fetchHitlists()}
                  className="mt-2 h-7 text-xs text-muted-foreground"
                >
                  Retry
                </Button>
              </div>
            ) : (
              <>
                {activeHitlists.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Select a hitlist
                    </p>
                    {activeHitlists.map((hl) => (
                      <button
                        key={hl.id}
                        type="button"
                        disabled={submitting}
                        onClick={() => void addEntry(hl.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border glass glass-hover text-left transition-colors disabled:opacity-50 disabled:pointer-events-none",
                        )}
                      >
                        <ListPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {hl.name}
                          </p>
                          {hl.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {hl.description}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="success"
                          className="text-[10px] shrink-0"
                        >
                          Active
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}

                {activeHitlists.length === 0 && !showCreate && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No active hitlists. Create one below.
                  </p>
                )}

                {!showCreate ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setShowCreate(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-left transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground">
                      Create new hitlist
                    </span>
                  </button>
                ) : (
                  <div className="glass rounded-lg border border-border p-4 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      New hitlist
                    </p>
                    <Input
                      type="text"
                      placeholder="Hitlist name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full"
                      autoFocus
                    />
                    <Input
                      type="text"
                      placeholder="Description (optional)"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      className="w-full"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowCreate(false);
                          setNewName("");
                          setNewDesc("");
                        }}
                        className="glass glass-hover"
                        disabled={submitting}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleCreate()}
                        disabled={submitting || !newName.trim()}
                      >
                        {submitting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        {submitting ? "Creating…" : "Create & Add"}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
