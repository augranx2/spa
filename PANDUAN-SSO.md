# Login lewat Portal REMS (SSO) — SPA

Kode ini sudah siap memakai login Portal REMS, tapi **belum aktif**. Selama
`SSO_AKTIF` belum bernilai `true`, aplikasi berjalan persis seperti sebelumnya.

## A. Sekarang: deploy dalam keadaan mati

1. Upload isi zip ke repository SPA, biarkan Vercel deploy.
2. Environment Variables di Vercel (Settings, Environment Variables):

| Nama | Isi |
| --- | --- |
| `SSO_AKTIF` | `false` sekarang. Ubah ke `true` saat mengaktifkan. |
| `SSO_SECRET` | Sama persis dengan `SSO_SECRET` di project portal |
| `PORTAL_URL` | `https://portal.myrama.id` |
| `PORTAL_REDIS_URL` | Nilai `UPSTASH_REDIS_REST_URL` di project portal |
| `PORTAL_REDIS_TOKEN` | Nilai `UPSTASH_REDIS_REST_TOKEN` di project portal |
| `GAS_URL` | URL Apps Script (`/exec`), sama dengan `API_URL` di `public/config.js` |
| `GAS_SSO_KEY` | Teks acak minimal 16 karakter, khusus aplikasi ini |

3. **Apps Script**: salin `Code.gs` yang baru ke editor Apps Script, lalu
   Deploy, **Manage deployments**, ikon pensil, Version: **New version**,
   Deploy. Jangan pakai "New deployment" karena URL-nya akan berubah.
4. Apps Script, Project Settings, **Script Properties**, tambahkan
   `SSO_PROXY_KEY` = nilai yang sama dengan `GAS_SSO_KEY`.
5. Redeploy Vercel. Pastikan aplikasi masih bisa login seperti biasa.

## B. Setelah portal pindah ke portal.myrama.id

1. Ubah `SSO_AKTIF` menjadi `true`, lalu Redeploy.
2. Buka aplikasi: pengguna diarahkan ke login portal, lalu kembali otomatis.

## C. Opsional, setelah beberapa hari lancar

Tambahkan Script Property `SSO_WAJIB` = `true`. Semua akses langsung ke
Apps Script (tanpa lewat website) akan ditolak, termasuk data yang dulu bisa
dibaca tanpa login. Halaman /verify hasil scan QR tetap terbuka untuk umum.

## Mengembalikan ke login lama

Ubah `SSO_AKTIF` menjadi `false` lalu Redeploy. Bila `SSO_WAJIB` sudah
dinyalakan, ubah juga menjadi `false`.

## Yang berubah saat SSO aktif

- Tidak ada lagi halaman login di aplikasi ini; login selalu lewat portal.
- Role dan departemen diambil dari portal (menu Kelola pengguna).
- Tombol Keluar mengakhiri sesi portal (keluar dari semua aplikasi).
- Ganti password diarahkan ke portal.
- Semua data lewat `/api/gas` di Vercel; Apps Script hanya mempercayai
  identitas yang datang bersama `GAS_SSO_KEY`.
