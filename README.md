# Prospekta

Platform intelijen bisnis B2B, pemetaan prospek berbasis lokasi, generator proposal PDF, prebuilt website, dan Universal Model Context Protocol (MCP) AI Agent.

---

## Ringkasan Eksekutif

Prospekta dirancang untuk mempercepat siklus riset dan konversi prospek B2B secara presisi:

1. **Autentikasi & RBAC (Role-Based Access Control):** Mendukung 2 peran peran tegas (`admin` dan `user`) dengan pemisahan akses data dan isolasi token MCP.
2. **Pemetaan Prospek Berbasis Lokasi (Anchor & Geospasial):** Menyaring data tempat usaha di sekitar radius titik kantor dengan visualisasi peta interaktif.
3. **Generator Proposal & Analisis PDF:** Ekspor laporan audit komprehensif, sudut solusi, dan proposal resmi format PDF dalam sekali klik.
4. **Prebuilt Website Engine:** Pembuatan situs pratinjau instan (`/p/[slug]`) dengan desain berkonversi tinggi dan interactive concierge untuk menarik calon mitra.
5. **Universal MCP Plugin & Company AI Agent:** Integrasi MCP dual-role (`/api/mcp/user` dan `/api/mcp/admin`) yang dapat dihubungkan langsung ke Claude Code, Cursor, Gemini CLI, GPT Custom Action, maupun model AI mana pun. Dilengkapi dukungan integrasi alat Gmail via MCP.

---

## Fitur Utama

- **Peta Interaktif & Radius Geospasial:** Visualisasi persebaran bisnis dengan filter jarak, kategori usaha, status kepemilikan website, dan kontak terverifikasi.
- **Generator Dokumen PDF Profesional:** Penyusunan dokumen proposal penawaran terstruktur siap cetak/unduh.
- **Situs Showcase Instan:** Halaman pratinjau kustom yang siap dikirimkan kepada prospek.
- **Universal MCP Plugin (`packages/prospekta-mcp-plugin`):** Paket plugin standar stdio-ke-HTTP untuk menghubungkan ekosistem AI ke seluruh alat Prospekta sesuai kredensial token dan peran pengguna.
- **Konektor Gmail MCP:** Aksi pengiriman, draf, dan pembacaan email yang diisolasi sebagai alat MCP per akun.

---

## Panduan Menjalankan Aplikasi

### Kebutuhan Sistem

- Node.js versi 18 atau yang lebih baru
- Akses kredensial lingkungan yang valid

### Langkah Pengoperasian

1. Pasang seluruh dependensi aplikasi:

   ```bash
   npm install
   ```

2. Jalankan server pengembangan lokal:

   ```bash
   npm run dev
   ```

3. Buka peramban (browser) dan akses portal pada alamat `http://localhost:3000`.

---

## Standar Keamanan & Tata Kelola Data

- Kredensial penyedia layanan, basis data, dan konfigurasi rahasia dikelola secara terisolasi pada berkas variabel lingkungan lokal dan tidak disimpan dalam repositori publik.
- Token MCP di-hash menggunakan SHA-256 dan divalidasi per permintaan dengan pembatasan hak akses berbasis peran (RBAC).
