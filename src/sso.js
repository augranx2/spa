// Status login lewat Portal REMS (SSO), dibaca sekali saat halaman dibuka.
// Selama SSO_AKTIF di Vercel belum "true", aktif = false dan aplikasi
// berjalan persis seperti sebelumnya (login di aplikasi ini sendiri).

let state = { aktif: false };

export async function initSso() {
  try {
    const res = await fetch("/api/sso/me", { credentials: "same-origin", cache: "no-store" });
    const ct = res.headers.get("content-type") || "";
    // Saat dijalankan lokal dengan `npm run dev` tidak ada /api -> login lama.
    if (!ct.includes("application/json")) return (state = { aktif: false });
    const d = await res.json();
    state = d && d.aktif ? d : { aktif: false };
  } catch {
    state = { aktif: false };
  }
  return state;
}

export const ssoState = () => state;
export const ssoAktif = () => !!state.aktif;

const kembali = () => encodeURIComponent(window.location.href);

export function keLoginPortal() {
  window.location.href = `${state.portalUrl}/login?next=${kembali()}`;
}

export function keKeluarPortal() {
  window.location.href = `${state.portalUrl}/keluar`;
}

export function keGantiPasswordPortal() {
  window.location.href = `${state.portalUrl}/ganti-password?next=${kembali()}`;
}

/** Semua panggilan data saat SSO aktif lewat /api/gas (perantara di Vercel). */
export async function ssoCall(method, params) {
  const res =
    method === "GET"
      ? await fetch(`/api/gas?${new URLSearchParams(params).toString()}`, { credentials: "same-origin" })
      : await fetch("/api/gas", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Gagal terhubung ke server (HTTP ${res.status})`);
  }
  if (res.status === 401 && data.needLogin) {
    if (data.status === "ganti-password") keGantiPasswordPortal();
    else keLoginPortal();
    throw new Error(data.error || "Sesi berakhir");
  }
  if (!res.ok || data.error) throw new Error(data.error || `Gagal (HTTP ${res.status})`);
  return data;
}
