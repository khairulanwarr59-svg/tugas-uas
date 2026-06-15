# TODO - Apoteku (Lanjutan Sistem)

## Prioritas 1: Booking expired scheduler (24 jam)
- [x] Tambahkan bookingExpiredScheduler() di app.js
- [x] Panggil scheduler saat window.onload
- [x] Panggil scheduler saat renderSales() dan renderCustomerTransaksi()
- [x] Pastikan transaksi expired di-set ke paymentStatus='Rejected' dan trx.status='Expired' + statusHistory
- [x] Pastikan customer tidak bisa upload proof lagi setelah expired


## Prioritas 2 (nanti): Konsistensi model stock booking vs ready (booked vs stok fisik)
- [ ] (opsional) migrasi model ready/booked
- [ ] (opsional) stok fisik dipotong saat Approve saja atau sesuai state machine

