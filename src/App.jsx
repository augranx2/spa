import React, { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  LineChart, Line, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Printer, Loader2, Sparkles, RotateCcw,
  AlertTriangle, CheckCircle2, XCircle, FileQuestion, LayoutDashboard,
  Droplet, Flame, Layers, LogIn, LogOut, User, History, Lock, Calendar as CalendarIcon,
  Bell, AlertOctagon, Clock, CheckCheck, FileCheck2, KeyRound, ShieldCheck, Menu, X, ChevronDown, ArrowLeft, Download,
} from "lucide-react";
import {
  fetchMaster, fetchEntries, saveEntries as apiSaveEntries,
  fetchReport, saveReport as apiSaveReport, fetchStatusIndex,
  generateNarrative, approveDikaji as apiApproveDikaji,
  approveMengetahui as apiApproveMengetahui, fetchActivityLog,
  fetchReportHasil, saveReportHasil as apiSaveReportHasil, approveReportHasil as apiApproveReportHasil,
  changePassword as apiChangePassword,
  fetchKontrolMingguan, saveKontrolMingguan as apiSaveKontrolMingguan,
} from "./api.js";
import {
  generateLocalNarrative, PARAM_META, PARAMS_BY_JENIS, LIMITS, getLimit,
  QUALI_OPTIONS, statusFor, parseNumericValue, fullDateID, weekKeyForISO,
  weekLabel, findKontrolMingguan, monthDefaultWeekKey,
  JENIS_RUTIN, JENIS_RESAMPLING, isResampleEntry, paramUlangList,
  findResample, collectFindings, selisihHari,
} from "./narrativeGenerator.js";
import { useAuth, hasAccess } from "./auth.js";

/* =========================================================================
   1. KONFIGURASI SISTEM AIR & GRUP NAVIGASI
   ========================================================================= */
const SYSTEMS = [
  { key: "pw_nbl", jenis: "PW", label: "Purified Water — NBL" },
  { key: "pw_sefalosporin", jenis: "PW", label: "Purified Water — Sefalosporin" },
  { key: "pw_betalaktam", jenis: "PW", label: "Purified Water — Betalaktam" },
  { key: "wfi_sefalosporin", jenis: "WFI", label: "Water For Injection — Sefalosporin" },
  { key: "ps_sefalosporin_steril", jenis: "Pure Steam", label: "Pure Steam — Sefalosporin Steril" },
];

const GROUPS = [
  {
    key: "pw",
    title: "Purified Water (PW)",
    items: ["pw_nbl", "pw_sefalosporin", "pw_betalaktam"],
  },
  {
    key: "wfi",
    title: "Water For Injection (WFI)",
    items: ["wfi_sefalosporin"],
  },
  {
    key: "ps",
    title: "Pure Steam (PS)",
    items: ["ps_sefalosporin_steril"],
  },
];

const DOC_NUMBERS = {
  pw_nbl: { no: "FM.QC.355/R4", tglBerlaku: "01/02/2024", menggantikanNo: "FM.QC.355/R3", tglBerlakuLama: "05/10/2022" },
  pw_betalaktam: { no: "FM.QC.040/R6", tglBerlaku: "05/10/2022", menggantikanNo: "FM.QC.040/R5", tglBerlakuLama: "01/10/2019" },
  pw_sefalosporin: { no: "FM.QC.039/R7", tglBerlaku: "01/02/2024", menggantikanNo: "FM.QC.039/R6", tglBerlakuLama: "05/10/2022" },
  wfi_sefalosporin: { no: "FM.QC.063/R2", tglBerlaku: "05/10/2022", menggantikanNo: "FM.QC.063/R1", tglBerlakuLama: "18/05/2020" },
  ps_sefalosporin_steril: { no: "FM.QC.713/R0", tglBerlaku: "21/09/2022", menggantikanNo: "-", tglBerlakuLama: "-" },
};

function uid() {
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso, days) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const MONTHS_ID_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
function monthLabel(monthKey) {
  if (!monthKey) return "";
  const [y, m] = monthKey.split("-");
  return `${MONTHS_ID_FULL[Number(m) - 1] || m} ${y}`;
}
function shortDate(iso) {
  if (!iso) return "";
  const [, m, d] = String(iso).split("-");
  return `${d}/${m}`;
}
function prevMonthKey(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function displayValue(raw) {
  if (raw === null || raw === undefined || raw === "") return "-";
  const str = String(raw).trim();
  if (/^<\s*[\d.,]+$/.test(str)) return str.replace(/\s+/g, "").replace(".", ",");
  return str.replace(/\./g, ",");
}

function normalizeNumericInput(str) {
  if (str === "" || str === "-") return str;
  return str.replace(/\./g, ",");
}

/* =========================================================================
   1b. TOAST / NOTIFIKASI POP-UP
   ========================================================================= */
const ToastContext = React.createContext(null);

// Dipakai komponen mana pun: const toast = useToast(); toast.success("...")
function useToast() {
  const ctx = React.useContext(ToastContext);
  // Fallback aman kalau komponen dipakai di luar provider (mis. halaman /verify)
  return ctx || { success: () => {}, error: () => {}, info: () => {} };
}

const TOAST_STYLE = {
  success: { wrap: "border-emerald-200 bg-white", bar: "bg-emerald-500", icon: "text-emerald-600", Icon: CheckCircle2 },
  error: { wrap: "border-red-200 bg-white", bar: "bg-red-500", icon: "text-red-600", Icon: XCircle },
  info: { wrap: "border-slate-200 bg-white", bar: "bg-teal-600", icon: "text-teal-700", Icon: Bell },
};

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type, message, ms) => {
    const id = uid();
    setToasts((list) => [...list, { id, type, message }]);
    setTimeout(() => remove(id), ms || (type === "error" ? 7000 : 3500));
  }, [remove]);

  const api = useMemo(() => ({
    success: (m, ms) => push("success", m, ms),
    error: (m, ms) => push("error", m, ms),
    info: (m, ms) => push("info", m, ms),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined" && createPortal(
        <div className="no-print pointer-events-none fixed inset-x-0 top-4 z-[9999] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:items-end">
          {toasts.map((t) => {
            const st = TOAST_STYLE[t.type] || TOAST_STYLE.info;
            const Icon = st.Icon;
            return (
              <div key={t.id}
                className={`pointer-events-auto flex w-full max-w-md items-start gap-3 overflow-hidden rounded-2xl border ${st.wrap} p-3.5 pr-2.5 shadow-lg ring-1 ring-black/5`}
                style={{ animation: "toastIn .22s ease-out" }}>
                <span className={`mt-0.5 shrink-0 ${st.icon}`}><Icon size={18} /></span>
                <p className="flex-1 text-xs font-semibold leading-relaxed text-slate-700">{t.message}</p>
                <button onClick={() => remove(t.id)} className="shrink-0 rounded-lg p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500" title="Tutup">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

/* =========================================================================
   2. QR VERIFIKASI DIGITAL
   ========================================================================= */
function buildVerifyUrl(params) {
  const qs = new URLSearchParams(params).toString();
  return `${window.location.origin}/verify?${qs}`;
}

function VerifyQR({ type, system, period, slot, size = 52 }) {
  const params = { type, system, month: period, slot };
  const url = buildVerifyUrl(params);
  return (
    <div className="flex flex-col items-center gap-1">
      <QRCodeSVG value={url} size={size} level="M" bgColor="#ffffff" fgColor="#0f172a" />
      <span className="text-center text-[9px] leading-tight text-slate-400">Scan Verifikasi</span>
    </div>
  );
}

/* =========================================================================
   3. DATEPICKER CUSTOM INDONESIA
   ========================================================================= */
function isoToID(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}
function idToISO(text) {
  const m = String(text || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dd = d.padStart(2, "0");
  const mm = mo.padStart(2, "0");
  if (Number(dd) < 1 || Number(dd) > 31 || Number(mm) < 1 || Number(mm) > 12) return null;
  return `${y}-${mm}-${dd}`;
}
function DateInputID({ value, onChange, disabled, className }) {
  const [text, setText] = useState(isoToID(value));
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [viewYM, setViewYM] = useState(() => {
    const iso = value || todayISO();
    const [y, m] = iso.split("-");
    return { y: Number(y), m: Number(m) - 1 };
  });
  const inputRef = useRef(null);
  const popRef = useRef(null);

  useEffect(() => { setText(isoToID(value)); }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(ev) {
      if (inputRef.current && inputRef.current.contains(ev.target)) return;
      if (popRef.current && popRef.current.contains(ev.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    function onScroll() { setOpen(false); }
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function computePos() {
    const el = inputRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const popW = 224;
    const popH = 230;
    let top = rect.bottom + 4;
    let left = rect.left;
    if (top + popH > window.innerHeight) top = rect.top - popH - 4;
    if (left + popW > window.innerWidth) left = Math.max(4, window.innerWidth - popW - 4);
    return { top, left };
  }

  function openCalendar() {
    if (disabled) return;
    const iso = value || idToISO(text) || todayISO();
    const [y, m] = iso.split("-");
    setViewYM({ y: Number(y), m: Number(m) - 1 });
    setPos(computePos());
    setOpen(true);
  }

  function shiftMonth(delta) {
    setViewYM((v) => {
      let m = v.m + delta;
      let y = v.y;
      if (m < 0) { m = 11; y -= 1; }
      if (m > 11) { m = 0; y += 1; }
      return { y, m };
    });
  }

  function pickDay(d) {
    const iso = `${viewYM.y}-${String(viewYM.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    onChange(iso);
    setOpen(false);
  }

  const daysInMonth = new Date(viewYM.y, viewYM.m + 1, 0).getDate();
  const firstDow = new Date(viewYM.y, viewYM.m, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="relative inline-block">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          placeholder="dd/mm/yyyy"
          disabled={disabled}
          value={text}
          onFocus={openCalendar}
          onClick={openCalendar}
          onChange={(ev) => {
            const t = ev.target.value;
            setText(t);
            const iso = idToISO(t);
            if (iso) onChange(iso);
          }}
          className={`${className} ${disabled ? "" : "cursor-pointer pr-6"}`}
        />
        {!disabled && (
          <button
            type="button"
            tabIndex={-1}
            onClick={openCalendar}
            className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            title="Buka kalender"
          >
            <CalendarIcon size={13} />
          </button>
        )}
      </div>
      {open && !disabled && pos && createPortal(
        <div
          ref={popRef}
          className="only-screen fixed z-50 w-56 rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-2xl"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100">‹</button>
            <span className="text-xs font-bold text-slate-700">{MONTHS_ID_FULL[viewYM.m]} {viewYM.y}</span>
            <button type="button" onClick={() => shiftMonth(1)} className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-100">›</button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-slate-400">
            {["M", "S", "S", "R", "K", "J", "S"].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {cells.map((d, i) => {
              if (!d) return <span key={i} />;
              const iso = `${viewYM.y}-${String(viewYM.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const isSelected = iso === value;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => pickDay(d)}
                  className={`rounded-lg py-1 hover:bg-teal-50 ${isSelected ? "bg-teal-700 text-white hover:bg-teal-700 font-bold" : "text-slate-600"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* =========================================================================
   4. AUTO-RESIZE TEXTAREA
   ========================================================================= */
function AutoTextarea({ value, onChange, rows = 3, placeholder, className, readOnly = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);
  const printClassName = (className || "")
    .split(" ")
    .filter((c) => c && !c.startsWith("focus:") && !c.startsWith("border") && !c.startsWith("ring") && c !== "rounded-lg")
    .join(" ");
  return (
    <>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        readOnly={readOnly}
        className={`only-screen ${className} ${readOnly ? "bg-slate-50 text-slate-500" : ""}`}
        style={{ overflow: "hidden", resize: "none" }}
      />
      <div className={`only-print whitespace-pre-wrap text-justify border-0 ${printClassName}`}>
        {value || <span className="text-slate-300">-</span>}
      </div>
    </>
  );
}

/* =========================================================================
   5. STATUS PILL & GRAFIK TREN RECHARTS
   ========================================================================= */
function StatusPill({ level, hasData }) {
  if (!hasData) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold bg-slate-100 text-slate-500">
        Belum ada data
      </span>
    );
  }
  if (level >= 4) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold" style={{ background: "#fee2e2", color: "#b91c1c" }}>
        <AlertTriangle size={13} /> Melebihi Syarat
      </span>
    );
  }
  if (level === 3) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold" style={{ background: "#ffedd5", color: "#c2410c" }}>
        <AlertTriangle size={13} /> Terkendali (Perlu Perhatian)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold" style={{ background: "#dcfce7", color: "#15803d" }}>
      <CheckCircle2 size={13} /> Terkendali
    </span>
  );
}

function statusForChartValue(value, limit) {
  const isBi = limit.syaratMin !== undefined;
  if (isBi) {
    if (value < limit.syaratMin || value > limit.syaratMax) return { label: "Melebihi Syarat", color: "#b91c1c" };
    if (value < limit.actionMin || value > limit.actionMax) return { label: "Action", color: "#c2410c" };
    if (value < limit.alertMin || value > limit.alertMax) return { label: "Alert", color: "#b45309" };
    return { label: "Terkendali", color: "#15803d" };
  }
  if (value < limit.alertMax) return { label: "Terkendali", color: "#15803d" };
  if (value < limit.actionMax) return { label: "Alert", color: "#b45309" };
  if (value < limit.syaratMax) return { label: "Action", color: "#c2410c" };
  return { label: "Melebihi Syarat", color: "#b91c1c" };
}

function ChartDot({ cx, cy, payload, limit }) {
  if (cx == null || cy == null) return null;
  const s = statusForChartValue(payload.value, limit);
  // Hasil sampling ulang tetap ikut dihitung di tren, tapi digambar sebagai
  // belah ketupat bergaris biru supaya bisa dibedakan dari sampling rutin.
  if (payload.ulang) {
    return (
      <g>
        <rect x={cx - 4.5} y={cy - 4.5} width={9} height={9} transform={`rotate(45 ${cx} ${cy})`}
          fill={s.color} stroke="#0369a1" strokeWidth={1.8} />
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={4} fill={s.color} stroke="#fff" strokeWidth={1.5} />;
}

function ChartTooltip({ active, payload, limit, unit }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const s = statusForChartValue(p.value, limit);
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur-xs px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 max-w-[160px] font-semibold text-slate-600">{p.label}</p>
      <p className="text-sm font-bold" style={{ color: s.color }}>{displayValue(p.value)}{unit ? ` ${unit}` : ""}</p>
      <p className="font-medium" style={{ color: s.color }}>{s.label}</p>
      {p.ulang && <p className="mt-0.5 font-semibold text-sky-700">Hasil sampling ulang</p>}
    </div>
  );
}

function LegendChip({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function ParamChart({ entries, paramKey, systemLabel, jenis }) {
  const meta = PARAM_META[paramKey];
  const limit = getLimit(paramKey, jenis);
  if (!limit || limit.qualitative) return null;
  const isBidirectional = limit.syaratMin !== undefined;

  const pointCounts = {};
  entries.forEach((e) => { pointCounts[e.titikSampling] = (pointCounts[e.titikSampling] || 0) + 1; });

  const outlierCutoff = limit.syaratMax !== undefined ? Math.max(limit.syaratMax * 5, 100) : 1000;
  let excludedCount = 0;
  const data = entries
    .map((e) => {
      const raw = e[paramKey];
      if (raw === null || raw === undefined || raw === "") return null;
      const v = parseNumericValue(raw);
      if (v === null) return null;
      if (limit.syaratMin === undefined && v > outlierCutoff) { excludedCount += 1; return null; }
      const ulang = isResampleEntry(e);
      const baseLabel = pointCounts[e.titikSampling] > 1 ? `${e.titikSampling} (${shortDate(e.tanggal)})` : e.titikSampling;
      const label = ulang ? `${baseLabel} ↻` : baseLabel;
      return { label, value: v, room: e.namaRuangan || e.titikSampling, ulang };
    })
    .filter(Boolean);
  if (data.length === 0) return null;

  let domain;
  if (isBidirectional) {
    const lo = Math.min(limit.syaratMin, ...data.map((d) => d.value));
    const hi = Math.max(limit.syaratMax, ...data.map((d) => d.value));
    const pad = (hi - lo) * 0.15 || 0.5;
    domain = [lo - pad, hi + pad];
  } else {
    domain = [0, Math.max(limit.syaratMax, ...data.map((d) => d.value)) * 1.2];
  }

  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);
  const peakStatus = statusForChartValue(peak.value, limit);
  const gradId = `paramGrad-${jenis}-${paramKey}`.replace(/[^a-zA-Z0-9-]/g, "");

  return (
    <div className="avoid-break overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-slate-100 px-4 py-2.5 bg-slate-50/50">
        <div>
          <p className="text-xs font-bold text-slate-700">{meta.label} — {systemLabel}</p>
          <p className="text-[11px] text-slate-400">
            Tertinggi bulan ini: <span className="font-semibold" style={{ color: peakStatus.color }}>{displayValue(peak.value)}{meta.unit ? ` ${meta.unit}` : ""}</span> ({peak.room})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <LegendChip color="#15803d" label="Terkendali" />
          <LegendChip color="#b45309" label={isBidirectional ? `Alert ${limit.alertMin}–${limit.alertMax}` : `Alert ${limit.alertMax}`} />
          <LegendChip color="#c2410c" label={isBidirectional ? `Action ${limit.actionMin}–${limit.actionMax}` : `Action ${limit.actionMax}`} />
          <LegendChip color="#b91c1c" label={isBidirectional ? `Syarat ${limit.syaratMin}–${limit.syaratMax}` : `Syarat ${limit.syaratMax}`} />
          {data.some((d) => d.ulang) && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
              <span className="h-1.5 w-1.5 rotate-45 bg-sky-600" /> Sampling ulang (↻)
            </span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 10, right: 15, left: 10, bottom: 50 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          {isBidirectional ? (
            <>
              <ReferenceArea y1={domain[0]} y2={limit.syaratMin} fill="#ef4444" fillOpacity={0.06} ifOverflow="hidden" />
              <ReferenceArea y1={limit.syaratMin} y2={limit.actionMin} fill="#f97316" fillOpacity={0.07} ifOverflow="hidden" />
              <ReferenceArea y1={limit.actionMin} y2={limit.alertMin} fill="#f59e0b" fillOpacity={0.06} ifOverflow="hidden" />
              <ReferenceArea y1={limit.alertMin} y2={limit.alertMax} fill="#22c55e" fillOpacity={0.05} ifOverflow="hidden" />
              <ReferenceArea y1={limit.alertMax} y2={limit.actionMax} fill="#f59e0b" fillOpacity={0.06} ifOverflow="hidden" />
              <ReferenceArea y1={limit.actionMax} y2={limit.syaratMax} fill="#f97316" fillOpacity={0.07} ifOverflow="hidden" />
              <ReferenceArea y1={limit.syaratMax} y2={domain[1]} fill="#ef4444" fillOpacity={0.06} ifOverflow="hidden" />
            </>
          ) : (
            <>
              <ReferenceArea y1={0} y2={limit.alertMax} fill="#22c55e" fillOpacity={0.05} ifOverflow="hidden" />
              <ReferenceArea y1={limit.alertMax} y2={limit.actionMax} fill="#f59e0b" fillOpacity={0.06} ifOverflow="hidden" />
              <ReferenceArea y1={limit.actionMax} y2={limit.syaratMax} fill="#f97316" fillOpacity={0.07} ifOverflow="hidden" />
              <ReferenceArea y1={limit.syaratMax} y2={domain[1]} fill="#ef4444" fillOpacity={0.06} ifOverflow="hidden" />
            </>
          )}
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} angle={-35} textAnchor="end" interval={0} height={62} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
          <YAxis domain={domain} tick={{ fontSize: 11, fill: "#64748b" }} width={38} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip limit={limit} unit={meta.unit} />} />
          <ReferenceLine y={limit.syaratMax} stroke="#dc2626" strokeWidth={1.25} strokeDasharray="4 3" />
          <ReferenceLine y={limit.actionMax} stroke="#f97316" strokeWidth={1} strokeDasharray="4 3" />
          <ReferenceLine y={limit.alertMax} stroke="#eab308" strokeWidth={1} strokeDasharray="4 3" />
          {isBidirectional && (
            <>
              <ReferenceLine y={limit.syaratMin} stroke="#dc2626" strokeWidth={1.25} strokeDasharray="4 3" />
              <ReferenceLine y={limit.actionMin} stroke="#f97316" strokeWidth={1} strokeDasharray="4 3" />
              <ReferenceLine y={limit.alertMin} stroke="#eab308" strokeWidth={1} strokeDasharray="4 3" />
            </>
          )}
          <Area type="monotone" dataKey="value" stroke="none" fill={`url(#${gradId})`} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#0d9488"
            strokeWidth={2.25}
            dot={<ChartDot limit={limit} />}
            activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// Warna kotak input mengikuti status nilai terhadap spesifikasi, jadi QC
// langsung tahu begitu selesai mengetik — tanpa menunggu simpan.
const INPUT_STATUS_CLASS = {
  0: "border-slate-200 text-slate-700",
  1: "border-emerald-300 bg-emerald-50 text-emerald-800",
  2: "border-amber-300 bg-amber-50 text-amber-800",
  3: "border-orange-400 bg-orange-50 text-orange-800",
  4: "border-red-400 bg-red-50 text-red-700",
};
const STATUS_TITLE = {
  0: "Belum ada nilai",
  1: "Terkendali — memenuhi syarat",
  2: "Mencapai Alert Limit",
  3: "Mencapai Action Limit — perlu tindak lanjut/sampling ulang",
  4: "Di luar batas Syarat — penyimpangan",
};

const STATUS_BADGE_CLASS = {
  0: "bg-slate-100 text-slate-500",
  1: "bg-emerald-50 text-emerald-700",
  2: "bg-amber-50 text-amber-700",
  3: "bg-orange-50 text-orange-700",
  4: "bg-red-50 text-red-700",
};

function ParamValueTable({ entries, paramKey, jenis }) {
  // `entries` = seluruh baris periode ini (termasuk baris sampling ulang),
  // dipakai untuk memasangkan temuan dengan tindak lanjutnya.
  const meta = PARAM_META[paramKey];
  const qualitative = getLimit(paramKey, jenis).qualitative;
  const rows = entries.filter((e) => e[paramKey] !== null && e[paramKey] !== undefined && e[paramKey] !== "");
  if (rows.length === 0) return null;

  return (
    <div className="avoid-break overflow-hidden rounded-2xl border border-slate-200">
      <div className="flex items-center justify-between bg-gradient-to-r from-teal-950 via-teal-900 to-teal-800 px-4 py-2.5">
        <h4 className="text-xs font-bold uppercase tracking-wide text-white">{meta.label}</h4>
        <span className="text-xs font-medium text-teal-200">{rows.length} titik data</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="whitespace-nowrap px-4 py-2">Titik Sampling</th>
              <th className="whitespace-nowrap px-4 py-2">Nama Ruangan</th>
              <th className="whitespace-nowrap px-4 py-2">Tanggal</th>
              <th className="whitespace-nowrap px-4 py-2">Nilai</th>
              <th className="whitespace-nowrap px-4 py-2">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const st = statusFor(e[paramKey], paramKey, jenis);
              const ulang = isResampleEntry(e);
              // Untuk hasil rutin yang bermasalah, cari baris sampling ulangnya.
              const tindak = !ulang && st.level >= 3 ? findResample(entries, e, paramKey) : null;
              const tindakStatus = tindak ? statusFor(tindak[paramKey], paramKey, jenis) : null;
              const ditutup = tindak && tindakStatus.level < 3 && String(tindak.catatanTindakLanjut || "").trim();
              return (
                <tr key={e.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/50 ${ulang ? "bg-sky-50/40" : ""}`}>
                  <td className="whitespace-nowrap px-4 py-2 font-semibold text-slate-800">
                    {e.titikSampling || "-"}
                    {ulang && <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">ULANG</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{e.namaRuangan || "-"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">{isoToID(e.tanggal)}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-md px-2.5 py-0.5 text-xs font-bold ${STATUS_BADGE_CLASS[st.level] || STATUS_BADGE_CLASS[0]}`}>
                      {displayValue(e[paramKey])}{!qualitative && meta.unit ? ` ${meta.unit}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[11px] leading-snug">
                    {ulang ? (
                      <span className="text-sky-800">
                        Uji ulang atas hasil {isoToID(e.refTanggal)}
                        {String(e.catatanTindakLanjut || "").trim() ? ` — ${e.catatanTindakLanjut}` : ""}
                      </span>
                    ) : ditutup ? (
                      <span className="font-semibold text-emerald-700">
                        Ditindaklanjuti — sampling ulang {isoToID(tindak.tanggal)}: {displayValue(tindak[paramKey])} (memenuhi syarat)
                      </span>
                    ) : st.level >= 3 ? (
                      <span className="font-semibold text-orange-700">
                        {tindak ? "Sampling ulang tercatat, temuan belum ditutup" : "Belum ada sampling ulang"}
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================================
   6. INPUT DATA HARIAN/BULANAN (EntryEditor)
   ========================================================================= */
function EntryRow({ entry, masterPoints, params, readOnly, canDelete, onChange, onDelete, allEntries = [], jenis }) {
  const isCustom = entry._custom || !masterPoints.some((p) => p.code === entry.titikSampling);
  const isUlang = isResampleEntry(entry);

  // Baris asal yang bisa dirujuk: titik sampling sama, bukan baris ulang,
  // dan punya minimal satu parameter yang mencapai Action Limit / di luar Syarat.
  const kandidatAsal = allEntries.filter(
    (o) =>
      o !== entry &&
      !isResampleEntry(o) &&
      o.titikSampling &&
      o.titikSampling === entry.titikSampling &&
      params.some((p) => statusFor(o[p], p, jenis).level >= 3)
  );
  const asal = kandidatAsal.find((o) => o.tanggal === entry.refTanggal) || null;
  const paramBermasalah = asal ? params.filter((p) => statusFor(asal[p], p, jenis).level >= 3) : [];
  const dipilih = paramUlangList(entry);

  const handlePick = (val) => {
    if (val === "__custom__") {
      onChange({ ...entry, _custom: true });
      return;
    }
    const pt = masterPoints.find((p) => p.code === val);
    if (pt) onChange({ ...entry, _custom: false, titikSampling: pt.code, namaRuangan: pt.name });
  };
  const togglePar = (p) => {
    const next = dipilih.includes(p) ? dipilih.filter((x) => x !== p) : dipilih.concat(p);
    onChange({ ...entry, paramUlang: next.join(", ") });
  };

  return (
    <>
    <tr className={`border-b border-slate-100 align-top hover:bg-slate-50/50 ${isUlang ? "bg-sky-50/50" : ""}`}>
      <td className="px-2 py-1.5">
        <DateInputID disabled={readOnly} className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50"
          value={entry.tanggal || ""} onChange={(iso) => onChange({ ...entry, tanggal: iso })} />
      </td>
      <td className="px-2 py-1.5">
        <select disabled={readOnly} className={`w-32 rounded-lg border px-2 py-1 text-xs disabled:bg-slate-50 font-semibold ${isUlang ? "border-sky-300 text-sky-800 bg-sky-50" : "border-slate-200 text-slate-600"}`}
          value={isUlang ? JENIS_RESAMPLING : JENIS_RUTIN}
          onChange={(ev) => onChange({
            ...entry,
            jenisSampling: ev.target.value,
            ...(ev.target.value === JENIS_RUTIN ? { refTanggal: "", paramUlang: "", catatanTindakLanjut: "" } : {}),
          })}>
          <option value={JENIS_RUTIN}>Rutin</option>
          <option value={JENIS_RESAMPLING}>Sampling Ulang</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select disabled={readOnly} className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50"
          value={isCustom ? "__custom__" : entry.titikSampling || "__custom__"} onChange={(ev) => handlePick(ev.target.value)}>
          <option value="__custom__">-- Input manual --</option>
          {masterPoints.map((p) => <option key={p.code} value={p.code}>{p.code}{p.name ? ` — ${p.name}` : ""}</option>)}
        </select>
        {isCustom && (
          <input type="text" disabled={readOnly} className="mt-1 w-40 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50"
            placeholder="Kode titik sampling" value={entry.titikSampling || ""}
            onChange={(ev) => onChange({ ...entry, titikSampling: ev.target.value })} />
        )}
      </td>
      <td className="px-2 py-1.5">
        <input type="text" disabled={readOnly || !isCustom} className="w-36 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50"
          placeholder="Nama ruangan/area" value={entry.namaRuangan || ""}
          onChange={(ev) => onChange({ ...entry, namaRuangan: ev.target.value })} />
      </td>
      {params.map((p) => {
        const opts = QUALI_OPTIONS[p];
        const st = statusFor(entry[p], p, jenis);
        const warna = INPUT_STATUS_CLASS[st.level] || INPUT_STATUS_CLASS[0];
        return (
          <td key={p} className="px-2 py-1.5">
            {opts ? (
              <select disabled={readOnly} title={STATUS_TITLE[st.level]}
                className={`w-28 rounded-lg border px-2 py-1 text-center text-xs font-semibold transition-colors ${warna}`}
                value={entry[p] || ""} onChange={(ev) => onChange({ ...entry, [p]: ev.target.value })}>
                <option value="">-</option>
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type="text" disabled={readOnly} title={STATUS_TITLE[st.level]}
                className={`w-20 rounded-lg border px-2 py-1 text-center text-xs font-semibold transition-colors ${warna}`}
                placeholder="-" value={entry[p] === null || entry[p] === undefined ? "" : entry[p]}
                onChange={(ev) => {
                  const raw = normalizeNumericInput(ev.target.value.trim());
                  onChange({ ...entry, [p]: raw === "-" ? null : raw });
                }} />
            )}
            {st.level >= 3 && (
              <p className={`mt-0.5 text-center text-[9px] font-bold ${st.level >= 4 ? "text-red-600" : "text-orange-600"}`}>
                {st.level >= 4 ? "TMS" : "ACTION"}
              </p>
            )}
          </td>
        );
      })}
      <td className="px-2 py-1.5 text-center">
        {canDelete && (
          <button onClick={onDelete} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition" title="Hapus baris">
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>

    {isUlang && (
      <tr className="border-b border-sky-100 bg-sky-50/60">
        <td colSpan={4 + params.length + 1} className="px-3 py-2.5">
          <div className="flex flex-wrap items-start gap-4 text-[11px]">
            <div>
              <label className="mb-1 block font-semibold uppercase tracking-wide text-sky-900">Menindaklanjuti hasil tanggal</label>
              <select disabled={readOnly} value={entry.refTanggal || ""}
                onChange={(ev) => {
                  // Begitu tanggal rujukan dipilih, seluruh parameter yang
                  // bermasalah langsung tercentang. Petugas tinggal mematikan
                  // yang tidak diuji ulang — bukan sebaliknya, supaya tidak ada
                  // temuan yang terlewat karena lupa mencentang.
                  const ref = allEntries.find((o) => !isResampleEntry(o) && o.titikSampling === entry.titikSampling && o.tanggal === ev.target.value);
                  const otomatis = ref ? params.filter((pk) => statusFor(ref[pk], pk, jenis).level >= 3) : [];
                  onChange({ ...entry, refTanggal: ev.target.value, paramUlang: otomatis.join(", ") });
                }}
                className="w-44 rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs disabled:bg-slate-50">
                <option value="">-- pilih hasil yang ditindaklanjuti --</option>
                {kandidatAsal.map((o) => (
                  <option key={o.id} value={o.tanggal}>{isoToID(o.tanggal)} — {o.titikSampling}</option>
                ))}
              </select>
              {!entry.titikSampling && <p className="mt-1 text-[10px] text-sky-700">Pilih titik sampling dulu.</p>}
              {entry.titikSampling && kandidatAsal.length === 0 && (
                <p className="mt-1 text-[10px] text-sky-700">Tidak ada hasil di titik ini yang perlu ditindaklanjuti.</p>
              )}
            </div>

            <div>
              <label className="mb-1 block font-semibold uppercase tracking-wide text-sky-900">Parameter yang diuji ulang</label>
              {paramBermasalah.length === 0 ? (
                <p className="text-[10px] text-sky-700">Pilih tanggal asal terlebih dahulu.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {dipilih.length === 0 && (
                    <span className="w-full text-[10px] font-semibold text-orange-700">
                      Belum ada yang dipilih — dianggap menindaklanjuti semua parameter di bawah ini.
                    </span>
                  )}
                  {paramBermasalah.map((pk) => (
                    <button key={pk} type="button" disabled={readOnly} onClick={() => togglePar(pk)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                        dipilih.includes(pk) ? "border-sky-600 bg-sky-700 text-white" : "border-sky-300 bg-white text-sky-800 hover:bg-sky-100"}`}>
                      {PARAM_META[pk].short} ({displayValue(asal[pk])})
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block font-semibold uppercase tracking-wide text-sky-900">Catatan tindak lanjut</label>
              <input type="text" disabled={readOnly} value={entry.catatanTindakLanjut || ""}
                placeholder="mis. dilakukan sanitasi & flushing loop, lalu sampling ulang"
                onChange={(ev) => onChange({ ...entry, catatanTindakLanjut: ev.target.value })}
                className="w-full rounded-lg border border-sky-300 bg-white px-2 py-1 text-xs disabled:bg-slate-50" />
              {entry.ditutupOleh && (
                <p className="mt-1 text-[10px] text-sky-700">Ditutup oleh {entry.ditutupOleh}{entry.tanggalTutup ? ` · ${entry.tanggalTutup}` : ""}</p>
              )}
            </div>
          </div>
        </td>
      </tr>
    )}
    </>
  );
}

function EntryEditor({ system, masterPoints, entries, setEntries, onSave, saving, canInput = false, canDeleteExisting = false, accessNote }) {
  const params = PARAMS_BY_JENIS[system.jenis] || [];
  const addRow = () => {
    const defaultTanggal = entries[0]?.tanggal || todayISO();
    const blank = { id: uid(), tanggal: defaultTanggal, titikSampling: "", namaRuangan: "", jenisSampling: JENIS_RUTIN, refTanggal: "", paramUlang: "", catatanTindakLanjut: "" };
    params.forEach((p) => { blank[p] = ""; });
    setEntries([blank, ...entries]);
  };
  const addResampleRow = () => {
    const blank = { id: uid(), tanggal: todayISO(), titikSampling: "", namaRuangan: "", jenisSampling: JENIS_RESAMPLING, refTanggal: "", paramUlang: "", catatanTindakLanjut: "" };
    params.forEach((p) => { blank[p] = ""; });
    setEntries([blank, ...entries]);
  };
  const isExistingRow = (e) => typeof e.id === "string" && e.id.startsWith("row-");
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <div className="mb-3.5 flex items-center justify-between border-b pb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Entri Data Pengujian</h3>
        {canInput ? (
          <div className="flex gap-2">
            <button onClick={addRow} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs">
              <Plus size={14} /> Tambah Titik
            </button>
            <button onClick={addResampleRow} title="Tambah baris untuk hasil sampling ulang (tindak lanjut hasil di atas Action Limit)"
              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 shadow-2xs">
              <RotateCcw size={14} /> Sampling Ulang
            </button>
            <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-60 shadow-xs">
              {saving ? <Loader2 size={13} className="animate-spin" /> : null} Simpan Data Pengujian
            </button>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
            <Lock size={12} /> {accessNote || "Mode lihat saja"}
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="py-8 text-center text-xs text-slate-400">
          {canInput ? 'Belum ada baris. Klik "Tambah Titik" untuk mulai mengisi data pengujian periode ini.' : "Belum ada data untuk periode ini."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-2 py-1.5">Tanggal</th><th className="px-2 py-1.5">Jenis</th><th className="px-2 py-1.5">Titik Sampling</th><th className="px-2 py-1.5">Nama Ruangan</th>
                {params.map((p) => <th key={p} className="px-2 py-1.5 text-center">{PARAM_META[p].short}{PARAM_META[p].unit ? ` (${PARAM_META[p].unit})` : ""}</th>)}
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e, idx) => (
                <EntryRow key={e.id} entry={e} masterPoints={masterPoints} params={params}
                  allEntries={entries} jenis={system.jenis}
                  readOnly={!canInput}
                  canDelete={canDeleteExisting || !isExistingRow(e)}
                  onChange={(next) => { const c = entries.slice(); c[idx] = next; setEntries(c); }}
                  onDelete={() => setEntries(entries.filter((_, i) => i !== idx))} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function systemOverallLevel(entries, jenis) {
  let maxLevel = 0;
  const params = PARAMS_BY_JENIS[jenis] || [];
  entries.forEach((e) => {
    params.forEach((p) => {
      const st = statusFor(e[p], p, jenis);
      if (st.level > maxLevel) maxLevel = st.level;
    });
  });
  return maxLevel;
}

function buildStatsSummary(system, entries) {
  const params = PARAMS_BY_JENIS[system.jenis] || [];
  const stats = {};
  params.forEach((paramKey) => {
    const meta = PARAM_META[paramKey];
    const limit = getLimit(paramKey, system.jenis);
    const points = entries
      .map((e) => ({ titik: e.titikSampling, tanggal: e.tanggal, raw: e[paramKey] }))
      .filter((p) => p.raw !== null && p.raw !== undefined && p.raw !== "");

    if (limit.qualitative) {
      const positif = points.filter((p) => String(p.raw).trim() !== limit.passValue);
      stats[paramKey] = { label: meta.label, qualitative: true, totalTitik: points.length, positif: positif.map((p) => ({ titik: p.titik, tanggal: p.tanggal, hasil: p.raw })) };
      return;
    }

    const numeric = points.map((p) => ({ ...p, value: parseNumericValue(p.raw) })).filter((p) => p.value !== null);
    const noted = numeric.filter((p) => statusFor(p.raw, paramKey, system.jenis).level >= 2)
      .map((p) => ({ titik: p.titik, tanggal: p.tanggal, hasil: displayValue(p.raw), level: statusFor(p.raw, paramKey, system.jenis).level >= 4 ? "Melebihi Syarat" : statusFor(p.raw, paramKey, system.jenis).level === 3 ? "Action" : "Alert" }));

    stats[paramKey] = {
      label: meta.label, unit: meta.unit,
      limit: limit.syaratMin !== undefined
        ? { syaratMin: limit.syaratMin, syaratMax: limit.syaratMax, alertMin: limit.alertMin, actionMin: limit.actionMin, alertMax: limit.alertMax, actionMax: limit.actionMax }
        : { syaratMax: limit.syaratMax, alertMax: limit.alertMax, actionMax: limit.actionMax },
      rentang: numeric.length > 0 ? { min: displayValue(points.find((p) => p.value === Math.min(...numeric.map((n) => n.value)))?.raw), max: displayValue(points.find((p) => p.value === Math.max(...numeric.map((n) => n.value)))?.raw) } : null,
      totalTitik: points.length,
      catatan: noted,
    };
  });
  return stats;
}

function emptyNarrative() {
  return { pendahuluan: "", perParameter: {}, reviewTren: "", kesimpulan: "" };
}
function emptySignoff() {
  return { dinilai: { nama: "", jabatan: "", tanggal: "" }, diperiksa: { nama: "", jabatan: "", tanggal: "" } };
}

/* =========================================================================
   7. KONTROL MINGGUAN PANEL
   ========================================================================= */
function emptyKontrolFields() {
  return {
    noKontrolMedia: "", noKontrolBakteri: "", kontrolPositif: "", kontrolNegatif: "",
    kontrolNegatifLAL: "", kontrolPositifLAL: "", noBetLAL: "", noBetCSE: "", sensitivitasLAL: "", sensitivitasCSE: "",
  };
}

function kontrolFieldsFrom(rec) {
  const f = emptyKontrolFields();
  Object.keys(f).forEach((k) => { f[k] = rec?.[k] || ""; });
  return f;
}

function KontrolMingguanPanel({ systemKey, jenis, monthKey, entries, records, canInput, saving, onSave }) {
  const isWFIType = jenis === "WFI" || jenis === "Pure Steam";
  const defaultWeekKey = monthDefaultWeekKey(monthKey);

  const weeks = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      if (!e.tanggal) return;
      const wk = weekKeyForISO(e.tanggal);
      if (wk && !map.has(wk.key)) map.set(wk.key, wk);
    });
    return Array.from(map.values()).sort((a, b) => (a.year - b.year) || (a.month - b.month) || (a.weekNum - b.weekNum));
  }, [entries]);

  const [defaultRow, setDefaultRow] = useState(() => {
    const rec = records.find((r) => r.weekKey === defaultWeekKey && r.system === systemKey);
    return kontrolFieldsFrom(rec);
  });

  const [exceptions, setExceptions] = useState(() => {
    const prefix = monthKey + "-W";
    const init = {};
    records.forEach((r) => {
      if (r.weekKey.indexOf(prefix) !== 0) return;
      if (r.weekKey === defaultWeekKey) return;
      if (r.system !== systemKey) return;
      init[r.weekKey] = kontrolFieldsFrom(r);
    });
    return init;
  });

  const [addWeekKey, setAddWeekKey] = useState("");
  const [pendingClears, setPendingClears] = useState([]);

  function updateDefault(patch) {
    setDefaultRow((prev) => ({ ...prev, ...patch }));
  }

  function updateException(weekKey, patch) {
    setExceptions((prev) => ({ ...prev, [weekKey]: { ...prev[weekKey], ...patch } }));
  }

  function addException() {
    if (!addWeekKey) return;
    setExceptions((prev) => ({ ...prev, [addWeekKey]: { ...defaultRow } }));
    setAddWeekKey("");
  }

  function removeException(weekKey) {
    setExceptions((prev) => {
      const { [weekKey]: _removed, ...rest } = prev;
      return rest;
    });
    setPendingClears((prev) => [...prev, weekKey]);
  }

  const exceptionWeekKeys = Object.keys(exceptions).sort();
  const addableWeeks = weeks.filter((wk) => !exceptions[wk.key]);

  function handleSaveAll() {
    const out = [{ weekKey: defaultWeekKey, system: systemKey, ...defaultRow }];
    exceptionWeekKeys.forEach((weekKey) => {
      out.push({ weekKey, system: systemKey, ...kontrolFieldsFrom(exceptions[weekKey]) });
    });
    pendingClears.forEach((weekKey) => out.push({ weekKey, system: systemKey, ...emptyKontrolFields() }));
    onSave(out);
    setPendingClears([]);
  }

  function renderFieldInputs(row, onPatch) {
    return (
      <>
        <td className="px-2 py-1.5">
          <input type="text" disabled={!canInput} value={row.noKontrolMedia || ""} placeholder="-"
            onChange={(ev) => onPatch({ noKontrolMedia: ev.target.value })}
            className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50" />
        </td>
        <td className="px-2 py-1.5">
          <input type="text" disabled={!canInput} value={row.noKontrolBakteri || ""} placeholder="-"
            onChange={(ev) => onPatch({ noKontrolBakteri: ev.target.value })}
            className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50" />
        </td>
        <td className="px-2 py-1.5">
          <select disabled={!canInput} value={row.kontrolPositif || ""} onChange={(ev) => onPatch({ kontrolPositif: ev.target.value })}
            className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50 font-semibold">
            <option value="">-</option>
            {QUALI_OPTIONS.kontrolPositif.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
        <td className="px-2 py-1.5">
          <select disabled={!canInput} value={row.kontrolNegatif || ""} onChange={(ev) => onPatch({ kontrolNegatif: ev.target.value })}
            className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50 font-semibold">
            <option value="">-</option>
            {QUALI_OPTIONS.kontrolNegatif.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
        {isWFIType && (
          <>
            <td className="px-2 py-1.5">
              <select disabled={!canInput} value={row.kontrolNegatifLAL || ""} onChange={(ev) => onPatch({ kontrolNegatifLAL: ev.target.value })}
                className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50 font-semibold">
                <option value="">-</option>
                {QUALI_OPTIONS.kontrolNegatif.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </td>
            <td className="px-2 py-1.5">
              <select disabled={!canInput} value={row.kontrolPositifLAL || ""} onChange={(ev) => onPatch({ kontrolPositifLAL: ev.target.value })}
                className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50 font-semibold">
                <option value="">-</option>
                {QUALI_OPTIONS.kontrolPositif.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </td>
            <td className="px-2 py-1.5">
              <input type="text" disabled={!canInput} value={row.noBetLAL || ""} placeholder="-"
                onChange={(ev) => onPatch({ noBetLAL: ev.target.value })}
                className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50" />
            </td>
            <td className="px-2 py-1.5">
              <input type="text" disabled={!canInput} value={row.noBetCSE || ""} placeholder="-"
                onChange={(ev) => onPatch({ noBetCSE: ev.target.value })}
                className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50" />
            </td>
            <td className="px-2 py-1.5">
              <input type="text" disabled={!canInput} value={row.sensitivitasLAL || ""} placeholder="-"
                onChange={(ev) => onPatch({ sensitivitasLAL: normalizeNumericInput(ev.target.value) })}
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50 font-semibold" />
            </td>
            <td className="px-2 py-1.5">
              <input type="text" disabled={!canInput} value={row.sensitivitasCSE || ""} placeholder="-"
                onChange={(ev) => onPatch({ sensitivitasCSE: normalizeNumericInput(ev.target.value) })}
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-xs disabled:bg-slate-50 font-semibold" />
            </td>
          </>
        )}
      </>
    );
  }

  return (
    <div className="no-print mb-5 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between border-b pb-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Kontrol Mingguan</h3>
          <p className="text-[11px] text-slate-400">Nomor Kontrol Media/Bakteri &amp; hasil Kontrol Positif/Negatif{isWFIType ? " (mikrobiologi & LAL/Endotoksin)" : ""}</p>
        </div>
        {canInput && (
          <button onClick={handleSaveAll} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-50 shadow-xs">
            {saving ? <Loader2 size={13} className="animate-spin" /> : null} Simpan Kontrol Mingguan
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-2 py-1.5">Berlaku untuk</th>
              <th className="px-2 py-1.5">No. Kontrol Media</th>
              <th className="px-2 py-1.5">No. Kontrol Bakteri</th>
              <th className="px-2 py-1.5">Kontrol Positif</th>
              <th className="px-2 py-1.5">Kontrol Negatif</th>
              {isWFIType && (
                <>
                  <th className="px-2 py-1.5">Kontrol Negatif (LAL)</th>
                  <th className="px-2 py-1.5">Kontrol Positif (LAL)</th>
                  <th className="px-2 py-1.5">No Bet LAL</th>
                  <th className="px-2 py-1.5">No Bet CSE</th>
                  <th className="px-2 py-1.5">Sensitivitas LAL</th>
                  <th className="px-2 py-1.5">Sensitivitas CSE</th>
                </>
              )}
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100 bg-teal-50/40">
              <td className="px-2 py-1.5 font-bold text-teal-950">Default (Bulan Ini)</td>
              {renderFieldInputs(defaultRow, updateDefault)}
              <td className="px-2 py-1.5"></td>
            </tr>
            {exceptionWeekKeys.map((weekKey) => {
              const row = exceptions[weekKey];
              const wk = weeks.find((w) => w.key === weekKey);
              return (
                <tr key={weekKey} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-2 py-1.5 font-semibold text-slate-700">{wk ? weekLabel(wk) : weekKey}</td>
                  {renderFieldInputs(row, (patch) => updateException(weekKey, patch))}
                  <td className="px-2 py-1.5 text-center">
                    {canInput && (
                      <button onClick={() => removeException(weekKey)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition" title="Hapus pengecualian">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canInput && addableWeeks.length > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <select value={addWeekKey} onChange={(ev) => setAddWeekKey(ev.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs">
            <option value="">-- Tambah pengecualian minggu --</option>
            {addableWeeks.map((wk) => <option key={wk.key} value={wk.key}>{weekLabel(wk)}</option>)}
          </select>
          <button onClick={addException} disabled={!addWeekKey}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <Plus size={13} /> Tambah Pengecualian
          </button>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   8. SIDEBAR COMPONENT (WARNA ASLI SPA: TEAL THEME)
   ========================================================================= */
function Sidebar({ session, view, setView, status = {}, onNeedLogin, isOpen, onClose, notifications = [] }) {
  const [expandedGroups, setExpandedGroups] = useState({ pw: true, wfi: true, ps: true });

  const toggleGroup = (k) => {
    setExpandedGroups((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const navigateTo = (newView) => {
    if (newView.page === "detail" && !session) {
      onNeedLogin();
      return;
    }
    setView(newView);
    if (window.innerWidth < 1024) onClose();
  };

  const criticalCount = (notifications || []).filter((n) => n.type === "critical").length;

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-teal-950/60 backdrop-blur-xs lg:hidden transition-opacity duration-300"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-teal-950 via-teal-900 to-teal-950 text-teal-100 border-r border-teal-800/60 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-teal-800/80 bg-teal-950/80">
          <button onClick={() => navigateTo({ page: "dashboard" })} className="flex items-center gap-3 text-left">
            <img src="/logo-rama.png" alt="Logo" className="h-9 w-9 object-contain brightness-0 invert" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white tracking-tight leading-tight truncate">SPA Monitoring</p>
              <p className="text-[10px] font-medium text-teal-300 truncate">PT. Rama Emerald Multi Sukses</p>
            </div>
          </button>
          <button onClick={onClose} className="text-teal-400 hover:text-white lg:hidden p-1">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin">
          <div className="space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-teal-400/80 mb-2">Menu Utama</p>
            <button
              onClick={() => navigateTo({ page: "dashboard" })}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                view.page === "dashboard"
                  ? "bg-teal-700/80 text-white shadow-lg shadow-teal-950/50 border border-teal-500/30"
                  : "text-teal-200/80 hover:bg-teal-800/50 hover:text-white"
              }`}
            >
              <LayoutDashboard size={16} />
              <span>Dashboard Global SPA</span>
            </button>

            {session && (
              <button
                onClick={() => navigateTo({ page: "notifications" })}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  view.page === "notifications"
                    ? "bg-teal-700/80 text-white shadow-lg shadow-teal-950/50 border border-teal-500/30"
                    : "text-teal-200/80 hover:bg-teal-800/50 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Bell size={16} />
                  <span>Pusat Notifikasi &amp; Alert</span>
                </div>
                {notifications.length > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white ${
                      criticalCount > 0 ? "bg-red-500 animate-pulse" : "bg-amber-400 text-teal-950"
                    }`}
                  >
                    {notifications.length}
                  </span>
                )}
              </button>
            )}

            {session && hasAccess(session, "Supervisor") && (
              <button
                onClick={() => navigateTo({ page: "activity" })}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                  view.page === "activity"
                    ? "bg-teal-700/80 text-white shadow-lg shadow-teal-950/50 border border-teal-500/30"
                    : "text-teal-200/80 hover:bg-teal-800/50 hover:text-white"
                }`}
              >
                <History size={16} />
                <span>Riwayat Audit Trail</span>
              </button>
            )}
          </div>

          <div className="space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-teal-400/80 mb-2">Sistem Distribusi Air</p>
            {GROUPS.map((g) => {
              const isOpenGroup = !!expandedGroups[g.key];
              const isGroupActive = view.page === "detail" && g.items.includes(view.system);
              const GroupIcon = g.key === "ps" ? Flame : g.key === "wfi" ? Droplet : Layers;

              return (
                <div key={g.key} className="space-y-0.5">
                  <button
                    onClick={() => toggleGroup(g.key)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition ${
                      isGroupActive ? "text-teal-200" : "text-teal-300/80 hover:bg-teal-800/40 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <GroupIcon size={14} className="text-teal-400 shrink-0" />
                      <span className="truncate">{g.title}</span>
                    </div>
                    <ChevronDown
                      size={14}
                      className={`text-teal-400/70 transition-transform duration-200 ${isOpenGroup ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpenGroup && (
                    <div className="pl-4 pr-1 py-1 space-y-0.5 border-l border-teal-700/50 ml-4">
                      {g.items.map((sysKey) => {
                        const sys = SYSTEMS.find((s) => s.key === sysKey);
                        const st = status?.[sysKey];
                        const active = view.page === "detail" && view.system === sysKey;
                        const dotColor = st?.hasData ? (st.level >= 4 ? "#ef4444" : st.level === 3 ? "#f97316" : "#22c55e") : "#5eead4";

                        return (
                          <button
                            key={sysKey}
                            onClick={() => navigateTo({ page: "detail", system: sysKey })}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition ${
                              active
                                ? "bg-teal-700 text-white font-semibold shadow-xs"
                                : "text-teal-200/70 hover:bg-teal-800/40 hover:text-white"
                            }`}
                          >
                            <span className="truncate">{sys?.label}</span>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-teal-800/80 bg-teal-950/90 text-[10px] text-teal-300 flex justify-between items-center select-none">
          <span className="font-mono text-teal-400/90">POS.QA.SPA.001</span>
          <span className="flex items-center gap-1.5 text-teal-300 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Online Sync
          </span>
        </div>
      </aside>
    </>
  );
}

/* =========================================================================
   9. HEADER BAR COMPONENT
   ========================================================================= */
function HeaderBar({
  session,
  onLoginClick,
  onLogout,
  onProfileClick,
  month,
  setMonth,
  onToggleSidebar,
  notifications = [],
  onSelectNotification,
}) {
  const [showNotifPopover, setShowNotifPopover] = useState(false);
  const avatarLetter = (session?.nama || session?.username || "U").charAt(0).toUpperCase();
  const criticalCount = (notifications || []).filter((n) => n.type === "critical").length;

  return (
    <header className="no-print sticky top-0 z-30 h-16 border-b border-teal-100 bg-white/90 backdrop-blur-md px-4 lg:px-8">
      <div className="h-full flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onToggleSidebar} className="lg:hidden p-2 rounded-xl border border-teal-200 text-teal-800 hover:bg-teal-50">
            <Menu size={18} />
          </button>
          <div className="hidden sm:block">
            <p className="text-xs font-bold text-teal-950">PT. Rama Emerald Multi Sukses</p>
            <p className="text-[10px] text-teal-600">Quality Assurance &amp; Quality Control</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/60 px-3 py-1.5 text-xs text-teal-900 shadow-2xs">
            <CalendarIcon size={13} className="text-teal-700" />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="bg-transparent border-none outline-none font-semibold text-xs text-teal-950 [color-scheme:light]"
            />
          </label>

          {session && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifPopover(!showNotifPopover)}
                className="relative p-2 rounded-xl border border-teal-200 text-teal-700 hover:bg-teal-50 hover:text-teal-900 transition shadow-2xs"
                title="Pusat Notifikasi & Alarm Kualitas Air"
              >
                <Bell size={16} />
                {notifications.length > 0 && (
                  <span
                    className={`absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full text-[9px] font-extrabold text-white animate-pulse shadow-sm ${
                      criticalCount > 0 ? "bg-red-600" : "bg-amber-500"
                    }`}
                  >
                    {notifications.length}
                  </span>
                )}
              </button>

              {showNotifPopover && (
                <>
                  <div onClick={() => setShowNotifPopover(false)} className="fixed inset-0 z-40 bg-transparent" />
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-3xl bg-white shadow-2xl border border-teal-100 z-50 overflow-hidden animate-fade-in">
                    <div className="flex items-center justify-between px-4 py-3 bg-teal-50 border-b border-teal-100">
                      <div className="flex items-center gap-2">
                        <Bell size={14} className="text-teal-700" />
                        <h4 className="text-xs font-bold text-teal-950">Pusat Notifikasi SPA</h4>
                      </div>
                      <span className="text-[10px] font-semibold bg-teal-200/70 text-teal-900 px-2 py-0.5 rounded-full">
                        {notifications.length} Item
                      </span>
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 p-1 text-xs">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 space-y-1">
                          <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-1.5" />
                          <p className="font-semibold text-slate-700 text-xs">Semua Parameter Air Terkendali</p>
                          <p className="text-[10px] text-slate-400">Tidak ada deviasi TOC, Konduktivitas, pH, atau Bioburden.</p>
                        </div>
                      ) : (
                        notifications.map((item, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              onSelectNotification(item);
                              setShowNotifPopover(false);
                            }}
                            className={`p-3 transition cursor-pointer hover:bg-teal-50/50 flex items-start gap-2.5 ${
                              item.type === "critical" ? "bg-red-50/40" : "bg-amber-50/30"
                            }`}
                          >
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <p className="font-bold text-slate-800 text-[11px] truncate">{item.title}</p>
                              <p className="text-[11px] text-slate-600 leading-snug">{item.desc}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {session ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onProfileClick}
                className="flex items-center gap-2 rounded-xl bg-teal-50 hover:bg-teal-100/70 border border-teal-200/60 px-3 py-1.5 text-xs font-semibold text-teal-900 transition"
              >
                <div className="w-6 h-6 rounded-lg bg-teal-800 text-white flex items-center justify-center text-[10px] font-bold">
                  {avatarLetter}
                </div>
                <div className="hidden sm:block text-left leading-tight">
                  <p className="truncate max-w-[120px]">{session?.nama || session?.username}</p>
                  <p className="text-[9px] text-teal-600 font-normal">{session?.role || "User"}</p>
                </div>
              </button>
              <button
                onClick={onLogout}
                className="p-2 rounded-xl border border-teal-200 text-teal-700 hover:bg-red-50 hover:text-red-700 transition"
                title="Keluar"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={onLoginClick}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 hover:bg-teal-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition"
            >
              <LogIn size={14} /> Masuk
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/* =========================================================================
   10. PUSAT NOTIFIKASI HALAMAN DETAIL
   ========================================================================= */
function NotificationsPage({ notifications = [], resolved = [], onSelectNotification, setView }) {
  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setView({ page: "dashboard" })}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition"
        >
          <ChevronLeft size={16} /> Kembali ke Dashboard
        </button>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-800 flex items-center justify-center">
              <Bell size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Pusat Notifikasi &amp; Alert Kualitas Air</h2>
              <p className="text-xs text-slate-400">Monitoring deviasi TOC, Konduktivitas, pH, Mikrobiologi &amp; Endotoksin</p>
            </div>
          </div>
          <span className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-full">
            {notifications.length} Notifikasi Aktif
          </span>
        </div>

        {notifications.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
            <p className="font-bold text-slate-700 text-sm">Seluruh Sistem Air Berada Dalam Kondisi Terkendali</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Tidak ada hasil uji yang melampaui Action Limit/Syarat pada periode ini.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((item, idx) => (
              <div
                key={idx}
                onClick={() => onSelectNotification(item)}
                className={`p-4 transition cursor-pointer hover:bg-slate-50 flex items-start justify-between gap-4 rounded-2xl ${
                  item.type === "critical"
                    ? "bg-red-50/40 border border-red-100 my-1.5"
                    : "bg-amber-50/30 border border-amber-100 my-1.5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {item.type === "critical" ? (
                      <AlertOctagon size={20} className="text-red-600" />
                    ) : (
                      <Clock size={20} className="text-amber-600" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 text-xs">{item.title}</p>
                    <p className="text-xs text-slate-600">{item.desc}</p>
                    <p className="text-[10px] font-semibold text-slate-400">
                      Sistem: <span className="text-slate-700">{item.systemLabel}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col justify-between items-end">
                  <span className="text-[10px] text-slate-400">{item.time || "Hari Ini"}</span>
                  <span className="text-xs text-teal-800 font-bold hover:underline inline-flex items-center gap-0.5 mt-2">
                    Buka Detail <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <CheckCheck size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">Temuan yang Sudah Ditindaklanjuti</h2>
                <p className="text-xs text-slate-400">Hasil di atas Action Limit yang sudah ditutup dengan sampling ulang</p>
              </div>
            </div>
            <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-200">
              {resolved.length} Ditutup
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {resolved.map((item, idx) => (
              <div key={idx} onClick={() => onSelectNotification(item)}
                className="my-1.5 flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 transition hover:bg-emerald-50">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={20} className="mt-0.5 text-emerald-600" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800">{item.title}</p>
                    <p className="text-xs text-slate-600">{item.desc}</p>
                    <p className="text-[10px] font-semibold text-slate-400">
                      Sistem: <span className="text-slate-700">{item.systemLabel}</span>
                      {item.penutup ? <> · Ditutup oleh: <span className="text-slate-700">{item.penutup}</span></> : null}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   11. HALAMAN UTAMA / SYSTEM DETAIL / REPORT HASIL
   ========================================================================= */
function Dashboard({ monthKey, setMonthKey, statusIndex, loadingStatus, statusError, onOpen }) {
  const perluCount = SYSTEMS.filter((s) => (statusIndex[s.key]?.level || 0) === 3).length;
  const tmsCount = SYSTEMS.filter((s) => (statusIndex[s.key]?.level || 0) >= 4).length;
  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-950 via-teal-900 to-teal-800 p-6 sm:p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-teal-400/20 blur-3xl animate-pulse" />
        <div className="relative space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/20 border border-teal-500/30 px-3 py-0.5 text-[11px] font-semibold text-teal-200">
            <ShieldCheck size={13} /> Sistem Pengolahan Air (Purified Water, WFI, Pure Steam)
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Status Kualitas Sistem Pengolahan Air</h1>
          <p className="text-xs sm:text-sm text-teal-100/90 max-w-2xl leading-relaxed">
            Pemantauan rutin parameter Konduktivitas, pH, TOC, Mikrobiologi, dan Endotoksin periode <b>{monthLabel(monthKey)}</b>.
          </p>
        </div>
      </div>

      {statusError && (
        <p className="rounded-2xl bg-red-50 p-4 text-xs text-red-600 border border-red-200 font-semibold">{statusError}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard icon={<Layers size={17} />} iconColor="#0f766e" tint="#ccfbf1" border="#99f6e4" value={SYSTEMS.length} label="Total Sistem" />
        <StatCard icon={<CheckCircle2 size={17} />} iconColor="#15803d" tint="#dcfce7" border="#bbf7d0" value={SYSTEMS.filter((s) => statusIndex[s.key]?.hasData && (statusIndex[s.key]?.level || 0) < 3).length} label="Terkendali" />
        <StatCard icon={<AlertTriangle size={17} />} iconColor="#c2410c" tint="#ffedd5" border="#fed7aa" value={perluCount} label="Perlu Perhatian" />
        <StatCard icon={<XCircle size={17} />} iconColor="#b91c1c" tint="#fee2e2" border="#fecaca" value={tmsCount} label="Melebihi Syarat" />
        <StatCard icon={<FileQuestion size={17} />} iconColor="#475569" tint="#f1f5f9" border="#e2e8f0" value={SYSTEMS.filter((s) => !statusIndex[s.key]?.hasData).length} label="Belum Ada Data" />
      </div>

      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Daftar Sistem Air — {monthLabel(monthKey)}</h2>
        <div className="space-y-2.5">
          {SYSTEMS.map((s) => {
            const st = statusIndex[s.key];
            const level = st?.hasData ? (st?.level || 0) : 0;
            const tint = STATUS_TINT[level];
            return (
              <button
                key={s.key}
                onClick={() => onOpen(s.key)}
                className="group flex w-full items-center justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-xs transition-all duration-300 ease-out hover:-translate-y-1 hover:border-teal-400 hover:shadow-lg hover:shadow-teal-950/5"
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-2xs transition-transform group-hover:scale-105" style={{ background: tint.bg, color: tint.fg }}>
                    {s.jenis === "Pure Steam" ? <Flame size={20} /> : <Droplet size={20} />}
                  </span>
                  <div>
                    <p className="font-bold text-slate-800 text-sm transition-colors group-hover:text-teal-900">{s.label}</p>
                    <p className="text-xs text-slate-400">{loadingStatus ? "Memuat..." : st?.hasData ? "Ada data pengujian periode ini" : "Belum ada data pengujian periode ini"}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {loadingStatus ? <Loader2 className="animate-spin text-slate-300" size={18} /> : <StatusPill level={st?.level || 0} hasData={!!st?.hasData} />}
                  <ChevronRight size={16} className="text-slate-300 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-teal-700" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, iconColor, tint, border, value, label }) {
  return (
    <div
      className="rounded-2xl border p-4 shadow-xs transition-all duration-300 ease-out hover:-translate-y-1.5 hover:scale-105 hover:shadow-lg cursor-default select-none"
      style={{ background: `linear-gradient(155deg, ${tint} 0%, #ffffff 72%)`, borderColor: border }}
    >
      <span className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-2xs" style={{ color: iconColor }}>
        {icon}
      </span>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs font-semibold text-slate-600 mt-0.5">{label}</p>
    </div>
  );
}

const STATUS_TINT = {
  0: { bg: "#f1f5f9", fg: "#64748b" },
  1: { bg: "#ccfbf1", fg: "#0f766e" },
  2: { bg: "#ccfbf1", fg: "#0f766e" },
  3: { bg: "#ffedd5", fg: "#c2410c" },
  4: { bg: "#fee2e2", fg: "#b91c1c" },
};

function LegendRow() {
  const items = [
    { label: "Terkendali", bg: "#dcfce7", color: "#15803d" },
    { label: "Alert", bg: "#fef3c7", color: "#b45309" },
    { label: "Action", bg: "#ffedd5", color: "#c2410c" },
    { label: "Melebihi Syarat", bg: "#fee2e2", color: "#b91c1c" },
    { label: "N/A / Belum diuji", bg: "#f1f5f9", color: "#64748b" },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: it.bg, border: `1px solid ${it.color}` }} />
          <span className="text-slate-600 font-medium">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

/* =========================================================================
   12. REPORT HASIL PEMERIKSAAN (FORMULIR QC FISIK DIGITIZED)
   ========================================================================= */
function ReportHasilPanel({ systemKey, entriesForMonth, monthKey, session, token, onBack, kontrolRecords = [], masterPoints = [] }) {
  const toast = useToast();
  const system = SYSTEMS.find((s) => s.key === systemKey);
  const docNo = DOC_NUMBERS[systemKey];
  const isWFIType = system.jenis === "WFI" || system.jenis === "Pure Steam";
  const baseParams = ["kejernihan", "warna", "bau", "konduktivitas", "ph", "toc", "mikrobiologi"];

  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const canInput = hasAccess(session, "Staff", "QC");
  const canApprove = hasAccess(session, "Supervisor", "QC");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErrorMsg("");
      try {
        const res = await fetchReportHasil(systemKey, monthKey);
        if (cancelled) return;
        setMeta(res);
      } catch (err) {
        if (!cancelled) setErrorMsg("Gagal memuat Report Hasil: " + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [systemKey, monthKey]);

  const weeks = useMemo(() => {
    const map = new Map();
    entriesForMonth.forEach((e) => {
      if (!e.tanggal) return;
      const wk = weekKeyForISO(e.tanggal);
      if (!wk) return;
      if (!map.has(wk.key)) map.set(wk.key, { wk, rows: [] });
      map.get(wk.key).rows.push(e);
    });
    const pointOrder = (code) => {
      const idx = masterPoints.findIndex((p) => p.code === code);
      return idx === -1 ? 9999 : idx;
    };
    const list = Array.from(map.values());
    list.forEach((grp) => {
      grp.rows.sort((a, b) => (a.tanggal || "").localeCompare(b.tanggal || "") || pointOrder(a.titikSampling) - pointOrder(b.titikSampling));
    });
    list.sort((a, b) => (a.wk.year - b.wk.year) || (a.wk.month - b.wk.month) || (a.wk.weekNum - b.wk.weekNum));
    return list;
  }, [entriesForMonth, masterPoints]);

  async function handleSave() {
    setSaving(true);
    setErrorMsg("");
    try {
      const res = await apiSaveReportHasil(systemKey, monthKey, token);
      if (res.error) throw new Error(res.error);
      setMeta(res);
      toast.success("Report Hasil Pemeriksaan berhasil disimpan.");
    } catch (err) {
      setErrorMsg(err.message);
      toast.error("Gagal menyimpan Report Hasil Pemeriksaan: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    setErrorMsg("");
    try {
      const res = await apiApproveReportHasil(systemKey, monthKey, token);
      if (res.error) throw new Error(res.error);
      setMeta(res);
      toast.success("Formulir QC berhasil di-acc. QA sekarang bisa melakukan approval Pengkajian.");
    } catch (err) {
      setErrorMsg(err.message);
      toast.error("Gagal menyetujui Report Hasil Pemeriksaan: " + err.message);
    } finally {
      setApproving(false);
    }
  }

  const analis = meta?.analis || { nama: "", tanggal: "" };
  const diperiksa = meta?.diperiksa || { nama: "", tanggal: "" };
  const colCount = 2 + baseParams.length + 4 + 1 + (isWFIType ? 7 : 0) + 1;
  const colWeights = [
    1.6, 1.3,
    ...baseParams.map(() => 1),
    1.1, 1, 1.1, 1,
    1.3,
    ...(isWFIType ? [1, 1, 1, 1, 1, 1, 1] : []),
    1,
  ];
  const totalWeight = colWeights.reduce((s, w) => s + w, 0);

  const canPrint = hasAccess(session, "Staff");

  return (
    <div className="mx-auto max-w-6xl p-6 print:max-w-none print:p-0" data-print-blocked={!canPrint}>
      <div className="print-blocked-notice">Akses print dibatasi untuk Staff/Supervisor/Manager ke atas.</div>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 1cm; }
        }
        .qc-form-table-wrap { overflow-x: auto; }
        @media print {
          .qc-form-table-wrap { overflow: visible !important; width: auto !important; }
          .qc-form-table { width: 100% !important; font-size: 7.2px !important; table-layout: fixed; }
          .qc-form-table th, .qc-form-table td { padding: 1.5px 2px !important; overflow-wrap: break-word; }
          .qc-form-table thead { display: table-header-group; }
          .qc-form-table tr { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>
      <div className="no-print mb-4 flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800">
          <ChevronLeft size={16} /> Kembali ke Pengkajian SPA
        </button>
        {canPrint && (
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-950 shadow-xs">
            <Printer size={14} /> Cetak / Download PDF
          </button>
        )}
      </div>

      {errorMsg && <p className="no-print mb-4 rounded-2xl bg-red-50 p-3.5 text-xs text-red-600 border border-red-200">{errorMsg}</p>}

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 size={24} className="animate-spin text-teal-600" /></div>
      ) : weeks.length === 0 ? (
        <p className="py-12 text-center text-xs text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">Belum ada data pengujian untuk periode ini.</p>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 print-card shadow-xs">
          <div className="bg-gradient-to-r from-teal-950 via-teal-900 to-teal-800 px-6 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <img src="/logo-rama.png" alt="Logo" className="h-11 w-11 shrink-0 object-contain brightness-0 invert" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-300">PT. Rama Emerald Multi Sukses</p>
                  <h2 className="text-base font-bold uppercase text-white">Formulir Pemeriksaan {system.jenis}</h2>
                </div>
              </div>
              {docNo && (
                <div className="shrink-0 text-right text-[10px] leading-tight text-teal-100 font-mono">
                  <p><span className="text-teal-300">No: </span><span className="font-bold text-white">{docNo.no}</span></p>
                  <p><span className="text-teal-300">Tgl Berlaku: </span><span className="text-white">{docNo.tglBerlaku}</span></p>
                </div>
              )}
            </div>
          </div>
          <div className="bg-white p-6 space-y-4">
            <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 border-b pb-3">
              <p><span className="text-slate-400">Sistem</span> : <span className="font-bold text-slate-800">{system.label}</span></p>
              <p><span className="text-slate-400">Periode</span> : <span className="font-bold text-slate-800">{monthLabel(monthKey)}</span></p>
            </div>

            <div className="qc-form-table-wrap">
              <table className="qc-form-table w-full border-collapse text-[10.5px] leading-tight">
                <colgroup>
                  {colWeights.map((w, i) => <col key={i} style={{ width: `${(w / totalWeight * 100).toFixed(3)}%` }} />)}
                </colgroup>
                <thead>
                  <tr className="border border-slate-200 bg-slate-50 text-left uppercase tracking-wide text-slate-500 font-semibold text-[10px]">
                    <th className="border border-slate-200 px-1.5 py-2">Titik Sampling</th>
                    <th className="border border-slate-200 px-1.5 py-2">Tanggal</th>
                    {baseParams.map((p) => (
                      <th key={p} className="border border-slate-200 px-1.5 py-2 text-center">{PARAM_META[p].short}{PARAM_META[p].unit ? ` (${PARAM_META[p].unit})` : ""}</th>
                    ))}
                    <th className="border border-slate-200 px-1.5 py-2 text-center">No. Kontrol Media</th>
                    <th className="border border-slate-200 px-1.5 py-2 text-center">Kontrol Negatif</th>
                    <th className="border border-slate-200 px-1.5 py-2 text-center">No. Kontrol Bakteri</th>
                    <th className="border border-slate-200 px-1.5 py-2 text-center">Kontrol Positif</th>
                    <th className="border border-slate-200 px-1.5 py-2 text-center">Tanggal Baca</th>
                    {isWFIType && (
                      <>
                        <th className="border border-slate-200 px-1.5 py-2 text-center">{PARAM_META.endotoksin.short} ({PARAM_META.endotoksin.unit})</th>
                        <th className="border border-slate-200 px-1.5 py-2 text-center">Kontrol Negatif</th>
                        <th className="border border-slate-200 px-1.5 py-2 text-center">Kontrol Positif</th>
                        <th className="border border-slate-200 px-1.5 py-2 text-center">No Bet LAL</th>
                        <th className="border border-slate-200 px-1.5 py-2 text-center">No Bet CSE</th>
                        <th className="border border-slate-200 px-1.5 py-2 text-center">Sensitivitas LAL</th>
                        <th className="border border-slate-200 px-1.5 py-2 text-center">Sensitivitas CSE</th>
                      </>
                    )}
                    <th className="border border-slate-200 px-1.5 py-2 text-center">Kesimpulan</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((grp) => {
                    const rec = findKontrolMingguan(kontrolRecords, grp.wk.key, systemKey, monthKey) || {};
                    let weekDeviates = false;
                    if (rec.kontrolPositif && rec.kontrolPositif !== "Positif") weekDeviates = true;
                    if (rec.kontrolNegatif && rec.kontrolNegatif !== "Negatif") weekDeviates = true;
                    if (isWFIType) {
                      if (rec.kontrolPositifLAL && rec.kontrolPositifLAL !== "Positif") weekDeviates = true;
                      if (rec.kontrolNegatifLAL && rec.kontrolNegatifLAL !== "Negatif") weekDeviates = true;
                    }
                    return (
                      <Fragment key={grp.wk.key}>
                        <tr className="bg-teal-50/60">
                          <td colSpan={colCount} className="border border-slate-200 px-2 py-1 font-bold text-teal-950">Minggu {grp.wk.weekNum}</td>
                        </tr>
                        {grp.rows.map((e, idx) => {
                          let maxLevel = weekDeviates ? 4 : 0;
                          baseParams.forEach((p) => { const st = statusFor(e[p], p, system.jenis); if (st.level > maxLevel) maxLevel = st.level; });
                          if (isWFIType) { const st = statusFor(e.endotoksin, "endotoksin", system.jenis); if (st.level > maxLevel) maxLevel = st.level; }
                          const ket = maxLevel >= 4 ? "TMS" : maxLevel === 0 ? "-" : "MS";
                          return (
                            <tr key={e.id} className="hover:bg-slate-50/50">
                              <td className="border border-slate-200 px-1.5 py-1 font-semibold text-slate-800">
                                {e.titikSampling}
                                {isResampleEntry(e) && <span className="ml-1 font-bold text-sky-700" title={`Sampling ulang atas hasil ${isoToID(e.refTanggal)}`}>*</span>}
                              </td>
                              <td className="border border-slate-200 px-1.5 py-1 text-slate-600">{isoToID(e.tanggal)}</td>
                              {baseParams.map((p) => <td key={p} className="border border-slate-200 px-1.5 py-1 text-center font-medium">{displayValue(e[p])}</td>)}
                              {idx === 0 && (
                                <>
                                  <td rowSpan={grp.rows.length} className="border border-slate-200 px-1.5 py-1 text-center align-middle bg-slate-50/30 font-medium">{rec.noKontrolMedia || "-"}</td>
                                  <td rowSpan={grp.rows.length} className="border border-slate-200 px-1.5 py-1 text-center align-middle bg-slate-50/30 font-medium">{rec.kontrolNegatif || "-"}</td>
                                  <td rowSpan={grp.rows.length} className="border border-slate-200 px-1.5 py-1 text-center align-middle bg-slate-50/30 font-medium">{rec.noKontrolBakteri || "-"}</td>
                                  <td rowSpan={grp.rows.length} className="border border-slate-200 px-1.5 py-1 text-center align-middle bg-slate-50/30 font-medium">{rec.kontrolPositif || "-"}</td>
                                </>
                              )}
                              <td className="border border-slate-200 px-1.5 py-1 text-center text-slate-500">{isoToID(addDaysISO(e.tanggal, 3))}</td>
                              {isWFIType && (
                                <>
                                  <td className="border border-slate-200 px-1.5 py-1 text-center font-medium">{displayValue(e.endotoksin)}</td>
                                  {idx === 0 && (
                                    <>
                                      <td rowSpan={grp.rows.length} className="border border-slate-200 px-1.5 py-1 text-center align-middle bg-slate-50/30">{rec.kontrolNegatifLAL || "-"}</td>
                                      <td rowSpan={grp.rows.length} className="border border-slate-200 px-1.5 py-1 text-center align-middle bg-slate-50/30">{rec.kontrolPositifLAL || "-"}</td>
                                      <td rowSpan={grp.rows.length} className="border border-slate-200 px-1.5 py-1 text-center align-middle bg-slate-50/30">{rec.noBetLAL || "-"}</td>
                                      <td rowSpan={grp.rows.length} className="border border-slate-200 px-1.5 py-1 text-center align-middle bg-slate-50/30">{rec.noBetCSE || "-"}</td>
                                      <td rowSpan={grp.rows.length} className="border border-slate-200 px-1.5 py-1 text-center align-middle bg-slate-50/30">{rec.sensitivitasLAL || "-"}</td>
                                      <td rowSpan={grp.rows.length} className="border border-slate-200 px-1.5 py-1 text-center align-middle bg-slate-50/30">{rec.sensitivitasCSE || "-"}</td>
                                    </>
                                  )}
                                </>
                              )}
                              <td className={`border border-slate-200 px-1.5 py-1 text-center font-bold ${ket === "TMS" ? "text-red-600 bg-red-50/40" : ket === "-" ? "text-slate-400" : "text-emerald-600"}`}>{ket}</td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {entriesForMonth.some(isResampleEntry) && (
              <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-2.5 text-[10.5px] leading-relaxed text-sky-900">
                <p className="font-bold">Keterangan:</p>
                <p>
                  * Baris bertanda bintang adalah hasil <b>sampling ulang</b> yang dilakukan untuk menindaklanjuti
                  hasil pengujian sebelumnya yang mencapai Action Limit atau berada di luar batas Syarat. Hasil
                  pengujian awal tetap dicantumkan dan tidak dihapus; rincian tindak lanjut beserta hasil uji
                  ulangnya diuraikan pada dokumen Pengkajian Trend Data SPA periode yang sama.
                </p>
              </div>
            )}

            <div className="mt-6 rounded-3xl border border-slate-200 p-5 print-card">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700">Tanda Tangan Digital</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  { field: "analis", label: "Diperiksa Oleh", nama: analis.nama, tanggal: analis.tanggal,
                    canApprove: canInput, onApprove: handleSave,
                    disabledNote: "Hanya Staff s/d Manager QC yang bisa menandatangani" },
                  { field: "diperiksa", label: "Mengetahui", nama: diperiksa.nama, tanggal: diperiksa.tanggal,
                    canApprove: canApprove, onApprove: handleApprove,
                    disabledNote: analis.nama ? "Hanya Supervisor s/d Manager QC yang bisa menyetujui" : "Menunggu tanda tangan \"Diperiksa Oleh\" terlebih dahulu" },
                ].map(({ field, label, nama, tanggal, canApprove: fieldCanApprove, onApprove, disabledNote }) => (
                  <div key={field} className="rounded-2xl border border-slate-200 p-3.5 bg-slate-50/50 flex flex-col justify-between min-h-[140px]">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">{label}</p>
                    <div className="mb-2 flex h-20 items-center justify-center rounded-xl border border-dashed border-slate-300">
                      {nama ? (
                        <VerifyQR type="reportHasil" system={systemKey} period={monthKey} slot={field} size={64} />
                      ) : (
                        <span className="only-screen text-xs text-slate-300">Ruang tanda tangan</span>
                      )}
                    </div>
                    {nama ? (
                      <div className="space-y-0.5 text-center">
                        <p className="font-bold text-slate-800 text-xs">{nama}</p>
                        <p className="text-[10px] text-slate-400">{tanggal ? fullDateID(tanggal) : ""}</p>
                      </div>
                    ) : field === "diperiksa" && !analis.nama ? (
                      <p className="no-print text-center text-xs text-slate-400 italic">{disabledNote}</p>
                    ) : fieldCanApprove ? (
                      <button onClick={onApprove} disabled={saving || approving}
                        className="no-print inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-50 shadow-xs transition">
                        {(saving || approving) ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Setujui &amp; Tanda Tangani
                      </button>
                    ) : (
                      <p className="no-print text-center text-xs text-slate-400 italic">{disabledNote}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   13. SYSTEM DETAIL (PENGKAJIAN QA TREN AIR)
   ========================================================================= */
function SystemDetail({ systemKey, monthKey, setMonthKey, onBack, onSaved, session, token }) {
  const system = SYSTEMS.find((s) => s.key === systemKey);
  const params = PARAMS_BY_JENIS[system.jenis] || [];

  const toast = useToast();
  const isAdmin = session?.role === "Administrator";
  const isTamu = session?.role === "Tamu";
  const isQA = isAdmin || (!isTamu && session?.departemen === "QA");
  const isQC = isAdmin || (!isTamu && session?.departemen === "QC");
  const [mode, setMode] = useState("pengkajian");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [entries, setEntries] = useState([]);
  const [masterPoints, setMasterPoints] = useState([]);
  const [narrative, setNarrative] = useState(emptyNarrative());
  const [signoff, setSignoff] = useState(emptySignoff());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [approving, setApproving] = useState(false);
  const [kontrolRecords, setKontrolRecords] = useState([]);
  const [kontrolSaving, setKontrolSaving] = useState(false);
  const [kontrolError, setKontrolError] = useState("");
  const [reportHasilMeta, setReportHasilMeta] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const [ent, rep, pts, kontrol, rh] = await Promise.all([
          fetchEntries(systemKey, monthKey),
          fetchReport(systemKey, monthKey),
          fetchMaster(systemKey),
          fetchKontrolMingguan().catch(() => []),
          fetchReportHasil(systemKey, monthKey).catch(() => null),
        ]);
        if (cancelled) return;
        setEntries(ent.map((e) => ({ ...e, id: e.id || uid() })));
        setMasterPoints(pts);
        setKontrolRecords(kontrol);
        setReportHasilMeta(rh);
        if (rep.found) {
          setNarrative({ ...emptyNarrative(), ...rep.narrative });
          setSignoff(rep.signoff || emptySignoff());
        } else {
          setNarrative(emptyNarrative());
          setSignoff(emptySignoff());
        }
      } catch (err) {
        if (!cancelled) setLoadError("Gagal memuat data: " + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [systemKey, monthKey]);

  const qcFinalApproved = !!reportHasilMeta?.diperiksa?.nama;
  const pengkajianFinalized = !!signoff?.diperiksa?.nama;
  const recordsLocked = !isAdmin && pengkajianFinalized;

  // Input data pengujian & kontrol mingguan: HANYA departemen QC (plus
  // Administrator). QA tidak boleh ikut mengisi data mentah — tugas QA
  // adalah menyusun Pengkajian setelah Formulir QC final di-acc.
  const canInputQC = isAdmin || (!recordsLocked && !qcFinalApproved && hasAccess(session, "Staff", "QC"));
  const canDeleteQC = isAdmin || (!recordsLocked && !qcFinalApproved && hasAccess(session, "Supervisor", "QC"));
  const canEditQA = isAdmin || (!recordsLocked && qcFinalApproved && hasAccess(session, "Supervisor", "QA"));
  // QA (Supervisor ke atas) selalu melihat tombol penyusun narasi.
  const canUseNarrativeTools = isAdmin || hasAccess(session, "Supervisor", "QA");
  // QA boleh MENYUSUN sekaligus MENYIMPAN narasi kapan saja dari data yang
  // sudah diinput QC (walau Formulir QC belum final di-acc) — supaya titik
  // yang perlu perhatian bisa dicatat lebih awal. Yang tetap menunggu acc
  // final QC hanyalah APPROVAL ("Dikaji Oleh" & "Mengetahui").
  const canDraftNarrative = isAdmin || (!recordsLocked && hasAccess(session, "Supervisor", "QA"));
  const draftOnly = canDraftNarrative && !canEditQA;
  const canApproveFinal = isAdmin || (!recordsLocked && qcFinalApproved && hasAccess(session, "Manager", "QA"));
  const canViewPembahasan = !!session;
  const canPrint = hasAccess(session, "Staff");

  const overallLevel = systemOverallLevel(entries, system.jenis);

  const reloadReport = useCallback(async () => {
    try {
      const rep = await fetchReport(systemKey, monthKey);
      if (rep.found) {
        setNarrative({ ...emptyNarrative(), ...rep.narrative });
        setSignoff(rep.signoff || emptySignoff());
      }
    } catch {}
  }, [systemKey, monthKey]);

  const saveEntriesOnly = useCallback(async () => {
    setSaving(true);
    setSaveError("");
    try {
      await apiSaveEntries(systemKey, monthKey, entries, token);
      // Muat ulang dari server: yang tampil setelah simpan harus persis apa
      // yang benar-benar tersimpan, bukan state lokal. Kalau ada kolom yang
      // tidak tersimpan (mis. Apps Script belum di-deploy ulang), langsung
      // kelihatan di layar alih-alih baru ketahuan saat halaman dibuka lagi.
      const fresh = await fetchEntries(systemKey, monthKey).catch(() => null);
      let hilang = false;
      if (fresh) {
        const segar = fresh.map((e) => ({ ...e, id: e.id || uid() }));
        hilang = entries.some(isResampleEntry) && !segar.some(isResampleEntry);
        setEntries(segar);
      }
      if (hilang) {
        toast.error(
          "Data tersimpan, tapi penanda Sampling Ulang tidak ikut tersimpan. " +
          "Apps Script (Code.gs) kemungkinan belum di-deploy ulang sebagai New version."
        );
      } else {
        toast.success(`Data pengujian ${system.label} periode ${monthLabel(monthKey)} berhasil disimpan (${entries.length} baris).`);
      }
      onSaved && onSaved();
    } catch (err) {
      setSaveError("Gagal menyimpan data: " + err.message);
      toast.error("Gagal menyimpan data pengujian: " + err.message);
    } finally {
      setSaving(false);
    }
  }, [systemKey, monthKey, entries, token, onSaved, toast, system.label]);

  const handleSaveKontrolMingguan = useCallback(async (records) => {
    setKontrolSaving(true);
    setKontrolError("");
    try {
      const res = await apiSaveKontrolMingguan(records, token);
      if (res.error) throw new Error(res.error);
      const fresh = await fetchKontrolMingguan().catch(() => []);
      setKontrolRecords(fresh);
      toast.success("Kontrol Mingguan berhasil disimpan.");
      onSaved && onSaved();
    } catch (err) {
      setKontrolError("Gagal menyimpan Kontrol Mingguan: " + err.message);
      toast.error("Gagal menyimpan Kontrol Mingguan: " + err.message);
    } finally {
      setKontrolSaving(false);
    }
  }, [token, onSaved, toast]);

  const saveNarrativeOnly = useCallback(async () => {
    setSaving(true);
    setSaveError("");
    try {
      await apiSaveReport(systemKey, monthKey, narrative, token);
      toast.success(
        qcFinalApproved
          ? "Narasi & pembahasan Pengkajian berhasil disimpan."
          : "Narasi tersimpan sebagai draf. Approval menunggu acc final Formulir QC."
      );
      onSaved && onSaved();
    } catch (err) {
      setSaveError("Gagal menyimpan narasi: " + err.message);
      toast.error("Gagal menyimpan narasi: " + err.message);
    } finally {
      setSaving(false);
    }
  }, [systemKey, monthKey, narrative, token, onSaved, toast, qcFinalApproved]);

  const handleApproveDikaji = useCallback(async () => {
    setApproving(true);
    setSaveError("");
    try {
      await apiApproveDikaji(systemKey, monthKey, token);
      await reloadReport();
      toast.success('Pengkajian berhasil di-approve "Dikaji Oleh".');
      onSaved && onSaved();
    } catch (err) {
      setSaveError("Gagal menyetujui: " + err.message);
      toast.error("Gagal menyetujui: " + err.message);
    } finally {
      setApproving(false);
    }
  }, [systemKey, monthKey, token, reloadReport, onSaved, toast]);

  const handleApproveMengetahui = useCallback(async () => {
    setApproving(true);
    setSaveError("");
    try {
      await apiApproveMengetahui(systemKey, monthKey, token);
      await reloadReport();
      toast.success('Pengkajian final di-approve "Mengetahui". Data periode ini sekarang terkunci sebagai arsip.');
      onSaved && onSaved();
    } catch (err) {
      setSaveError("Gagal menyetujui: " + err.message);
      toast.error("Gagal menyetujui: " + err.message);
    } finally {
      setApproving(false);
    }
  }, [systemKey, monthKey, token, reloadReport, onSaved, toast]);

  async function handleGenerateNarrative(useAI = true) {
    setGenerating(true);
    setAiError("");
    let prevEntries = [];
    try {
      const prevRes = await fetchEntries(systemKey, prevMonthKey(monthKey));
      prevEntries = prevRes || [];
    } catch {}
    const localRes = generateLocalNarrative({
      systemLabel: system.label, jenisAir: system.jenis, monthLabel: monthLabel(monthKey), entries, prevEntries,
    });

    if (!useAI) {
      setNarrative((prev) => ({
        ...prev, pendahuluan: localRes.pendahuluan,
        perParameter: { ...prev.perParameter, ...localRes.perParameter },
        reviewTren: localRes.reviewTren, kesimpulan: localRes.kesimpulan,
      }));
      setGenerating(false);
      toast.success('Narasi otomatis dari data berhasil disusun. Jangan lupa klik "Simpan Narasi & Pembahasan".');
      return;
    }

    try {
      const stats = buildStatsSummary(system, entries);
      const prevStats = prevEntries.length > 0 ? buildStatsSummary(system, prevEntries) : null;
      let prevSummary = "Tidak ada data periode sebelumnya.";
      try {
        const prevRep = await fetchReport(systemKey, prevMonthKey(monthKey));
        if (prevRep.found) prevSummary = prevRep.narrative?.kesimpulan || "Ada data periode sebelumnya, namun tanpa ringkasan tertulis.";
      } catch {}
      const parsed = await generateNarrative({
        systemLabel: system.label, jenisAir: system.jenis, monthLabel: monthLabel(monthKey), stats, prevStats, prevSummary,
      });
      setNarrative((prev) => ({
        ...prev, pendahuluan: localRes.pendahuluan,
        perParameter: { ...prev.perParameter, ...parsed.perParameter },
        reviewTren: parsed.reviewTren || localRes.reviewTren, kesimpulan: parsed.kesimpulan || localRes.kesimpulan,
      }));
      toast.success('Narasi AI berhasil dibuat. Periksa isinya, lalu klik "Simpan Narasi & Pembahasan".');
    } catch (err) {
      setNarrative((prev) => ({
        ...prev, pendahuluan: localRes.pendahuluan,
        perParameter: { ...prev.perParameter, ...localRes.perParameter },
        reviewTren: localRes.reviewTren, kesimpulan: localRes.kesimpulan,
      }));
      setAiError(`AI gagal merespons, dipakai narasi otomatis dari data. Penyebab: ${err.message}`);
      toast.error(`AI gagal merespons — dipakai narasi otomatis dari data. Penyebab: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-400"><Loader2 className="mr-2 animate-spin" size={18} /> Memuat data...</div>;
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800">
          <ChevronLeft size={16} /> Kembali ke Dashboard
        </button>
        <p className="rounded-2xl bg-red-50 p-4 text-xs text-red-600 border border-red-200">{loadError}</p>
      </div>
    );
  }

  if (mode === "reportHasil") {
    return (
      <ReportHasilPanel systemKey={systemKey} entriesForMonth={entries} monthKey={monthKey}
        session={session} token={token}
        onBack={() => {
          setMode("pengkajian");
          fetchReportHasil(systemKey, monthKey).then(setReportHasilMeta).catch(() => {});
        }}
        kontrolRecords={kontrolRecords} masterPoints={masterPoints} />
    );
  }

  return (
    <div className="space-y-6" data-print-blocked={!canPrint}>
      <div className="print-blocked-notice">Akses print dibatasi untuk Staff/Supervisor/Manager ke atas.</div>
      <div className="no-print flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2 text-xs font-bold transition shadow-2xs">
          <ArrowLeft size={14} className="text-teal-900" /> Kembali ke Dashboard
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {(isQC || isQA) && (
            <button onClick={() => setMode("reportHasil")} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-50 hover:bg-teal-100/80 border border-teal-200/80 text-teal-950 px-3.5 py-2 text-xs font-bold transition shadow-2xs">
              <FileCheck2 size={14} className="text-teal-800" /> {isQC ? "Report Hasil Pemeriksaan" : "Lihat Formulir QC"}
            </button>
          )}
          {isQA && canPrint && (
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-900 hover:bg-teal-950 text-white px-3.5 py-2 text-xs font-semibold transition shadow-xs">
              <Printer size={14} className="text-teal-300" /> Download / Print PDF
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200/80 print-card shadow-sm">
        <div className="relative overflow-hidden bg-gradient-to-r from-teal-950 via-teal-900 to-teal-800 px-6 py-4">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-teal-400/20 blur-3xl" />
          <div className="relative flex items-start justify-between">
            <div className="flex items-start gap-4">
              <img src="/logo-rama.png" alt="Logo" className="h-11 w-11 object-contain brightness-0 invert" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-300">PT. Rama Emerald Multi Sukses — QA</p>
                <h2 className="text-lg font-bold text-white tracking-tight">Pengkajian Trend Data Sistem Pengolahan Air (SPA)</h2>
                <p className="text-xs text-teal-100/90 mt-0.5">
                  Sistem: <span className="font-semibold text-white">{system.label}</span> · Periode: <span className="font-semibold text-white">{monthLabel(monthKey)}</span>
                </p>
              </div>
            </div>
            <p className="text-right text-[11px] text-teal-200 font-mono">QA.FM.156</p>
          </div>
        </div>
        <div className="flex items-center justify-between bg-white px-6 py-2.5 border-t border-slate-100 text-xs">
          <span className="text-slate-400 font-medium">Status Keseluruhan Sistem:</span>
          <StatusPill level={overallLevel} hasData={entries.length > 0} />
        </div>
      </div>

      {saveError && <p className="no-print rounded-2xl bg-red-50 p-4 text-xs text-red-600 border border-red-200">{saveError}</p>}

      <div className="no-print">
        <EntryEditor system={system} masterPoints={masterPoints} entries={entries} setEntries={setEntries} onSave={saveEntriesOnly} saving={saving}
          canInput={canInputQC} canDeleteExisting={canDeleteQC}
          accessNote={
            !session ? "Login untuk mengisi data"
            : recordsLocked ? "Pengkajian sudah final — data terkunci"
            : qcFinalApproved ? "Formulir QC sudah final di-acc — data terkunci"
            : "Hanya Staff/Supervisor/Manager QC yang bisa mengisi data"
          } />
      </div>

      {kontrolError && <p className="no-print rounded-2xl bg-red-50 p-4 text-xs text-red-600 border border-red-200">{kontrolError}</p>}
      <KontrolMingguanPanel systemKey={systemKey} jenis={system.jenis} monthKey={monthKey} entries={entries} records={kontrolRecords}
        canInput={canInputQC} saving={kontrolSaving} onSave={handleSaveKontrolMingguan} />

      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 print-card shadow-xs">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700">Persyaratan Mutu &amp; Batas Limit</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-50">
                <th className="px-3 py-2">Parameter</th>
                <th className="px-3 py-2 text-right">Syarat</th><th className="px-3 py-2 text-right">Alert Limit</th><th className="px-3 py-2 text-right">Action Limit</th>
              </tr>
            </thead>
            <tbody>
              {params.map((p) => {
                const meta = PARAM_META[p];
                const limit = getLimit(p, system.jenis);
                if (limit.qualitative) {
                  return (
                    <tr key={p} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                      <td className="px-3 py-2 font-medium">{meta.short}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800">{limit.passValue}</td>
                      <td className="px-3 py-2 text-right text-slate-400">-</td>
                      <td className="px-3 py-2 text-right text-slate-400">-</td>
                    </tr>
                  );
                }
                const syarat = limit.syaratMin !== undefined ? `${limit.syaratMin}–${limit.syaratMax}` : `≤ ${limit.syaratMax}`;
                const alert = limit.alertMin !== undefined ? `≤${limit.alertMin} / ≥${limit.alertMax}` : `≥ ${limit.alertMax}`;
                const action = limit.actionMin !== undefined ? `≤${limit.actionMin} / ≥${limit.actionMax}` : `≥ ${limit.actionMax}`;
                return (
                  <tr key={p} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                    <td className="px-3 py-2 font-medium">{meta.short}{meta.unit ? ` (${meta.unit})` : ""}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{syarat}</td>
                    <td className="px-3 py-2 text-right font-semibold text-amber-700">{alert}</td>
                    <td className="px-3 py-2 text-right font-semibold text-orange-700">{action}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3.5 pt-2 border-t border-slate-100"><LegendRow /></div>
      </div>

      {canViewPembahasan ? (
        <>
          <div className="no-print flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Pembahasan &amp; Narasi Evaluasi</h3>
            {canUseNarrativeTools && (
              <div className="flex flex-wrap items-center gap-2">
                {!canEditQA && (
                  <span className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-[11px] font-medium ${draftOnly ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-500"}`}>
                    <Lock size={12} />
                    {recordsLocked
                      ? "Pengkajian sudah final — narasi terkunci"
                      : draftOnly
                        ? "Mode draf — bisa disusun & disimpan, approval menunggu acc final Formulir QC"
                        : "Menunggu Formulir QC di-acc Supervisor/Manager QC"}
                  </span>
                )}
                <button onClick={() => handleGenerateNarrative(false)} disabled={!canDraftNarrative || generating || entries.length === 0}
                  title={entries.length === 0 ? "Belum ada data pengujian yang diinput QC untuk periode ini" : "Susun narasi otomatis dari data (tanpa AI)"}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs">
                  {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  Narasi dari Data
                </button>
                <button onClick={() => handleGenerateNarrative(true)} disabled={!canDraftNarrative || generating || entries.length === 0}
                  title={entries.length === 0 ? "Belum ada data pengujian yang diinput QC untuk periode ini" : "Susun narasi dengan bantuan AI"}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs">
                  {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  Narasi dari AI
                </button>
              </div>
            )}
          </div>
          {aiError && <p className="no-print text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-200">{aiError}</p>}

          <div className="rounded-3xl border border-slate-200 bg-white p-5 print-card shadow-xs space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Pendahuluan</label>
            <AutoTextarea className="w-full rounded-2xl border border-slate-200 p-3 text-xs text-slate-700 focus:border-teal-700 focus:outline-none leading-relaxed"
              rows={3} value={narrative.pendahuluan} onChange={(ev) => setNarrative({ ...narrative, pendahuluan: ev.target.value })} readOnly={!canDraftNarrative} />
          </div>

          <div className="space-y-4">
            {params.map((p) => (
              <div key={p} className="overflow-hidden rounded-3xl border border-slate-200 bg-white print-card shadow-xs">
                <div className="p-4"><ParamValueTable entries={entries} paramKey={p} jenis={system.jenis} /></div>
                {!getLimit(p, system.jenis).qualitative && <div className="px-4 pb-4"><ParamChart entries={entries} paramKey={p} systemLabel={system.label} jenis={system.jenis} /></div>}
                <div className="border-t border-slate-100 p-4 avoid-break bg-slate-50/40">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Hasil &amp; Tren {PARAM_META[p].short}
                  </label>
                  <AutoTextarea
                    className="w-full rounded-2xl border border-slate-200 p-3 text-xs text-slate-700 bg-white focus:border-teal-700 focus:outline-none leading-relaxed"
                    rows={4}
                    value={narrative.perParameter[p] || ""}
                    placeholder={`Tulis ulasan hasil dan tren untuk ${PARAM_META[p].short}...`}
                    onChange={(ev) => setNarrative({ ...narrative, perParameter: { ...narrative.perParameter, [p]: ev.target.value } })}
                    readOnly={!canDraftNarrative}
                  />
                </div>
              </div>
            ))}
          </div>

          {(narrative.reviewTren || canDraftNarrative) && (
            <div className="rounded-3xl border border-slate-200 bg-white p-5 print-card shadow-xs space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Review Tren (vs Periode Sebelumnya)</h3>
              <AutoTextarea className="w-full rounded-2xl border border-slate-200 p-3 text-xs text-slate-700 focus:border-teal-700 focus:outline-none leading-relaxed"
                rows={4} placeholder="Opsional — perbandingan dengan data periode sebelumnya."
                value={narrative.reviewTren} onChange={(ev) => setNarrative({ ...narrative, reviewTren: ev.target.value })} readOnly={!canDraftNarrative} />
            </div>
          )}

          <div className="rounded-3xl border border-slate-200 bg-white p-5 print-card shadow-xs space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Kesimpulan Akhir</h3>
            <AutoTextarea className="w-full rounded-2xl border border-slate-200 p-3 text-xs text-slate-700 focus:border-teal-700 focus:outline-none leading-relaxed"
              rows={5} value={narrative.kesimpulan} onChange={(ev) => setNarrative({ ...narrative, kesimpulan: ev.target.value })} readOnly={!canDraftNarrative} />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 print-card shadow-xs">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-700">Persetujuan &amp; Pengesahan (QA)</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { field: "dinilai", label: "Dikaji Oleh", canApprove: canEditQA, onApprove: handleApproveDikaji,
                  disabledNote: !qcFinalApproved ? "Menunggu Formulir QC di-acc Supervisor/Manager QC" : "Hanya Supervisor/Manager QA yang bisa menyetujui" },
                { field: "diperiksa", label: "Mengetahui", canApprove: canApproveFinal, onApprove: handleApproveMengetahui,
                  disabledNote: !qcFinalApproved ? "Menunggu Formulir QC di-acc Supervisor/Manager QC" : signoff.dinilai?.nama ? "Hanya Manager QA yang bisa menyetujui final" : "Menunggu approval \"Dikaji Oleh\" terlebih dahulu" },
              ].map(({ field, label, canApprove, onApprove, disabledNote }) => (
                <div key={field} className="rounded-2xl border border-slate-200 p-3.5 bg-slate-50/50 flex flex-col justify-between min-h-[140px]">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">{label}</p>
                  <div className="mb-2 flex h-20 items-center justify-center rounded-xl border border-dashed border-slate-300">
                    {signoff[field]?.nama ? (
                      <VerifyQR type="pengkajian" system={systemKey} period={monthKey} slot={field} size={64} />
                    ) : (
                      <span className="only-screen text-xs text-slate-300">Ruang tanda tangan</span>
                    )}
                  </div>
                  {signoff[field]?.nama ? (
                    <div className="space-y-0.5 text-center">
                      <p className="font-bold text-slate-800 text-xs">{signoff[field].nama}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{signoff[field].jabatan}</p>
                      <p className="text-[9px] text-slate-400">{signoff[field].tanggal ? fullDateID(signoff[field].tanggal) : ""}</p>
                    </div>
                  ) : canApprove ? (
                    <button onClick={onApprove} disabled={approving || (field === "diperiksa" && !signoff.dinilai?.nama)}
                      className="no-print inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-50 shadow-xs transition">
                      {approving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Setujui &amp; Tanda Tangani
                    </button>
                  ) : (
                    <p className="no-print text-center text-xs text-slate-400 italic">{disabledNote}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {canDraftNarrative && (
            <div className="no-print flex flex-wrap items-center justify-end gap-2">
              {draftOnly && (
                <span className="text-[11px] font-medium text-amber-700">
                  Tersimpan sebagai draf. Approval "Dikaji Oleh" &amp; "Mengetahui" baru bisa dilakukan setelah Formulir QC periode ini final di-acc Supervisor/Manager QC.
                </span>
              )}
              <button onClick={saveNarrativeOnly} disabled={saving || !canDraftNarrative}
                title="Simpan narasi & pembahasan"
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-60 disabled:cursor-not-allowed shadow-xs">
                {saving ? <Loader2 size={13} className="animate-spin" /> : null} Simpan Narasi &amp; Pembahasan
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Lock size={20} className="mx-auto mb-2 text-slate-300" />
          <p className="text-xs text-slate-500">Grafik, pembahasan, dan pengkajian lengkap hanya bisa dilihat oleh akun yang sudah login.</p>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   14. AUTH MODALS
   ========================================================================= */
function LoginModal({ onClose, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (ev) => {
    ev.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onLogin(username.trim(), password);
      onClose();
    } catch (err) {
      setError(err.message || "Login gagal.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-teal-950/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
        <div className="mb-4 flex items-center gap-2">
          <Lock size={18} className="text-teal-800" />
          <h3 className="text-base font-bold text-slate-800">Login Sistem Pengolahan Air</h3>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Username</label>
            <input autoFocus type="text" value={username} onChange={(ev) => setUsername(ev.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</label>
            <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none" />
          </div>
          {error && <p className="rounded-xl bg-red-50 p-2.5 text-xs text-red-600 border border-red-200">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600">
              Batal
            </button>
            <button type="submit" disabled={submitting || !username || !password}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-60 shadow-sm">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null} Masuk
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChangePasswordModal({ token, onClose }) {
  const toast = useToast();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const submit = async (ev) => {
    ev.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("Password baru minimal 6 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password baru tidak sama.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiChangePassword(oldPassword, newPassword, token);
      if (res.error) throw new Error(res.error);
      setSuccess(true);
      toast.success("Password berhasil diganti.");
    } catch (err) {
      setError(err.message || "Gagal mengganti password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-teal-950/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
        <div className="mb-4 flex items-center gap-2 border-b pb-3">
          <KeyRound size={18} className="text-teal-800" />
          <h3 className="text-sm font-bold text-slate-800">Ganti Password</h3>
        </div>
        {success ? (
          <div>
            <p className="mb-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700 font-semibold text-center border border-emerald-200">Password berhasil diperbarui!</p>
            <div className="flex justify-end">
              <button onClick={onClose} className="rounded-xl bg-teal-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-900">
                Tutup
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">Password Lama</label>
              <input autoFocus type="password" value={oldPassword} onChange={(ev) => setOldPassword(ev.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">Password Baru</label>
              <input type="password" value={newPassword} onChange={(ev) => setNewPassword(ev.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-500">Ulangi Password Baru</label>
              <input type="password" value={confirmPassword} onChange={(ev) => setConfirmPassword(ev.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none" />
            </div>
            {error && <p className="p-2 bg-red-50 text-red-600 text-xs rounded-xl border border-red-200">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600">
                Batal
              </button>
              <button type="submit" disabled={submitting || !oldPassword || !newPassword || !confirmPassword}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-60 shadow-xs">
                {submitting ? <Loader2 size={13} className="animate-spin" /> : null} Simpan
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ProfileModal({ session, onClose, onChangePasswordClick }) {
  const rows = [
    { label: "Username", value: session.username },
    { label: "Nama Lengkap", value: session.nama },
    { label: "Jabatan", value: session.role },
    { label: "Departemen", value: session.departemen },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-teal-950/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4">
        <div className="flex items-center gap-3 border-b pb-3.5">
          <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-800 flex items-center justify-center font-bold">
            <User size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Profil Pengguna</h3>
            <p className="text-[11px] text-slate-400">Informasi akun aktif</p>
          </div>
        </div>
        <div className="space-y-2 text-xs">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-400">{r.label}</span>
              <span className="font-bold text-slate-800">{r.value}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            Tutup
          </button>
          <button onClick={() => { onClose(); onChangePasswordClick(); }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 hover:bg-teal-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs">
            <KeyRound size={13} /> Ganti Password
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   15. AUDIT TRAIL / RIWAYAT AKTIVITAS
   ========================================================================= */
// Ubah daftar log jadi CSV yang aman dibuka Excel (BOM + pemisah ";" supaya
// Excel versi Indonesia tidak menggabung semua kolom jadi satu).
function logsToCSV(logs) {
  const header = ["Waktu", "Username", "Nama", "Role", "Departemen", "Aksi", "Sistem", "Bulan", "Detail"];
  const esc = (v) => `"${String(v === null || v === undefined ? "" : v).replace(/"/g, '""')}"`;
  const rows = logs.map((l) => [
    l.waktu ? new Date(l.waktu).toLocaleString("id-ID") : "",
    l.username, l.nama, l.role, l.departemen, l.aksi, l.sistem, l.bulan, l.detail,
  ].map(esc).join(";"));
  return "\uFEFF" + [header.map(esc).join(";")].concat(rows).join("\r\n");
}

function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ActivityLogPage({ token, session, onBack }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Unduh audit trail: Administrator, atau QA level Supervisor ke atas.
  const canDownload = session?.role === "Administrator" || hasAccess(session, "Supervisor", "QA");

  const handleDownload = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`Audit_Trail_SPA_${stamp}.csv`, logsToCSV(logs));
  };

  useEffect(() => {
    let cancelled = false;
    fetchActivityLog(token)
      .then((res) => { if (!cancelled) setLogs(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition">
          <ChevronLeft size={16} /> Kembali ke Dashboard
        </button>
      </div>

      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Riwayat Aktivitas &amp; Audit Trail</h2>
          <p className="text-xs text-slate-400">Rekam jejak seluruh aksi input, edit, dan persetujuan pengujian air</p>
        </div>
        {canDownload && (
          <button onClick={handleDownload} disabled={loading || logs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs">
            <Download size={14} /> Unduh CSV ({logs.length})
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center p-12 text-slate-400"><Loader2 className="animate-spin" size={24} /></div>
      ) : error ? (
        <p className="rounded-2xl bg-red-50 p-4 text-xs text-red-600 border border-red-200 font-semibold">{error}</p>
      ) : logs.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-slate-200 text-slate-400 text-xs">Belum ada riwayat aktivitas yang tercatat.</div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/80 divide-y text-xs shadow-xs overflow-hidden">
          {logs.map((l, i) => (
            <div key={i} className="p-4 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50/70 transition">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-800">{l.nama}</span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                    {l.role} {l.departemen ? `· ${l.departemen}` : ""}
                  </span>
                  <span className="font-semibold text-teal-900 bg-teal-50 px-2.5 py-0.5 rounded-full text-[11px] border border-teal-200/60">
                    {l.aksi}
                  </span>
                  {l.sistem && (
                    <span className="text-[11px] font-bold text-slate-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      {l.sistem}
                    </span>
                  )}
                </div>
                {l.detail && <p className="text-slate-500 text-[11px]">{l.detail}</p>}
              </div>
              <span className="text-slate-400 text-[10px] whitespace-nowrap">{new Date(l.waktu).toLocaleString("id-ID")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   16. HALAMAN VERIFIKASI QR DOKUMEN PUBLIK (/verify)
   ========================================================================= */
function VerifyPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const type = params.get("type");
  const systemKey = params.get("system");
  const slot = params.get("slot");
  const period = params.get("month");
  const system = SYSTEMS.find((s) => s.key === systemKey);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!type || !systemKey || !period || !slot || !system) {
        setErrorMsg("Kode QR tidak lengkap atau tidak dikenali.");
        setLoading(false);
        return;
      }
      try {
        const res = type === "reportHasil" ? await fetchReportHasil(systemKey, period) : await fetchReport(systemKey, period);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setErrorMsg(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  let signer = null;
  let docLabel = "";
  let periodLabel = "";
  if (data && !data.error) {
    if (type === "reportHasil") {
      docLabel = "Report Hasil Pemeriksaan " + system.jenis;
      periodLabel = "Periode: " + monthLabel(period);
      signer = slot === "analis"
        ? { nama: data.analis?.nama, label: "Diperiksa oleh", tanggal: data.analis?.tanggal }
        : { nama: data.diperiksa?.nama, label: "Mengetahui (QC)", tanggal: data.diperiksa?.tanggal };
    } else {
      docLabel = "Pengkajian Trend Data SPA";
      periodLabel = "Periode: " + monthLabel(period);
      signer = slot === "dinilai"
        ? { nama: data.signoff?.dinilai?.nama, label: "Dikaji Oleh", tanggal: data.signoff?.dinilai?.tanggal, jabatan: data.signoff?.dinilai?.jabatan }
        : { nama: data.signoff?.diperiksa?.nama, label: "Mengetahui (Final)", tanggal: data.signoff?.diperiksa?.tanggal, jabatan: data.signoff?.diperiksa?.jabatan };
    }
  }
  const isValid = !!signer?.nama;
  const [periodLabelKey, periodLabelVal] = periodLabel.split(/:\s(.+)/);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex flex-col items-center gap-1.5 text-center">
          <img src="/logo-rama.png" alt="Logo" className="h-14 w-14 object-contain" />
          <h1 className="text-base font-bold text-slate-800">Verifikasi Dokumen SPA</h1>
          <p className="text-xs text-slate-500">PT. Rama Emerald Multi Sukses</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl text-center space-y-4">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 size={24} className="animate-spin text-teal-600" /></div>
          ) : errorMsg || !system || data?.error ? (
            <div className="space-y-2">
              <AlertTriangle className="text-red-500 mx-auto" size={32} />
              <p className="text-sm font-bold text-red-600">Kode Tidak Valid</p>
              <p className="text-xs text-slate-500">{errorMsg || data?.error || "Dokumen tidak ditemukan."}</p>
            </div>
          ) : !isValid ? (
            <div className="space-y-2">
              <AlertTriangle className="text-amber-500 mx-auto" size={32} />
              <p className="text-sm font-bold text-amber-600">Belum Ditandatangani</p>
              <p className="text-xs text-slate-500">Slot tanda tangan ini belum disetujui di sistem.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 mx-auto shadow-inner">
                <CheckCircle2 size={32} />
              </div>
              <p className="text-sm font-bold text-emerald-800">Dokumen Sah &amp; Terverifikasi</p>
              <div className="bg-slate-50 rounded-2xl p-4 text-left text-xs space-y-2 border border-slate-100">
                <p><span className="text-slate-400">Dokumen:</span> <span className="font-semibold text-slate-800">{docLabel}</span></p>
                <p><span className="text-slate-400">Sistem:</span> <span className="font-semibold text-slate-800">{system.label}</span></p>
                <p><span className="text-slate-400">{periodLabelKey}:</span> <span className="font-semibold text-slate-800">{periodLabelVal}</span></p>
                <p><span className="text-slate-400">{signer.label}:</span> <span className="font-bold text-slate-900">{signer.nama}</span></p>
                {signer.jabatan && <p><span className="text-slate-400">Jabatan:</span> <span className="font-semibold text-slate-800">{signer.jabatan}</span></p>}
                <p><span className="text-slate-400">Status:</span> <span className="font-semibold text-emerald-700">Terverifikasi Digital</span></p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   17. APP ROOT CONTROLLER
   ========================================================================= */
function AppInner() {
  const { session, checking, login: doLogin, logout: doLogout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [view, setView] = useState({ page: "dashboard" });
  const [monthKey, setMonthKey] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [statusIndex, setStatusIndex] = useState({});
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  // Temuan yang sudah ditutup lewat sampling ulang: tidak dihitung di badge,
  // tapi tetap ditampilkan sebagai bukti tindak lanjut untuk inspeksi.
  const [resolvedNotifications, setResolvedNotifications] = useState([]);

  const refreshStatus = useCallback(async (month) => {
    setLoadingStatus(true);
    setStatusError("");
    try {
      const idx = await fetchStatusIndex(month);
      setStatusIndex(idx);
    } catch (err) {
      setStatusError("Gagal memuat status: " + err.message);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (view.page === "dashboard") refreshStatus(monthKey);
  }, [view.page, monthKey, refreshStatus]);

  useEffect(() => {
    if (!session) {
      setNotifications([]);
      setResolvedNotifications([]);
      return;
    }
    let isMounted = true;
    const fetchNotifs = async () => {
      try {
        const notifList = [];
        const closedList = [];
        await Promise.all(
          SYSTEMS.map(async (sys) => {
            try {
              const entriesRes = await fetchEntries(sys.key, monthKey).catch(() => []);
              const list = Array.isArray(entriesRes) ? entriesRes : entriesRes?.entries || [];
              const params = PARAMS_BY_JENIS[sys.jenis] || [];
              // Temuan dikumpulkan lewat collectFindings supaya hasil yang
              // sudah ditindaklanjuti dengan sampling ulang tidak lagi
              // dihitung sebagai alert terbuka — tapi tetap tercatat.
              collectFindings(list, params, sys.jenis).forEach((f) => {
                const p = f.paramKey;
                const dasar = {
                  systemKey: sys.key,
                  systemLabel: sys.label,
                  desc: `Titik ${f.entry.titikSampling} parameter ${PARAM_META[p].label}: ${f.entry[p]} (Tgl ${f.entry.tanggal}).`,
                  time: f.entry.tanggal,
                };
                if (f.status === "selesai") {
                  const beda = selisihHari(f.entry.tanggal, f.ulang.tanggal);
                  closedList.push({
                    ...dasar,
                    type: "resolved",
                    title: "Ditutup — sampling ulang memenuhi syarat",
                    desc: `${dasar.desc} Sampling ulang ${f.ulang.tanggal}${beda === 0 ? " (hari yang sama)" : beda != null ? ` (${beda} hari kemudian)` : ""}: ${f.ulang[p]}. ${f.ulang.catatanTindakLanjut}`,
                    penutup: f.ulang.ditutupOleh || "",
                  });
                  return;
                }
                notifList.push({
                  ...dasar,
                  type: "critical",
                  title:
                    f.status === "belum-memenuhi"
                      ? "Sampling ulang belum memenuhi syarat"
                      : f.status === "menunggu-catatan"
                        ? "Menunggu catatan tindak lanjut"
                        : `Peringatan ${f.asli.level === 4 ? "TMS (Melebihi Syarat)" : "Action Limit"}`,
                  desc:
                    f.status === "terbuka"
                      ? `${dasar.desc} Belum ada sampling ulang.`
                      : f.status === "menunggu-catatan"
                        ? `${dasar.desc} Sampling ulang ${f.ulang.tanggal} sudah memenuhi syarat, tinggal isi catatan tindak lanjut untuk menutup temuan.`
                        : `${dasar.desc} Sampling ulang ${f.ulang.tanggal}: ${f.ulang[p]} — masih belum memenuhi.`,
                });
              });
            } catch {}
          })
        );
        if (isMounted) {
          setNotifications(notifList);
          setResolvedNotifications(closedList);
        }
      } catch {}
    };
    fetchNotifs();
  }, [session, monthKey]);

  const handleSelectNotification = (notif) => {
    if (notif.systemKey) {
      setView({ page: "detail", system: notif.systemKey });
    }
  };

  const handleLogout = useCallback(() => {
    doLogout();
    setView({ page: "dashboard" });
    setShowProfile(false);
    setShowChangePassword(false);
  }, [doLogout]);

  if (checking) {
    return <div className="flex h-screen items-center justify-center text-slate-400 font-sans"><Loader2 className="mr-2 animate-spin" size={18} /> Memuat sesi...</div>;
  }

  return (
    <div className="min-h-full bg-slate-50 flex font-sans">
      <style>{`
        .only-print { display: none; }
        .print-blocked-notice { display: none; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          .no-print, aside, header { display: none !important; }
          .only-screen { display: none !important; }
          .only-print { display: block !important; }
          .print-content-shell { padding-left: 0 !important; margin-left: 0 !important; width: 100% !important; max-width: 100% !important; }
          .print-card { box-shadow: none !important; border: 1px solid #cbd5e1 !important; page-break-inside: avoid; break-inside: avoid; }
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }
          [data-print-blocked="true"] > *:not(.print-blocked-notice) { display: none !important; }
          [data-print-blocked="true"] .print-blocked-notice {
            display: block !important; padding: 5rem 2rem; text-align: center;
            font-size: 15px; font-weight: 700; color: #334155;
          }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-10px) scale(.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @page { margin: 1.5cm 1.5cm 2cm 1.5cm; }
      `}</style>

      <Sidebar
        session={session}
        view={view}
        setView={setView}
        status={statusIndex}
        onNeedLogin={() => setShowLogin(true)}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        notifications={notifications}
      />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-72 print-content-shell">
        <HeaderBar
          session={session}
          onLoginClick={() => setShowLogin(true)}
          onLogout={handleLogout}
          onProfileClick={() => setShowProfile(true)}
          month={monthKey}
          setMonth={setMonthKey}
          onToggleSidebar={() => setSidebarOpen(true)}
          notifications={notifications}
          onSelectNotification={handleSelectNotification}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {view.page === "dashboard" && (
            <Dashboard
              monthKey={monthKey}
              setMonthKey={setMonthKey}
              statusIndex={statusIndex}
              loadingStatus={loadingStatus}
              statusError={statusError}
              onOpen={(key) => setView({ page: "detail", system: key })}
            />
          )}
          {view.page === "notifications" && session && (
            <NotificationsPage
              notifications={notifications}
              resolved={resolvedNotifications}
              onSelectNotification={handleSelectNotification}
              setView={setView}
            />
          )}
          {view.page === "activity" && session && (
            <ActivityLogPage token={session?.token} session={session} onBack={() => setView({ page: "dashboard" })} />
          )}
          {view.page === "detail" && (
            <SystemDetail
              systemKey={view.system || SYSTEMS[0].key}
              monthKey={monthKey}
              setMonthKey={setMonthKey}
              onBack={() => setView({ page: "dashboard" })}
              onSaved={() => refreshStatus(monthKey)}
              session={session}
              token={session?.token}
            />
          )}
        </main>
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={doLogin} />}
      {showProfile && session && (
        <ProfileModal
          session={session}
          onClose={() => setShowProfile(false)}
          onChangePasswordClick={() => {
            setShowProfile(false);
            setShowChangePassword(true);
          }}
        />
      )}
      {showChangePassword && (
        <ChangePasswordModal token={session?.token} onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  );
}

/* =========================================================================
   18. ROOT — membungkus aplikasi dengan penyedia notifikasi pop-up (toast)
   ========================================================================= */
export default function App() {
  if (typeof window !== "undefined" && window.location.pathname === "/verify") {
    return <VerifyPage />;
  }
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
