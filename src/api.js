const API_URL = window.SPA_CONFIG?.API_URL || "";

if (!API_URL) {
  console.warn("SPA_CONFIG.API_URL belum diisi — cek file public/config.js");
}

// Pesan error HTTP dibuat sesuai aksi yang sebenarnya gagal (login, simpan
// data, dll) — sebelumnya semua kegagalan POST (termasuk gagal LOGIN) selalu
// menampilkan "Gagal menyimpan data", yang membingungkan karena tidak sesuai
// dengan apa yang sebenarnya sedang dilakukan pengguna.
function httpErrorMessage(action, status) {
  if (!API_URL) {
    return "URL server (API_URL) belum diatur di public/config.js — hubungi Administrator.";
  }
  if (status === 404) {
    return `Server tidak ditemukan (HTTP 404). URL Apps Script di config.js kemungkinan sudah tidak berlaku — deployment perlu dicek ulang.`;
  }
  const label = {
    login: "Gagal login", logout: "Gagal keluar", master: "Gagal memuat data titik sampling",
    entries: "Gagal memuat data pengujian", allEntries: "Gagal memuat data pengujian",
    saveEntries: "Gagal menyimpan data pengujian", report: "Gagal memuat pengkajian",
    saveReport: "Gagal menyimpan narasi", approveDikaji: "Gagal menyetujui",
    approveMengetahui: "Gagal menyetujui", statusIndex: "Gagal memuat status sistem",
    activityLog: "Gagal memuat audit trail", changePassword: "Gagal mengganti password",
    whoami: "Gagal memuat sesi", reportHasil: "Gagal memuat Report Hasil",
    saveReportHasil: "Gagal menyimpan Report Hasil", approveReportHasil: "Gagal menyetujui Report Hasil",
    kontrolMingguan: "Gagal memuat Kontrol Mingguan", saveKontrolMingguan: "Gagal menyimpan Kontrol Mingguan",
  }[action] || "Gagal terhubung ke server";
  return `${label} (HTTP ${status})`;
}

async function apiGet(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_URL}?${qs}`);
  if (!res.ok) throw new Error(httpErrorMessage(params.action, res.status));
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiPost(body) {
  // PENTING: jangan set header "Content-Type: application/json" di sini.
  // Kalau di-set, browser akan mengirim "preflight" request (OPTIONS) lebih
  // dulu, dan Google Apps Script web app tidak bisa menjawab preflight itu,
  // sehingga permintaan akan gagal karena CORS. Membiarkan body sebagai
  // string tanpa header khusus membuat browser mengirimnya sebagai
  // "simple request" yang langsung diterima Apps Script.
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(httpErrorMessage(body.action, res.status));
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export function fetchMaster(system) {
  return apiGet({ action: "master", system }).then((d) => d.points || []);
}

export function fetchEntries(system, month) {
  return apiGet({ action: "entries", system, month }).then((d) => d.entries || []);
}

// Ambil entri SEMUA sistem dalam satu kali panggilan (dipakai Pusat
// Notifikasi) — jauh lebih cepat daripada 5 panggilan terpisah karena tiap
// panggilan ke Apps Script punya overhead cold-start sendiri.
export function fetchAllEntries(month) {
  return apiGet({ action: "allEntries", month }).then((d) => d.entries || {});
}

export function saveEntries(system, month, entries, token) {
  return apiPost({ action: "saveEntries", system, month, entries, token });
}

export function fetchReport(system, month) {
  return apiGet({ action: "report", system, month });
}

export function saveReport(system, month, narrative, token) {
  return apiPost({ action: "saveReport", system, month, narrative, token });
}

export function approveDikaji(system, month, token) {
  return apiPost({ action: "approveDikaji", system, month, token });
}

export function approveMengetahui(system, month, token) {
  return apiPost({ action: "approveMengetahui", system, month, token });
}

export function fetchStatusIndex(month) {
  return apiGet({ action: "statusIndex", month }).then((d) => d.status || {});
}

export function fetchActivityLog(token, { month, system } = {}) {
  const params = { action: "activityLog", token };
  if (month) params.month = month;
  if (system) params.system = system;
  return apiGet(params).then((d) => d.logs || []);
}

// --- AUTH ---
export function login(username, password) {
  return apiPost({ action: "login", username, password });
}

export function logout(token) {
  return apiPost({ action: "logout", token }).catch(() => {});
}

export function changePassword(oldPassword, newPassword, token) {
  return apiPost({ action: "changePassword", oldPassword, newPassword, token });
}

export function whoami(token) {
  return apiGet({ action: "whoami", token });
}

// --- REPORT HASIL PEMERIKSAAN (formulir QC 1 bulan penuh, digitalisasi FM.QC.063 dkk) ---
export function fetchReportHasil(system, month) {
  return apiGet({ action: "reportHasil", system, month });
}

export function saveReportHasil(system, month, token) {
  return apiPost({ action: "saveReportHasil", system, month, token });
}

export function approveReportHasil(system, month, token) {
  return apiPost({ action: "approveReportHasil", system, month, token });
}

// --- KONTROL MINGGUAN (Nomor Kontrol Media/Bakteri + hasil Kontrol Positif/Negatif, per minggu) ---
export function fetchKontrolMingguan() {
  return apiGet({ action: "kontrolMingguan" }).then((d) => d.records || []);
}

export function saveKontrolMingguan(records, token) {
  return apiPost({ action: "saveKontrolMingguan", records, token });
}

// Vercel Serverless Function (bukan Apps Script) — jalan di domain website sendiri,
// jadi tidak perlu urusan CORS seperti panggilan ke Apps Script di atas.
export async function generateNarrative({ systemLabel, jenisAir, monthLabel, stats, prevStats, prevSummary }) {
  const res = await fetch("/api/generate-narrative", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemLabel, jenisAir, monthLabel, stats, prevStats, prevSummary }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
