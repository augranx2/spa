// /api/gas — perantara ke Apps Script saat login lewat portal aktif.
//
// Browser tidak lagi memanggil Apps Script langsung. Fungsi ini:
//   1. memeriksa tiket login portal (cookie myrama_sso) + sesi di Redis portal,
//   2. membuang token apa pun dari browser,
//   3. menambahkan identitas user (username, nama, role, departemen dari
//      portal) dan kunci rahasia GAS_SSO_KEY,
//   4. meneruskan permintaan ke Apps Script (GAS_URL) dan mengembalikan hasilnya.
// Apps Script hanya mempercayai identitas yang datang bersama GAS_SSO_KEY.
import { ssoAktif, periksaSso, portalUrl } from "../server/sso.js";

const APP_KEY = "spa";
// Aksi yang tetap boleh tanpa login (halaman /verify hasil scan QR).
const PUBLIK = ["verify"];
const DIALIHKAN = {
  login: "Login sekarang lewat Portal REMS.",
  changePassword: "Ganti password sekarang lewat Portal REMS.",
};
const PESAN = {
  login: "Sesi berakhir. Silakan masuk kembali lewat Portal REMS.",
  "ganti-password": "Ganti password awal Anda di Portal REMS terlebih dahulu.",
  akses: "Akun Anda tidak punya akses ke aplikasi ini.",
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!ssoAktif()) return res.status(404).json({ error: "Login lewat portal belum diaktifkan." });
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Metode tidak diizinkan" });

  const gasUrl = String(process.env.GAS_URL || "").trim();
  const kunci = String(process.env.GAS_SSO_KEY || "").trim();
  if (!gasUrl || !kunci) return res.status(500).json({ error: "GAS_URL / GAS_SSO_KEY belum diisi di Environment Variables Vercel." });

  let params;
  if (req.method === "GET") {
    params = {};
    for (const [k, v] of Object.entries(req.query || {})) params[k] = Array.isArray(v) ? v[0] : v;
  } else {
    try {
      params = typeof req.body === "string" ? JSON.parse(req.body || "{}") : { ...(req.body || {}) };
    } catch {
      return res.status(400).json({ error: "Format permintaan tidak dikenali." });
    }
  }
  const action = String(params.action || "");
  delete params.token;
  delete params.ssoKey;
  delete params.ssoUser;

  if (action === "logout") return res.status(200).json({ ok: true });
  if (DIALIHKAN[action]) return res.status(400).json({ error: DIALIHKAN[action] });

  let hasil;
  try {
    hasil = await periksaSso(req, APP_KEY);
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }

  if (hasil.status === "ok") {
    params.token = "sso";
    params.ssoUser = JSON.stringify(hasil.user);
  } else if (!PUBLIK.includes(action)) {
    return res.status(hasil.status === "akses" ? 403 : 401).json({
      error: PESAN[hasil.status] || PESAN.login,
      needLogin: hasil.status !== "akses",
      status: hasil.status,
      portalUrl: portalUrl(),
    });
  }
  params.ssoKey = kunci;

  try {
    let r;
    if (req.method === "GET") {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
      r = await fetch(`${gasUrl}?${qs}`, { redirect: "follow" });
    } else {
      // Dikirim sebagai teks biasa, sama seperti browser dulu memanggil Apps Script.
      r = await fetch(gasUrl, { method: "POST", body: JSON.stringify(params), redirect: "follow" });
    }
    if (!r.ok) return res.status(502).json({ error: `Server Apps Script membalas HTTP ${r.status}. Coba lagi.` });
    const text = await r.text();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).send(text);
  } catch {
    return res.status(502).json({ error: "Gagal menghubungi server data. Coba lagi." });
  }
}
