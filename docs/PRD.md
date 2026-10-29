# PRD: ScriptBench, Fase Lanjutan

| | |
| --- | --- |
| Status | Disetujui untuk dikerjakan, dikirim bertahap per fase |
| Basis | Branch `claude/refactor-production-deploy-yls9yn` (NestJS + Vite, PostgreSQL) |
| Cakupan | 16 fitur dalam 4 fase |

Status tiap fitur dicatat di [Lampiran: Status](#lampiran-status) dan diperbarui setiap fase selesai.

## 1. Latar belakang

ScriptBench sudah bisa menulis, menjalankan dan mengamati script Playwright di browser: editor, preview interaktif, console, network, file output, variabel, jadwal dan riwayat. Dari pemakaian, ada tiga celah besar:

1. **Membuat script masih manual.** Orang harus tahu selector dan API Playwright. Editor tidak memberi autocomplete, dan rekaman aksi hanya lewat ekstensi Chrome terpisah.
2. **Otomasi belum bisa dilepas.** Script yang perlu login harus login ulang di setiap run. Jadwal hanya punya interval tetap, kegagalan tidak dilaporkan ke mana pun, dan tidak ada cara memicu run dari sistem lain.
3. **Belum siap dipakai bersama dalam tim.** Belum ada peran, admin, batas login, antrean run, retensi, dan test otomatis.

## 2. Tujuan dan ukuran keberhasilan

| Tujuan | Ukuran |
| --- | --- |
| Script pertama bisa dibuat tanpa menulis selector | Alur "rekam → sisipkan → jalankan" berhasil tanpa mengetik kode |
| Script yang butuh login bisa dijadwalkan | Run kedua dari project dengan sesi tersimpan tidak melewati halaman login |
| Kegagalan terjadwal diketahui dalam satu menit | Notifikasi terkirim ke kanal yang dipilih saat run gagal |
| Aman untuk server bersama | Login dibatasi, admin bisa menonaktifkan user, run tidak ditolak saat penuh tapi diantre |
| Perubahan tidak merusak fitur lama | CI menjalankan typecheck, unit test dan e2e di setiap push |

## 3. Pengguna

- **Automation engineer / QA**: menulis dan men-debug script, butuh autocomplete, inspector, trace.
- **Operator non-programmer**: merekam alur lalu menjadwalkannya, butuh rekaman dan notifikasi.
- **Admin server**: mengelola akun, kuota dan retensi.
- **Sistem lain (CI, n8n, cron eksternal)**: memicu run lewat API.

## 4. Prinsip

- Semua fitur memakai jalur run yang sama: API → worker per run → event SSE. Tidak ada jalur kedua.
- Data sensitif (sesi browser, token, konfigurasi notifikasi) dienkripsi dengan `ENCRYPTION_KEY`, sama seperti script dan variabel.
- Setiap fitur punya state kosong, loading dan error, bisa dipakai dengan keyboard, dan berjalan di mobile.
- Tidak ada fitur yang tampil tapi belum berfungsi. Fitur yang butuh konfigurasi server (misalnya email) disembunyikan atau diberi penjelasan bila belum diatur.

---

## Fase 1: Membuat script lebih cepat

### F1. Rekam aksi dari preview menjadi kode

**Masalah.** Preview sudah interaktif, tapi aksi di sana hilang setelah dilakukan.

**Cerita pengguna.** Sebagai operator, saya membuka sebuah URL, mengklik dan mengetik di preview, lalu menyisipkan kode yang dihasilkan ke file aktif.

**Perilaku**
- Tombol **Record** di panel Browser. Bila belum ada run, tombol meminta URL awal dan membuka sesi rekam (run khusus yang menunggu sampai dihentikan, dengan batas waktu maksimum server).
- Saat merekam, setiap aksi menghasilkan satu baris:
  - klik → `await page.getByRole("button", { name: "Masuk" }).click();`
  - ketik → `await page.getByLabel("Email").fill("…");` (ketikan beruntun pada elemen yang sama digabung)
  - tombol khusus → `await page.keyboard.press("Enter");`
  - navigasi dari address bar → `await page.goto("…");`
- Locator dipilih dengan urutan: `data-testid` → role + nama aksesibel → label → placeholder → teks → `#id` → CSS pendek.
- Daftar langkah tampil di panel, bisa **Sisipkan ke file**, **Salin**, atau **Bersihkan**.
- Nilai yang diketik ke field `type="password"` direkam sebagai `process.env.PASSWORD` dengan komentar, bukan teks asli.

**Kriteria terima**
- Rekam klik tombol dan isi field di halaman uji, lalu sisipkan dan jalankan: hasilnya sama dengan aksi manual.
- Password tidak pernah muncul di kode hasil rekaman maupun di log.

### F2. Sesi login tersimpan antar run

**Perilaku**
- Pengaturan per project: **Simpan sesi browser** (default mati).
- Bila aktif, cookie dan localStorage (`storageState` Playwright) disimpan terenkripsi di akhir setiap run dan dipakai di awal run berikutnya, termasuk run terjadwal dan run lewat API.
- Sesi disimpan per pasangan (project, user). Orang lain yang menjalankan project publik tidak memakai sesi pemilik.
- Tombol **Hapus sesi tersimpan** dan info kapan terakhir diperbarui.

**Kriteria terima**
- Run 1 mengisi cookie, run 2 membaca cookie yang sama.
- Setelah sesi dihapus, run berikutnya mulai dengan browser kosong.

**Data:** tabel `browser_sessions(project_id, user_id, state_enc, updated_at)`, kolom `projects.keep_session`.

### F3. Autocomplete Playwright di editor

**Perilaku**
- `page`, `context`, `browser` bertipe `Page`, `BrowserContext`, `Browser` dari definisi resmi Playwright yang dibundel (versi sama dengan runtime).
- Helper ScriptBench (`pause`, `solveCaptcha`, `chooseElements`, dan `row`/`data` dari F8) punya dokumentasi hover.
- Definisi tipe (~2 MB) dimuat terpisah setelah editor tampil, sehingga editor tidak menunggu.

**Kriteria terima:** mengetik `page.` menampilkan `goto`, `getByRole`, dan seterusnya, lengkap dengan parameternya.

### F10. Address bar yang bisa diisi

- Saat run berjalan atau di-pause, alamat di atas preview bisa diedit. Enter menjalankan `page.goto` dan, saat merekam, menambah baris `goto`.
- URL tanpa skema diberi `https://`.

### F11. Inspector elemen

- Tombol **Inspect** di panel Browser. Saat aktif, kursor di atas preview menyorot elemen di bawahnya (kotak dan nama tag) dan menampilkan locator yang disarankan, memakai generator yang sama dengan F1.
- Klik saat Inspect menyalin locator dan tidak mengklik halaman. Esc keluar dari mode Inspect.

---

## Fase 2: Run yang lebih lengkap

### F7. Pilihan browser, emulasi perangkat, proxy

- Run settings: **Browser** (Chromium, Firefox, WebKit). Browser yang tidak terpasang di server tampil nonaktif dengan alasannya (dicek lewat diagnostik).
- **Perangkat**: daftar perangkat Playwright (misalnya iPhone 15, Pixel 7, iPad). Perangkat mengatur viewport, user agent, touch dan skala.
- **Bahasa**, **zona waktu** dan **geolokasi** opsional.
- **Proxy**: URL server, misalnya `http://user:pass@host:8080`. Kredensial di URL disamarkan di log.
- Semua opsi ini ikut disimpan ke jadwal saat jadwal dibuat.

### F9. Playwright Trace

- Opsi run **Rekam trace**. Di akhir run, `trace.zip` muncul di Files sebagai jenis *trace*.
- Tombol **Buka trace** membuka trace viewer resmi Playwright yang disajikan server sendiri di `/trace-viewer/`, tanpa layanan luar.

### F8. Run berbasis data

- Opsi run **Data**: pilih file input CSV/XLSX yang sudah di-upload.
- Script dijalankan sekali untuk setiap baris, di browser yang sama. Tersedia variabel `row` (objek baris, kunci dari header), `rowIndex`, dan `data` (semua baris).
- Opsi **Berhenti di error pertama** atau lanjut. Log diberi penanda `Row 3/20`, dan ringkasan akhir menampilkan baris yang berhasil dan gagal.
- Batas 1.000 baris per run.

### F12. Bandingkan screenshot

- Di viewer gambar: **Bandingkan dengan…** memilih gambar lain, dengan file bernama sama dari run sebelumnya disarankan lebih dulu.
- Tiga mode: slider, berdampingan, dan diff (piksel berbeda diberi warna, plus persentase perbedaan).

### F13. Folder untuk file output

- File di tab Files bisa dipindah ke folder. Filter per folder, dan file tanpa folder masuk "Tanpa folder".
- Script juga bisa menulis ke subfolder (`reports/a.pdf`), dan subfolder itu menjadi foldernya.

---

## Fase 3: Otomasi tanpa ditunggui

### F5. Jadwal cron dan zona waktu

- Jenis jadwal **Cron** dengan ekspresi 5 kolom dan zona waktu (default zona waktu browser).
- Formulir menampilkan tiga waktu jalan berikutnya, atau pesan bila ekspresinya salah.
- Jadwal "sekali" juga menyimpan zona waktunya.

### F4. Notifikasi

- Pengaturan akun → **Notifikasi**: daftar kanal:
  - **Webhook** (POST JSON)
  - **Slack** (incoming webhook)
  - **Telegram** (bot token + chat id)
  - **Email** (hanya bila server punya `SMTP_URL`)
- Tiap kanal punya tombol **Kirim tes**.
- Tiap jadwal memilih **Kapan** (tidak pernah / saat gagal / selalu) dan **Ke kanal mana**.
- Isi pesan: nama project, file, status, durasi, error pertama, jumlah file output, dan tautan ke riwayat run.
- Konfigurasi kanal dienkripsi. Kegagalan kirim dicatat di log run, dan run tidak ikut gagal karenanya.

### F6. Pemicu run lewat API

- Pengaturan akun → **API token**: buat token (ditampilkan sekali), lihat kapan terakhir dipakai, cabut.
- `POST /api/v1/projects/:id/runs` menjalankan versi tersimpan. Body opsional: `entryFile`, `variableSetId`, `env`, `wait`.
  - Tanpa `wait`: langsung kembali dengan `runId`.
  - Dengan `wait: true`: menunggu sampai selesai (maksimum 10 menit), lalu mengembalikan status, log dan daftar file.
- `GET /api/v1/runs/:id` dan `GET /api/v1/runs/:id/artifacts` memakai token yang sama.
- Dokumentasi berisi contoh `curl` dan GitHub Actions di [docs/API.md](API.md).

---

## Fase 4: Siap produksi

### F16. Antrean, retensi, kuota

- **Antrean.** Saat batas run bersamaan tercapai, run baru berstatus *Queued* dengan posisi antrean, dan otomatis mulai saat ada slot. Yang menunggu bisa membatalkan.
- **Retensi.** `RETENTION_DAYS` (default 30, `0` = simpan selamanya): riwayat run dan file output yang lebih tua dihapus otomatis setiap hari. File input (upload) tidak terhapus.
- **Kuota.** `STORAGE_QUOTA_MB` per user (default 0 = tanpa batas). Penggunaan tampil di pengaturan akun. Saat kuota habis, upload ditolak dan run tetap jalan tapi file outputnya tidak disimpan (diberi peringatan di log).

### F15. Keamanan akun dan tim

- **Batas login**: 10 percobaan gagal per 15 menit per kombinasi IP dan email, lalu login ditolak sementara (HTTP 429).
- **Ganti password** di pengaturan akun.
- **Reset password** lewat email bila SMTP diatur. Admin selalu bisa membuat password sementara untuk user.
- **Peran**: `admin` dan `member`. Akun pertama dan `ADMIN_EMAIL` otomatis admin.
- **Halaman admin**: daftar user, penggunaan penyimpanan, ubah peran, nonaktifkan atau aktifkan, reset password.
- **Anggota project**: pemilik mengundang user lain sebagai *Editor* (boleh menyimpan dan menjadwalkan) atau *Viewer* (lihat dan jalankan).

### F14. Test otomatis dan CI

- Unit test (Vitest) untuk bagian murni: transformasi import, generator locator, pemetaan tombol, enkripsi, perhitungan jadwal, parsing data.
- E2E (Playwright Test) untuk alur utama: daftar, run, rekam, inspect, variabel rahasia, jadwal cron, antrean, API token.
- GitHub Actions: typecheck, unit, build, e2e (dengan Postgres service), lalu build image Docker.

---

## 5. Di luar cakupan

- Menjalankan script di mesin user (agent lokal).
- Editor kolaboratif berbasis CRDT. Sinkronisasi live tetap "siapa terakhir menang" per file.
- Billing dan multi-tenant per organisasi.
- SSO selain Google.

## 6. Risiko

| Risiko | Mitigasi |
| --- | --- |
| Locator hasil rekam rapuh di situs dinamis | Urutan prioritas locator mengutamakan atribut aksesibilitas, dan langkah bisa diedit sebelum disisipkan |
| Sesi tersimpan berisi token login | Dienkripsi, dipisah per user, dan bisa dihapus |
| Token API bocor | Hanya hash yang disimpan, ada prefix untuk dikenali, bisa dicabut, dan kapan terakhir dipakai tercatat |
| Notifikasi spam karena jadwal 5 menit yang terus gagal | Mode "saat gagal" hanya mengirim saat status berubah dari berhasil ke gagal, dan sekali per jam selama masih gagal |
| Trace dan video memenuhi disk | Retensi dan kuota (F16) |

## Lampiran: Status

| # | Fitur | Fase | Status |
| --- | --- | --- | --- |
| F1 | Rekam aksi dari preview | 1 | Selesai |
| F2 | Sesi login tersimpan | 1 | Selesai |
| F3 | Autocomplete Playwright | 1 | Selesai |
| F10 | Address bar | 1 | Selesai |
| F11 | Inspector elemen | 1 | Selesai |
| F7 | Browser, perangkat, proxy | 2 | Selesai |
| F9 | Playwright Trace | 2 | Selesai |
| F8 | Run berbasis data | 2 | Selesai |
| F12 | Bandingkan screenshot | 2 | Selesai |
| F13 | Folder output | 2 | Selesai |
| F5 | Cron dan zona waktu | 3 | Selesai |
| F4 | Notifikasi | 3 | Selesai |
| F6 | Pemicu lewat API | 3 | Selesai |
| F16 | Antrean, retensi, kuota | 4 | Direncanakan |
| F15 | Keamanan akun dan tim | 4 | Direncanakan |
| F14 | Test dan CI | 4 | Direncanakan |
