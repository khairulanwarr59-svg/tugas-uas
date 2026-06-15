# TODO_NEXT - Lanjutan Sistem (Prioritas: Payment Verification + Booking Expired)

## Step 1 — Data model transaksi (app.js)
- Tambah field transaksi:
  - paymentProof: { fileName, dataUrl }
  - paymentStatus: 'Belum Upload' | 'Menunggu Verifikasi' | 'Approved' | 'Rejected'
  - approvedAt, rejectedAt
  - statusHistory: array {status, at, note, by}
  - bookingExpiresAt: timestamp (checkout + 24 jam)

## Step 2 — Booking/Restock scheduler (app.js)
- Saat load/render: cek transaksi yang paymentStatus=Approved tapi belum dipotong? (opsional sesuai desain)
- Implement mekanisme booking expired:
  - Transaksi status “Belum Upload / Menunggu Verifikasi” dan bookingExpiresAt < now => kembalikan booking
  - Ubah state agar stok fisik kembali ke kondisi semula (menggunakan booked/ready/buffer sesuai implementasi).

## Step 3 — Checkout flow update (app.js)
- Ubah checkout agar:
  - bikin transaksi dengan bookingExpiresAt
  - stok fisik tidak dipotong saat checkout
  - status awal menunggu pembayaran.

## Step 4 — Customer UI: upload bukti pembayaran (index.html + app.js)
- Tambah section tracking transaksi customer:
  - list transaksi
  - untuk transaksi yang paymentStatus='Belum Upload' / 'Menunggu Verifikasi' tampilkan upload proof

## Step 5 — Admin-sales UI: approve/reject (index.html + app.js)
- Tambah tombol Approve/Reject + input alasan
- Approve:
  - set paymentStatus='Approved', approvedAt, statusHistory
  - baru kemudian kurangi stok fisik (ready -= qty)
- Reject:
  - set paymentStatus='Rejected', rejectedAt, statusHistory

## Step 6 — Integrasi status history + render refresh
- Pastikan renderSales/renderCustomer mengambil data terbaru
- Pastikan status refreshTransaksiButuhPengisian diganti/dipusatkan lewat booking scheduler.

## Step 7 — Testing manual
- Test: checkout => upload proof => admin approve => stok berkurang
- Test: checkout tapi admin tidak approve selama >24 jam => transaksi expired & bisa dibooking ulang

