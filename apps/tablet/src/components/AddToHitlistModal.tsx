"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ListPlus, Loader2, Plus, Shield, X } from "lucide-react";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ApiResp<T> =
  | { success: true; data: T }
  | { success: false; error: string };

interface Hitlist {
  id: string;
  name: string;
  status: string;
}

interface Props {
  plate: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  vehicleCategory?: string | null;
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
}: Props) {
  const [hitlists, setHitlists] = useState<Hitlist[]>([]);
  const [loadingHitlists, setLoadingHitlists] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setShowCreate(false);
    setNewName("");
    setError(null);
    setSuccess(false);
    setSubmitting(false);
    setLoadingHitlists(true);
    api
      .get<ApiResp<Hitlist[]>>("/api/hitlists")
      .then((resp) => {
        if (resp.success) {
          setHitlists(resp.data.filter((h) => h.status === "ACTIVE"));
        } else {
          setError(resp.error);
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load hitlists");
      })
      .finally(() => {
        setLoadingHitlists(false);
      });
  }, [open]);

  async function addToHitlist(hitlistId: string) {
    setSubmitting(true);
    setError(null);
    try {
      const resp = await api.post<ApiResp<unknown>>(
        `/api/hitlists/${hitlistId}/entries`,
        { plate, vehicleMake, vehicleModel, vehicleColor, vehicleCategory },
      );
      if (!resp.success) {
        setError(resp.error);
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => {
        onClose();
        onSuccess?.();
      }, 800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add plate");
      setSubmitting(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const createResp = await api.post<ApiResp<{ id: string }>>(
        "/api/hitlists",
        {
          name: newName.trim(),
        },
      );
      if (!createResp.success) {
        setError(createResp.error);
        setSubmitting(false);
        return;
      }
      await addToHitlist(createResp.data.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create hitlist");
      setSubmitting(false);
    }
  }

  const contentRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm pointer-events-none"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${plate} to hitlist`}
        className="absolute inset-0 flex items-center justify-center touch-manipulation"
        tabIndex={-1}
        onClick={(e) => {
          if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
            onClose();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div
          ref={contentRef}
          className="relative glass-heavy rounded-2xl p-5 w-[340px] max-w-[calc(100vw-2rem)] shadow-2xl border border-border/60"
        >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                Add to Hitlist
              </p>
              <p className="font-mono text-base font-bold text-foreground tracking-widest leading-tight">
                {plate}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={onClose}
            disabled={submitting}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <div className="w-12 h-12 rounded-full bg-success/15 border border-success/30 flex items-center justify-center">
              <Check className="w-6 h-6 text-success" />
            </div>
            <p className="text-sm font-medium text-success">Added!</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="glass rounded-xl p-2.5 border border-destructive/30 bg-destructive/5 mb-3">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {loadingHitlists ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1.5">
                {hitlists.length === 0 && !showCreate && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No active hitlists found.
                  </p>
                )}

                {hitlists.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      if (submitting) return;
                      setSelectedId(h.id);
                      void addToHitlist(h.id);
                    }}
                    disabled={submitting}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl glass text-left transition-all touch-manipulation",
                      "hover:border-primary/40 hover:bg-primary/5",
                      selectedId === h.id && "border-primary/50 bg-primary/10",
                      "disabled:opacity-50 disabled:pointer-events-none",
                    )}
                  >
                    <ListPlus className="h-4 w-4 text-primary shrink-0" />
                    <span className="flex-1 text-sm font-medium text-foreground truncate">
                      {h.name}
                    </span>
                    <Badge variant="success" className="text-[10px] shrink-0">
                      ACTIVE
                    </Badge>
                    {submitting && selectedId === h.id && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    )}
                  </button>
                ))}

                {!showCreate ? (
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    disabled={submitting}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl glass text-left transition-all hover:border-muted-foreground/30 hover:bg-accent/5 disabled:opacity-50 disabled:pointer-events-none touch-manipulation"
                  >
                    <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground">
                      Create new hitlist
                    </span>
                  </button>
                ) : (
                  <div className="glass rounded-xl p-3 space-y-2">
                    <Input
                      placeholder="Hitlist name…"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleCreate();
                      }}
                      disabled={submitting}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => void handleCreate()}
                        disabled={submitting || !newName.trim()}
                      >
                        {submitting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        Create & Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setShowCreate(false);
                          setNewName("");
                        }}
                        disabled={submitting}
                        className="text-muted-foreground"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </div>
  );
}
