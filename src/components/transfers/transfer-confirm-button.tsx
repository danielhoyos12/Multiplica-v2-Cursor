"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Kind = "approve" | "reject" | "execute";

type Props = {
  kind: Kind;
  personName: string;
  transferType: string;
  reason: string;
  action: () => Promise<void>;
};

const COPY: Record<
  Kind,
  { label: string; title: string; confirmLabel: string; tone: "default" | "danger"; variant: "secondary" | "danger" | "ghost" }
> = {
  approve: {
    label: "Aprobar",
    title: "¿Aprobar transferencia?",
    confirmLabel: "Aprobar",
    tone: "default",
    variant: "secondary",
  },
  reject: {
    label: "Rechazar",
    title: "¿Rechazar transferencia?",
    confirmLabel: "Rechazar",
    tone: "danger",
    variant: "danger",
  },
  execute: {
    label: "Ejecutar",
    title: "¿Ejecutar transferencia?",
    confirmLabel: "Ejecutar",
    tone: "default",
    variant: "ghost",
  },
};

function subscribeMedia(callback: () => void) {
  const mq = window.matchMedia("(max-width: 767px)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getMobileSnapshot() {
  return window.matchMedia("(max-width: 767px)").matches;
}

function getServerSnapshot() {
  return false;
}

export function TransferConfirmButton({
  kind,
  personName,
  transferType,
  reason,
  action,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const mobile = useSyncExternalStore(subscribeMedia, getMobileSnapshot, getServerSnapshot);
  const meta = COPY[kind];
  const description = `${personName} · ${transferType}. Motivo: ${reason}`;

  function runConfirm() {
    startTransition(async () => {
      await action();
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={meta.variant}
        className="min-h-11 min-w-11"
        onClick={() => setOpen(true)}
      >
        {meta.label}
      </Button>

      {mobile ? (
        <BottomSheet
          open={open}
          title={meta.title}
          description={description}
          onClose={() => setOpen(false)}
        >
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant={meta.tone === "danger" ? "danger" : "primary"}
              className="min-h-11"
              disabled={pending}
              onClick={runConfirm}
            >
              {pending ? "Procesando…" : meta.confirmLabel}
            </Button>
          </div>
        </BottomSheet>
      ) : (
        <ConfirmDialog
          open={open}
          title={meta.title}
          description={description}
          confirmLabel={pending ? "Procesando…" : meta.confirmLabel}
          cancelLabel="Cancelar"
          tone={meta.tone}
          onCancel={() => setOpen(false)}
          onConfirm={runConfirm}
        />
      )}
    </>
  );
}
