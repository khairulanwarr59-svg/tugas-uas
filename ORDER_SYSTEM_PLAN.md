# Rencana Sistem Lanjutan (Customer / Sales Admin / Warehouse)

## Prinsip Data
- Semua data disimpan di localStorage (produk, transaksi, stok-log, voucher, supplier).
- Transaksi memiliki state machine: 
  - Menunggu Pembayaran -> Dikonfirmasi -> Dipacking -> Dikirim -> Selesai
  - Rejected bisa masuk dari fase Dikonfirmasi.
- Booking (saat checkout dibuat) mengurangi `ready` secara *logis* (menjadi booked), tetapi `ready`/stok fisik baru benar-benar berkurang saat pembayaran di-approve.

## Langkah Implementasi (bertahap)
### 0) Update Model Produk/Stok
- Tambahkan field produk: `minStok` (default 5) (untuk low stock alert).

### 1) Update Model Transaksi
Tambah field transaksi:
- `paymentProof`: {fileName, dataUrl}
- `paymentStatus`: 'Belum Upload' | 'Menunggu Verifikasi' | 'Approved' | 'Rejected'
- `approvedAt`, `rejectedAt`
- `statusHistory`: array {status, at, note, by}
- `bookingExpiresAt`: timestamp (checkout + 24 jam)

### 2) Mekanisme Booking/Restock otomatis
- Saat checkout:
  - validasi stok `ready >= qty`
  - buat transaksi dengan `bookingExpiresAt=now+24h`
  - kurangi `booked` logis (atau simpan `bookings` per produk) tanpa mengurangi `stok` fisik.
- Scheduler:
  - setiap render/load: cek transaksi yang belum approved dan sudah expired
  - kembalikan booking ke ready (hapus booking reservation)

### 3) Sisi Customer (UI)
- Order Tracking: tampilan timeline untuk tiap transaksi + status detail.
- Upload Bukti Transfer (hanya saat status menunggu pembayaran).
- Invoice Download:
  - Generate invoice HTML template dan trigger print-to-PDF.
- Wishlist Persisten:
  - Tambah tombol wishlist di product card
  - wishlist disimpan ke localStorage

### 4) Sisi Sales Admin
- Halaman verifikasi pembayaran:
  - tampilkan bukti upload
  - tombol Approve/Reject + input alasan.
- Status flow:
  - Approve => payment approved dan stok fisik dipotong (ready -= qty)
  - Button lanjut: Dipacking, Dikirim, Selesai.
- Dashboard grafik:
  - Chart.js jika tersedia, fallback canvas manual.
- Export laporan (range tanggal):
  - export CSV (Excel friendly) dan/atau print PDF.
- Promo/voucher:
  - UI buat voucher + store model voucher
  - apply voucher di checkout.

### 5) Sisi Warehouse Admin
- Stock opname & log:
  - UI form opname/restock/rusak
  - tulis log ke `stokLogs`.
- Low stock alert:
  - penanda merah di gudang table + badge di katalog.
- Supplier/vender master:
  - CRUD supplier.

## File yang akan diubah
- `app.js`
- `index.html`
- `style.css`
- `TODO.md`

## Urutan eksekusi yang disarankan
1) Update data model (transaksi + bookingExpiresAt + stokLogs skeleton)
2) Tambah scheduler restock expired
3) Buat UI minimal: halaman order tracking customer + payment upload
4) Buat UI minimal sales: approve/reject payment
5) Integrasikan invoice print

