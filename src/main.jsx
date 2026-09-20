import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { initSso } from "./sso.js";

function Pesan({ judul, isi, tombol, href }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f8fafc" }}>
      <div style={{ maxWidth: 420, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 28, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>{judul}</h1>
        <p style={{ color: "#475569", marginTop: 10, lineHeight: 1.55 }}>{isi}</p>
        {href && (
          <a
            href={href}
            style={{ display: "inline-block", marginTop: 18, padding: "10px 20px", borderRadius: 999, background: "#1e4d8f", color: "#fff", fontWeight: 600, textDecoration: "none" }}
          >
            {tombol}
          </a>
        )}
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
const tampil = (el) => root.render(<React.StrictMode>{el}</React.StrictMode>);

// Periksa dulu apakah login lewat Portal REMS sedang aktif, baru tampilkan aplikasi.
initSso().then((s) => {
  const publik = window.location.pathname === "/verify";
  if (!s.aktif || publik || s.status === "ok") return tampil(<App />);
  const kembali = encodeURIComponent(window.location.href);
  if (s.status === "login") return window.location.replace(`${s.portalUrl}/login?next=${kembali}`);
  if (s.status === "ganti-password") return window.location.replace(`${s.portalUrl}/ganti-password?next=${kembali}`);
  if (s.status === "akses") {
    return tampil(
      <Pesan
        judul="Tidak ada akses"
        isi="Akun Anda belum diberi akses ke aplikasi ini. Hubungi admin Portal REMS bila Anda memerlukannya."
        tombol="Kembali ke Portal REMS"
        href={s.portalUrl}
      />
    );
  }
  return tampil(
    <Pesan judul="Login portal belum bisa diperiksa" isi={s.error || "Pengaturan server belum lengkap."} tombol="Coba lagi" href={window.location.href} />
  );
});
