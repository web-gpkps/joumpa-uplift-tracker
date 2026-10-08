"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, DataTableEmpty, Td, Th, Tr } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input, Select } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { StatusChip } from "@/components/ui/StatusChip";
import { CopyFeedback, CopyLinkField, copyText } from "./CopyLinkField";
import { formatWaktu } from "./format";
import { createShareLink, revokeShareLink, rotateShareLink } from "./link-actions";
import { LINK_SCOPES, SCOPE_DESCRIPTION, isLinkScope, type LinkRow, type NewLink } from "./link-types";

type LinksManagerProps = {
  links: LinkRow[];
};

type Confirm = { mode: "revoke" | "rotate"; link: LinkRow } | null;

function scopeName(scope: string): string {
  return scope === "KPS" ? "KPS" : `Stasiun ${scope}`;
}

/** "…/s/3f9a12…c21b": enough to tell links apart without putting the secret on screen. */
function maskedUrl(url: string): string {
  const i = url.indexOf("/s/");
  if (i < 0) return "tautan";
  const token = url.slice(i + 3);
  return `/s/${token.slice(0, 6)}…${token.slice(-4)}`;
}

/**
 * Tautan stasiun: who holds a working link per scope, create / copy / rotate / revoke.
 * A new link's full URL is shown once, right after it is made, with "Salin tautan".
 */
export function LinksManager({ links }: LinksManagerProps) {
  const active = links.filter((l) => !l.revokedAt);
  const revoked = links.filter((l) => l.revokedAt);

  const [scope, setScope] = useState<string>("");
  const [label, setLabel] = useState("");
  const [formErrors, setFormErrors] = useState<{ scope?: string; label?: string }>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [fresh, setFresh] = useState<(NewLink & { note: string }) | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<{ id: string; state: "copied" | "manual" } | null>(null);
  const [creating, startCreate] = useTransition();
  const [confirming, startConfirm] = useTransition();

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormMessage(null);
    const errors: { scope?: string; label?: string } = {};
    if (!isLinkScope(scope)) errors.scope = "Pilih lingkup tautan.";
    if (label.trim() === "") errors.label = "Isi label, misalnya nama atau jabatan pemegang tautan.";
    setFormErrors(errors);
    if (errors.scope || errors.label) return;
    startCreate(async () => {
      try {
        const result = await createShareLink(scope, label);
        if (result.ok && result.link) {
          setFresh({ ...result.link, note: result.message });
          setNotice(null);
          setScope("");
          setLabel("");
        } else if (!result.ok) {
          setFormErrors(result.fieldErrors ?? {});
          setFormMessage(result.message);
        }
      } catch {
        setFormMessage("Server tidak menjawab. Periksa koneksi, lalu coba lagi.");
      }
    });
  }

  function runConfirm() {
    if (!confirm) return;
    const { mode, link } = confirm;
    setConfirmError(null);
    startConfirm(async () => {
      try {
        const result = mode === "revoke" ? await revokeShareLink(link.id) : await rotateShareLink(link.id);
        if (!result.ok) {
          setConfirmError(result.message);
          return;
        }
        setConfirm(null);
        if (result.link) {
          setFresh({ ...result.link, note: result.message });
          setNotice(null);
        } else {
          setNotice(result.message);
        }
      } catch {
        setConfirmError("Server tidak menjawab. Periksa koneksi, lalu coba lagi.");
      }
    });
  }

  const scopeHelp = isLinkScope(scope) ? SCOPE_DESCRIPTION[scope] : "SUB, DPS, CGK, HLP, KNO, atau KPS (semua stasiun).";

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="cakupan-tautan">
        <h2 id="cakupan-tautan" className="section-label mb-2">
          Tautan aktif per lingkup
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {LINK_SCOPES.map((s) => {
            const forScope = active.filter((l) => l.scope === s);
            const real = forScope.filter((l) => !l.isQa).length;
            const qa = forScope.length - real;
            return (
              <li key={s} className="rounded-panel border border-line bg-surface px-3 py-2">
                <p className="text-sm font-semibold text-ink">{s}</p>
                <p className={real === 0 ? "text-sm text-warning" : "text-sm text-ink"}>
                  {real === 0 ? "Belum ada tautan" : `${real} tautan aktif`}
                </p>
                {qa > 0 ? <p className="text-xs text-ink-muted">+ {qa} tautan uji QA</p> : null}
              </li>
            );
          })}
        </ul>
      </section>

      {fresh ? (
        <section
          aria-labelledby="tautan-baru"
          className="flex flex-col gap-3 rounded-panel border border-brand bg-brand-tint p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="tautan-baru" className="text-lg font-semibold text-ink">
                Tautan baru: {scopeName(fresh.scope)}
                {fresh.label ? `, ${fresh.label}` : ""}
              </h2>
              <p className="mt-1 text-sm text-ink">{fresh.note}</p>
            </div>
            <Button variant="quiet" size="sm" onClick={() => setFresh(null)}>
              Tutup
            </Button>
          </div>
          <CopyLinkField url={fresh.url} label={`Tautan baru ${fresh.scope}`} />
          <p className="text-sm text-ink">
            Tautan ini berlaku seperti kata sandi: siapa pun yang memegangnya bisa membuka dan mengubah data{" "}
            {fresh.scope === "KPS" ? "semua stasiun" : `stasiun ${fresh.scope}`} tanpa login. Kirim lewat pesan
            pribadi, jangan di grup.
          </p>
        </section>
      ) : null}

      {notice ? (
        <p role="status" className="text-sm font-semibold text-good">
          {notice}
        </p>
      ) : null}

      <Panel
        title="Buat tautan"
        description="Satu tautan per pemegang. Label menjelaskan siapa yang memegangnya, misalnya jabatan PIC."
      >
        <form onSubmit={submitCreate} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <Field label="Lingkup" help={scopeHelp} error={formErrors.scope} required>
              <Select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">Pilih lingkup</option>
                {LINK_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {s === "KPS" ? "KPS (semua stasiun)" : s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Label" help="Maksimal 80 karakter." error={formErrors.label} required>
              <Input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} autoComplete="off" />
            </Field>
          </div>
          <div className="flex flex-col sm:flex-row">
            <Button type="submit" loading={creating} loadingText="Membuat tautan…">
              Buat tautan
            </Button>
          </div>
          {formMessage ? (
            <p role="alert" className="text-sm font-medium text-critical">
              {formMessage}
            </p>
          ) : null}
        </form>
      </Panel>

      <Panel
        title="Tautan aktif"
        description="Salin tautan untuk dikirim ulang. Ganti tautan jika tautan bocor atau pemegangnya berganti."
        padding="flush"
      >
        <DataTable caption="Tautan aktif" hideCaption minWidth="980px" stickyHeader={false}>
          <thead>
            <tr>
              <Th>Lingkup</Th>
              <Th>Label</Th>
              <Th>Dibuat</Th>
              <Th>Terakhir dipakai</Th>
              <Th>Status</Th>
              <Th>Tindakan</Th>
            </tr>
          </thead>
          <tbody>
            {active.length === 0 ? (
              <DataTableEmpty colSpan={6} title="Belum ada tautan aktif">
                Stasiun dan KPS belum bisa mengisi data. Buat tautan pertama lewat formulir di atas.
              </DataTableEmpty>
            ) : (
              active.map((l) => (
                <Tr key={l.id}>
                  <Th scope="row" className="align-top">
                    <span className="block font-semibold text-ink">{l.scope}</span>
                    <span className="block text-xs font-normal whitespace-nowrap text-ink-muted">{l.url ? maskedUrl(l.url) : ""}</span>
                  </Th>
                  <Td className="min-w-56 align-top">
                    <span className="block">{l.label ?? <span className="text-ink-muted">Tanpa label</span>}</span>
                    {l.isQa ? (
                      <span className="mt-1 block text-xs font-semibold text-warning">
                        Tautan uji QA, bukan milik stasiun. Cabut sebelum serah terima.
                      </span>
                    ) : null}
                  </Td>
                  <Td className="align-top whitespace-nowrap">{formatWaktu(l.createdAt)}</Td>
                  <Td className="align-top whitespace-nowrap">
                    {formatWaktu(l.lastUsedAt) ?? <span className="text-ink-muted">Belum pernah dipakai</span>}
                  </Td>
                  <Td className="align-top">
                    <StatusChip label="Aktif" tone="good" />
                  </Td>
                  <Td className="align-top">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Salin tautan ${l.scope}${l.label ? `, ${l.label}` : ""}`}
                        onClick={async () => {
                          if (!l.url) return;
                          const state = await copyText(l.url);
                          setCopied({ id: l.id, state: state === "copied" ? "copied" : "manual" });
                        }}
                      >
                        Salin tautan
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Ganti tautan ${l.scope}${l.label ? `, ${l.label}` : ""}`}
                        onClick={() => {
                          setConfirmError(null);
                          setConfirm({ mode: "rotate", link: l });
                        }}
                      >
                        Ganti tautan
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={`Cabut tautan ${l.scope}${l.label ? `, ${l.label}` : ""}`}
                        onClick={() => {
                          setConfirmError(null);
                          setConfirm({ mode: "revoke", link: l });
                        }}
                      >
                        Cabut tautan
                      </Button>
                    </div>
                    {copied?.id === l.id ? (
                      copied.state === "copied" ? (
                        <CopyFeedback state="copied" className="mt-1 block" />
                      ) : l.url ? (
                        <div className="mt-2 max-w-xl">
                          <p className="mb-1 text-sm text-warning">
                            Browser menolak menyalin otomatis. Salin dari kotak ini:
                          </p>
                          <CopyLinkField url={l.url} label={`Tautan ${l.scope} lengkap`} />
                        </div>
                      ) : null
                    ) : null}
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </DataTable>
      </Panel>

      <Panel
        title="Tautan dicabut"
        description="Riwayat tautan yang sudah tidak berlaku. Pemegangnya melihat layar Tautan tidak berlaku."
        padding="flush"
      >
        <DataTable caption="Tautan dicabut" hideCaption minWidth="760px" stickyHeader={false}>
          <thead>
            <tr>
              <Th>Lingkup</Th>
              <Th>Label</Th>
              <Th>Dibuat</Th>
              <Th>Dicabut</Th>
              <Th>Terakhir dipakai</Th>
            </tr>
          </thead>
          <tbody>
            {revoked.length === 0 ? (
              <DataTableEmpty colSpan={5} title="Belum ada tautan yang dicabut" />
            ) : (
              revoked.map((l) => (
                <Tr key={l.id}>
                  <Th scope="row" className="font-semibold text-ink">
                    {l.scope}
                  </Th>
                  <Td className="min-w-56">{l.label ?? <span className="text-ink-muted">Tanpa label</span>}</Td>
                  <Td className="whitespace-nowrap">{formatWaktu(l.createdAt)}</Td>
                  <Td className="whitespace-nowrap">
                    <StatusChip label={`Dicabut ${formatWaktu(l.revokedAt) ?? ""}`} tone="neutral" />
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatWaktu(l.lastUsedAt) ?? <span className="text-ink-muted">Belum pernah dipakai</span>}
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </DataTable>
      </Panel>

      <Dialog
        open={confirm !== null}
        onClose={() => {
          if (!confirming) setConfirm(null);
        }}
        dismissible={!confirming}
        title={
          confirm
            ? confirm.mode === "revoke"
              ? `Cabut tautan ${confirm.link.scope}?`
              : `Ganti tautan ${confirm.link.scope}?`
            : ""
        }
        description={confirm?.link.label ? `Label: ${confirm.link.label}` : undefined}
        footer={
          confirm ? (
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)} disabled={confirming}>
                Batal
              </Button>
              {confirm.mode === "revoke" ? (
                <Button variant="danger" onClick={runConfirm} loading={confirming} loadingText="Mencabut…">
                  Cabut tautan
                </Button>
              ) : (
                <Button onClick={runConfirm} loading={confirming} loadingText="Mengganti…">
                  Ganti tautan
                </Button>
              )}
            </>
          ) : null
        }
      >
        {confirm ? (
          <div className="flex flex-col gap-2">
            {confirm.mode === "revoke" ? (
              <p>
                Pemegang tautan ini langsung tidak bisa membuka ruang kerja {scopeName(confirm.link.scope)}. Data
                yang sudah diisi tetap tersimpan. Tautan yang dicabut tidak bisa diaktifkan lagi.
              </p>
            ) : (
              <p>
                Tautan baru dibuat dengan lingkup dan label yang sama, lalu tautan lama langsung tidak berlaku.
                Kirim tautan baru ke pemegangnya setelah ini.
              </p>
            )}
            {confirmError ? (
              <p role="alert" className="font-medium text-critical">
                {confirmError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
