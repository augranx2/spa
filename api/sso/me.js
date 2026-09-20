// GET /api/sso/me — status login portal untuk aplikasi ini.
// Bila SSO_AKTIF belum "true", selalu menjawab { aktif: false } sehingga
// aplikasi tetap memakai login lamanya.
import { ssoAktif, periksaSso, portalUrl } from "../../server/sso.js";

const APP_KEY = "spa";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!ssoAktif()) return res.status(200).json({ aktif: false });
  try {
    const h = await periksaSso(req, APP_KEY);
    return res.status(200).json({
      aktif: true,
      portalUrl: portalUrl(),
      status: h.status,
      user: h.status === "ok" ? h.user : null,
    });
  } catch (err) {
    return res.status(200).json({ aktif: true, portalUrl: portalUrl(), status: "error", error: String(err?.message || err) });
  }
}
