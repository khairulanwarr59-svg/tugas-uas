const STORAGE_KEYS={users:"apoteku_users_v1",session:"apoteku_session_v1",produk:"apoteku_produk_v1",transaksi:"apoteku_transaksi_v1",qris:"apoteku_qris_v1"};
const ADMIN_CODE="APOTEK123";
const QRIS_DANA={nama:"QRIS DANA",nomor:"0895326738684"};

// ===== Simulasi saldo pembayaran =====
const BANK_DANA={nama:"Bank DANA",nomor:"0895326738684"};
const STORAGE_KEYS_BALANCE="apoteku_balance_v1";

function persistBalance(bal){
  localStorage.setItem(STORAGE_KEYS_BALANCE,JSON.stringify(bal));
}
function loadBalance(){
  const raw=safeParse(localStorage.getItem(STORAGE_KEYS_BALANCE),null);
  if(raw && typeof raw==='object') return raw;
  return { [BANK_DANA.nomor]:0 };
}
function formatRp(n){
  return "Rp "+Number(n||0).toLocaleString();
}

function depositKeDana(nomor,amount){
  const bal=loadBalance();
  const key=nomor;
  bal[key]=Number(bal[key]||0)+Number(amount||0);
  persistBalance(bal);
  return bal[key];
}

function formatMethodBadge(m){
  if(!m) return "";
  if(m==="tunai") return "Bayar di Tempat";
  if(m==="transfer") return "Transfer Bank DANA";
  return String(m);
}





const ADMIN_SEED_USERS=[
  {id:1,nama:"Admin Gudang",username:"admingudang1",email:"admingudang1@example.com",password:"12345678",role:"admin-gudang"},
  {id:2,nama:"Admin Penjualan",username:"adminsales1",email:"adminsales1@example.com",password:"12345678",role:"admin-sales"}
];

let sessionUser=null;
let users=[];
let produk=[];
let transaksi=[];
let keranjang=[];

window.onload=()=>{
  bootstrapStorage();
  loadSession();
  loadAll();
  bookingExpiredScheduler();
  syncUIByRole();
  bindUI();
  renderKatalog("Semua");
  renderGudang();
  renderSales();
  switchTab("katalog");
};


function safeParse(v,fallback){try{return v?JSON.parse(v):fallback}catch(e){return fallback}}

function bootstrapStorage(){
  const u=safeParse(localStorage.getItem(STORAGE_KEYS.users),null);
  if(!Array.isArray(u)||u.length===0) localStorage.setItem(STORAGE_KEYS.users,JSON.stringify(ADMIN_SEED_USERS));

  // Produk sering rusak/inkonsisten antar-perubahan versi.
  // Agar nama barang seed selalu masuk katalog, merge PROUDK_SEED ke data lokal.
  const pLocal=safeParse(localStorage.getItem(STORAGE_KEYS.produk),null);
  const pArr=Array.isArray(pLocal)?pLocal:[];

  // Merge by id: seed jadi default, lalu override field dari local jika ada.
  const byId=new Map();
  PRODUK_SEED.forEach(p=>byId.set(Number(p.id),{...p}));
  pArr.forEach(p=>{
    const id=Number(p?.id);
    if(!id) return;
    // override (misal stok/medis/umum/gambar) tetap bisa dari local
    byId.set(id,{...(byId.get(id)||{}),...p});
  });

  const merged=[...byId.values()].sort((a,b)=>Number(a.id)-Number(b.id));
  localStorage.setItem(STORAGE_KEYS.produk,JSON.stringify(merged));

  const t=safeParse(localStorage.getItem(STORAGE_KEYS.transaksi),null);
  if(!Array.isArray(t)) localStorage.setItem(STORAGE_KEYS.transaksi,JSON.stringify([]));
}


function loadSession(){
  const s=safeParse(localStorage.getItem(STORAGE_KEYS.session),null);
  sessionUser=s&&s.username?s:null;
}

function loadAll(){
  users=safeParse(localStorage.getItem(STORAGE_KEYS.users),[]);
  produk=safeParse(localStorage.getItem(STORAGE_KEYS.produk),[]);
  transaksi=safeParse(localStorage.getItem(STORAGE_KEYS.transaksi),[]);
}

function bookingExpiredScheduler(){
  // Scheduler minimal kompatibel dengan model saat ini:
  // - Transaksi dibuat dengan bookingExpiresAt
  // - Stok fisik hanya dipotong saat admin-sales approve
  // - Jika belum Approved/Rejected dan bookingExpiresAt sudah lewat, transaksi jadi Expired/Rejected
  loadAll();
  const now=Date.now();
  let changed=false;

  transaksi.forEach(trx=>{
    if(!trx) return;

    const paymentStatus=trx.paymentStatus || trx.status || '';
    const isFinished = paymentStatus==='Approved' || paymentStatus==='Rejected' || trx.status==='Dikirim' || trx.status==='Selesai' || trx.status==='Ditolak';
    if(isFinished) return;

    const exp=trx.bookingExpiresAt ? Number(trx.bookingExpiresAt) : NaN;
    if(!Number.isFinite(exp)) return;
    if(exp>=now) return;

    // Expired => set rejected agar UI tidak bisa upload lagi.
    trx.paymentStatus='Rejected';
    trx.rejectedAt=new Date().toISOString();
    trx.status='Expired';

    trx.statusHistory=Array.isArray(trx.statusHistory)?trx.statusHistory:[];
    trx.statusHistory.push({
      status:'Expired',
      at:new Date().toISOString(),
      note:'Booking expired karena admin belum approve dalam 24 jam',
      by:(sessionUser?.username||'system')
    });

    // opsional: amankan kekurangan field biar UI tetap informatif
    if(trx.kekurangan && !Array.isArray(trx.kekurangan)) trx.kekurangan=[];

    changed=true;
  });

  if(changed) persistTransaksi();
}


function persistSession(u){localStorage.setItem(STORAGE_KEYS.session,JSON.stringify(u));}
function persistProduk(){localStorage.setItem(STORAGE_KEYS.produk,JSON.stringify(produk));}
function persistTransaksi(){localStorage.setItem(STORAGE_KEYS.transaksi,JSON.stringify(transaksi));}

function bindUI(){
  const hint=document.getElementById("checkout-hint");
  if(hint) hint.classList.add("hidden");

  // Toggle alamat GoSend saat radio pengambilan berubah
  const radios=[...document.querySelectorAll('input[name="metode-pengambilan"]')];
  const wrap=document.getElementById("gosend-alamat-wrap");
  if(radios.length && wrap){
    const sync=()=>{
      const checked=document.querySelector('input[name="metode-pengambilan"]:checked');
      const v=checked?checked.value:'ambil-tempat';
      wrap.classList.toggle("hidden", v!=="gosend");
    };
    radios.forEach(r=>r.addEventListener("change", sync));
    sync();
  }
}

function showToast(pesan){
  const toast=document.getElementById("toast");
  if(!toast){alert(pesan);return;}
  toast.textContent=pesan;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t=setTimeout(()=>toast.classList.add("hidden"),2500);
}

function roleLabel(role){
  if(role==="admin-gudang") return "Admin Gudang";
  if(role==="admin-sales") return "Admin Penjualan";
  return "Customer";
}

function syncUIByRole(){
  const status=document.getElementById("user-status");
  const btnLogout=document.getElementById("btn-logout");
  const btnLogin=document.getElementById("btn-login");
  const navAdminSales=document.getElementById("nav-admin-sales");
  const navAdminGudang=document.getElementById("nav-admin-gudang");
  const navTransaksi=document.getElementById("nav-transaksi");
  const avatarWrap=document.getElementById('user-avatar');
  const avatarInitial=document.getElementById('user-avatar-initial');


  if(!status) return;

  if(!sessionUser){
    status.classList.add("hidden");
    if(avatarWrap){
      avatarWrap.style.backgroundImage='';
      if(avatarInitial) avatarInitial.textContent='U';
    }

    if(btnLogout) btnLogout.classList.add("hidden");
    if(btnLogin) btnLogin.classList.remove("hidden");
    if(navAdminSales) navAdminSales.classList.add("hidden");
    if(navAdminGudang) navAdminGudang.classList.add("hidden");
    return;
  }

  status.classList.remove("hidden");
  status.textContent=`${sessionUser.nama} (${roleLabel(sessionUser.role)})`;

  // Set avatar initial (if no image; production can be extended to use real avatar)
  if(avatarInitial){
    const first=(sessionUser.nama||'User').trim().charAt(0).toUpperCase();
    avatarInitial.textContent=first||'U';
  }

  if(btnLogout) btnLogout.classList.remove("hidden");
  if(btnLogin) btnLogin.classList.add("hidden");

  if(navAdminSales) navAdminSales.classList.toggle("hidden", sessionUser.role!=="admin-sales");
  if(navAdminGudang) navAdminGudang.classList.toggle("hidden", sessionUser.role!=="admin-gudang");
}


// ===== Auth =====
function showLogin(){
  const modal=document.getElementById("modal-auth");
  if(!modal) return;
  modal.classList.remove("hidden");
  authSetMode("login");
}
function hideLogin(){
  const modal=document.getElementById("modal-auth");
  if(!modal) return;
  modal.classList.add("hidden");
}
function authSetMode(mode){
  const loginForm=document.getElementById("login-form");
  const registerForm=document.getElementById("register-form");
  const resetForm=document.getElementById("reset-form");
  const tabLogin=document.getElementById("tab-login");
  const tabRegister=document.getElementById("tab-register");
  if(!loginForm||!registerForm) return;

  if(resetForm) resetForm.classList.add("hidden");

  if(mode==="register"){
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
    if(tabLogin) tabLogin.className="flex-1 bg-slate-100 text-slate-700 text-xs font-bold py-2 rounded-xl";
    if(tabRegister) tabRegister.className="flex-1 bg-slate-900 text-white text-xs font-bold py-2 rounded-xl";
  } else {
    registerForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
    if(tabRegister) tabRegister.className="flex-1 bg-slate-100 text-slate-700 text-xs font-bold py-2 rounded-xl";
    if(tabLogin) tabLogin.className="flex-1 bg-slate-900 text-white text-xs font-bold py-2 rounded-xl";
  }
}

function goRegister(){
  showLogin();
  authSetMode('register');
}


function showResetPassword(){
  const modal=document.getElementById("modal-auth");
  const loginForm=document.getElementById("login-form");
  const registerForm=document.getElementById("register-form");
  const resetForm=document.getElementById("reset-form");
  if(!modal||!resetForm) return;

  modal.classList.remove("hidden");
  if(loginForm) loginForm.classList.add("hidden");
  if(registerForm) registerForm.classList.add("hidden");
  resetForm.classList.remove("hidden");
}

function hideResetPassword(){
  const resetForm=document.getElementById("reset-form");
  if(resetForm) resetForm.classList.add("hidden");
  authSetMode("login");
}

function resetPasswordSubmit(){
  const identifier=document.getElementById("reset-identifier")?.value.trim()||"";
  const newPass=document.getElementById("reset-new-pass")?.value||"";
  const confirmPass=document.getElementById("reset-confirm-pass")?.value||"";

  if(!identifier) return showToast("Isi Username atau Email.");
  if(!newPass) return showToast("Password baru wajib diisi.");
  if(newPass.length<4) return showToast("Password baru minimal 4 karakter.");
  if(newPass!==confirmPass) return showToast("Konfirmasi password tidak cocok.");

  loadAll();
  const u=users.find(x=>x.username===identifier||x.email===identifier);
  if(!u) return showToast("Akun tidak ditemukan.");

  u.password=newPass;
  localStorage.setItem(STORAGE_KEYS.users,JSON.stringify(users));

  // reset fields
  if(document.getElementById("reset-identifier")) document.getElementById("reset-identifier").value='';
  if(document.getElementById("reset-new-pass")) document.getElementById("reset-new-pass").value='';
  if(document.getElementById("reset-confirm-pass")) document.getElementById("reset-confirm-pass").value='';

  showToast("Password berhasil diubah. Silakan login.");
  hideResetPassword();
}

function loginSubmit(){
  const identifier=document.getElementById("login-identifier")?.value.trim()||"";
  const password=document.getElementById("login-password")?.value||"";
  if(!identifier||!password) return showToast("Isi email/username dan password.");

  loadAll();
  const u=users.find(x=>x.username===identifier||x.email===identifier);
  if(!u) return showToast("Akun tidak ditemukan.");
  if(u.password!==password) return showToast("Password salah.");

  sessionUser={id:u.id,nama:u.nama,username:u.username,role:u.role};
  persistSession(sessionUser);
  hideLogin();
  syncUIByRole();
  applyRoleAccess();
  if(u.role==="admin-gudang") switchTab("admin-gudang");
  else if(u.role==="admin-sales") switchTab("admin-sales");
  else switchTab("katalog");
  showToast("Login berhasil.");
}

function registerSubmit(){
  const get=(id)=>document.getElementById(id)?.value.trim()||"";
  const nama=get("reg-nama");
  const username=get("reg-username");
  const email=get("reg-email");
  const password=get("reg-password");
  const role=document.getElementById("reg-role")?.value||"customer";
  const adminCode=get("reg-admin-code");

  if(!nama||!username||!email||!password) return showToast("Lengkapi semua data.");
  if(!email.includes("@")) return showToast("Email tidak valid.");

  loadAll();
  if(users.some(x=>x.username===username||x.email===email)) return showToast("Username/email sudah digunakan.");

  if(role!=="customer"){
    if(adminCode!==ADMIN_CODE) return showToast("Admin Code salah.");
  }

  const nextId=users.length?Math.max(...users.map(u=>u.id))+1:1;
  // Tambahkan diskon medis 5% untuk customer (sesuai permintaan):
  // field ini dipakai saat hitung total penjualan medis (harga medis = p.medis).
  const isMedisMember=role==="customer";
  users.push({id:nextId,nama,username,email,password,role,medisMember:isMedisMember,medisDiscountPct:5});
  localStorage.setItem(STORAGE_KEYS.users,JSON.stringify(users));

  sessionUser={id:nextId,nama,username,role};
  persistSession(sessionUser);
  hideLogin();
  syncUIByRole();
  applyRoleAccess();
  switchTab(role==="admin-gudang"?"admin-gudang":role==="admin-sales"?"admin-sales":"katalog");
  showToast("Akun berhasil dibuat.");
}

function logout(){
  localStorage.removeItem(STORAGE_KEYS.session);
  sessionUser=null;
  syncUIByRole();
  applyRoleAccess();
  hideAllViews();
  switchTab("katalog");
  showToast("Logout berhasil.");
}

function applyRoleAccess(){
  // validasi tab admin (jika tidak login/role tidak sesuai)
  if(!sessionUser) return;
}

function hideAllViews(){document.querySelectorAll('.tab-view').forEach(v=>v.classList.add('hidden'));}

function switchTab(tabId){
  // akses control (customer boleh lihat dashboard ringan)
  if(tabId==="admin-sales" && sessionUser?.role!=="admin-sales"){
    // no-op: izinkan tampilan, tombol aksi akan dinonaktifkan di renderSales()
  }
  if(tabId==="admin-gudang" && sessionUser?.role!=="admin-gudang"){
    // no-op: izinkan tampilan, tapi renderGudang akan tetap kosong
  }

  hideAllViews();
  const el=document.getElementById('view-'+tabId);
  if(el) el.classList.remove('hidden');

  if(tabId==="katalog"){
    const sel=document.getElementById('filter-kategori');
    renderKatalog(sel?sel.value:"Semua");
  }
  if(tabId==="keranjang") updateKeranjangUI();
  if(tabId==="transaksi") renderCustomerTransaksi();
  if(tabId==="admin-gudang") renderGudang();
  if(tabId==="admin-sales") renderSales();
}

// ===== Katalog & Keranjang =====
function filterProduk(k){renderKatalog(k);}

function renderKatalog(kategori){
  const grid=document.getElementById('product-grid');
  if(!grid) return;
  loadAll();
  grid.innerHTML="";
  const list=(kategori==="Semua")?produk:produk.filter(p=>{
    if(kategori==="Obat Keras") return p.tipeObat==="keras";
    if(kategori==="Obat Bebas") return p.tipeObat==="bebas";
    return p.kategori===kategori;
  });
  if(!list.length){
    grid.innerHTML='<div class="col-span-full text-center text-slate-500">Tidak ada produk.</div>';
    return;
  }

  list.forEach(p=>{
    const disabled=(p.stok||0)<=0;
    const card=document.createElement('div');
    card.className="medicine-card p-5 flex flex-col justify-between";
    card.style.minHeight='310px';

    const imgBlock=document.createElement('div');
    imgBlock.className="mb-4";

    if(p.gambarBase64){
      const img=document.createElement('img');
      img.src=p.gambarBase64;
      img.alt=p.nama||"";
      img.className="w-full h-28 object-contain rounded-xl bg-slate-50 border border-slate-200";
      imgBlock.appendChild(img);
    } else {
      // Realistic-ish mockup using pure HTML/CSS (no external assets)
      const mock=document.createElement('div');
      mock.className="w-full h-28 rounded-xl border border-slate-200 bg-[radial-gradient(80%_80%_at_20%_10%,rgba(45,212,191,.25),transparent_55%),linear-gradient(180deg,rgba(255,255,255,.9),rgba(248,250,252,.6))] relative overflow-hidden flex items-center justify-center";

      const pack=document.createElement('div');
      pack.className="w-[72%] h-[70%] rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm flex items-center justify-center relative";

      const stripe=document.createElement('div');
      stripe.className="absolute left-0 top-0 h-full w-2 bg-gradient-to-b from-teal-400 to-blue-600 opacity-90";

      const label=document.createElement('div');
      label.className="w-[86%] px-2 text-center";
      label.innerHTML=`<div class="text-[9px] font-black tracking-wider text-slate-500 uppercase">${(p.kategori||'OBAT').toString().slice(0,18)}</div><div class="mt-1 text-[12px] font-extrabold text-slate-900">${(p.nama||'Produk').toString().slice(0,16)}</div>`;

      const blister=document.createElement('div');
      blister.className="absolute right-2 bottom-1 w-8 h-8 rounded-xl bg-white/70 border border-slate-200 shadow-inner flex items-center justify-center";
      blister.innerHTML="<div class='w-2.5 h-2.5 rounded-full bg-teal-400/80'></div>";

      pack.appendChild(stripe);
      pack.appendChild(label);


      mock.appendChild(pack);
      mock.appendChild(blister);

      imgBlock.appendChild(mock);
    }

    const catBadge=document.createElement('div');
    catBadge.className="inline-flex items-center gap-2 mb-3";
    const cat=document.createElement('span');
    cat.className="text-[10px] font-extrabold tracking-widest px-3 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-100 uppercase";
    cat.textContent=(p.kategori||'').toString().trim().toUpperCase();

    const dot=document.createElement('span');
    dot.className="w-2.5 h-2.5 rounded-full";
    dot.classList.add((p.stok||0)>0?"bg-emerald-500":"bg-red-500");

    catBadge.appendChild(cat);
    catBadge.appendChild(dot);

    const nama=document.createElement('h4');
    nama.className="font-extrabold text-slate-900 text-base leading-tight";
    nama.textContent=p.nama||"";

    const unit=document.createElement('p');
    unit.className="text-xs text-slate-500 mt-1";
    unit.textContent="Kemasan: "+(p.unit||"-");

    const priceRow=document.createElement('div');
    priceRow.className="mt-3 flex items-end justify-between gap-3";
    const hargaLbl=document.createElement('p');
    hargaLbl.className="text-[10px] text-slate-400 font-bold";
    hargaLbl.textContent="Harga";
    const harga=document.createElement('p');
    harga.className="text-base font-extrabold text-slate-900";
    harga.textContent="Rp "+Number(p.umum||0).toLocaleString();

    const stokEl=document.createElement('p');
    stokEl.className="text-[11px] text-slate-500 mt-2";
    stokEl.innerHTML='Stok: <strong>'+String(p.stok||0)+'</strong>';

    const bottom=document.createElement('div');
    bottom.className="mt-4 pt-3 border-t";

    const btn=document.createElement('button');
    btn.className="w-full mt-3 text-white text-xs font-extrabold py-2 rounded-xl transition flex items-center justify-center gap-2 "+(disabled?"opacity-50 bg-slate-400 cursor-not-allowed":"bg-teal-600 hover:bg-teal-700");

    const bagSvg=document.createElement('span');
    bagSvg.className='inline-flex';
    bagSvg.innerHTML="<svg class='w-4 h-4' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M6 7h15l-2 10H8L6 7z' stroke='currentColor' stroke-width='2' stroke-linejoin='round'/><path d='M6 7 5 3H2' stroke='currentColor' stroke-width='2' stroke-linecap='round'/></svg>";

    const btnText=document.createElement('span');
    btnText.textContent="Add to Cart";
    btn.appendChild(bagSvg);
    btn.appendChild(btnText);

    btn.disabled=disabled;
    btn.onclick=()=>tambahKeranjang(p.id);

    // Place pricing in the dedicated row
    priceRow.appendChild(hargaLbl);
    priceRow.appendChild(harga);

    // Bottom area only contains the CTA button
    bottom.appendChild(btn);

    card.appendChild(catBadge);
    card.appendChild(imgBlock);
    card.appendChild(nama);
    card.appendChild(unit);
    card.appendChild(priceRow);
    card.appendChild(stokEl);
    card.appendChild(bottom);

    grid.appendChild(card);


  });
}


function tambahKeranjang(produkId){
  if(!sessionUser||sessionUser.role!=='customer'){
    showToast('Login sebagai customer untuk membeli.');
    showLogin();
    return;
  }
  loadAll();
  const p=produk.find(x=>x.id===produkId);
  if(!p) return;
  const stok=Number(p.stok||0);
  if(stok<=0) return showToast('Stok habis.');

  const idx=keranjang.findIndex(it=>it.produkId===produkId);
  const currentQty=idx>=0?Number(keranjang[idx].qty||0):0;
  if(currentQty+1>stok) return showToast('Stok tidak cukup untuk menambah item.');

  if(idx>=0) keranjang[idx].qty=currentQty+1;
  else keranjang.push({produkId,qty:1});

  updateKeranjangUI();
  renderKatalog(document.getElementById('filter-kategori')?document.getElementById('filter-kategori').value:'Semua');
  showToast(p.nama+' masuk keranjang');
}

function hapusKeranjang(produkId){
  keranjang=keranjang.filter(it=>it.produkId!==produkId);
  updateKeranjangUI();
}

function ubahKeranjangQty(produkId, delta){
  if(!sessionUser||sessionUser.role!=='customer'){
    showToast('Login sebagai customer untuk membeli.');
    showLogin();
    return;
  }

  loadAll();
  const p=produk.find(x=>x.id===produkId);
  if(!p) return;

  const stok=Number(p.stok||0);
  if(stok<=0) return showToast('Stok habis.');

  const idx=keranjang.findIndex(it=>it.produkId===produkId);
  if(idx<0){
    if(delta>0) return tambahKeranjang(produkId);
    return;
  }

  const nextQty=Number(keranjang[idx].qty||0)+Number(delta);
  if(nextQty<=0){
    keranjang.splice(idx,1);
    updateKeranjangUI();
    return;
  }
  if(nextQty>stok){
    return showToast('Stok tidak cukup.');
  }

  keranjang[idx].qty=nextQty;
  updateKeranjangUI();
}

function updateKeranjangUI(){
  const list=document.getElementById('cart-list');
  const badge=document.getElementById('cart-badge');
  const subtotalEl=document.getElementById('subtotal-harga');
  const totalEl=document.getElementById('total-harga');
  const hint=document.getElementById('checkout-hint');

  if(badge){
    const totalQty=keranjang.reduce((s,it)=>s+(Number(it.qty||0)),0);
    badge.textContent=String(totalQty);
    badge.classList.toggle('hidden',totalQty<=0);
  }

  if(hint){
    hint.classList.toggle('hidden', !!(sessionUser&&sessionUser.role==='customer'));
  }

  if(!list) return;
  list.innerHTML="";

  if(!keranjang.length){
    list.innerHTML='<div class="text-slate-500 text-sm">Keranjang kosong.</div>';
    if(subtotalEl) subtotalEl.textContent='Rp 0';
    if(totalEl) totalEl.textContent='Rp 0';
    return;
  }

  loadAll();
  let subtotal=0;
  keranjang.forEach(it=>{
    const p=produk.find(x=>x.id===it.produkId);
    if(!p) return;

    const qty=Number(it.qty||0);
    const sub=Number(p.umum||0)*qty;
    subtotal+=sub;

    const row=document.createElement('div');
    row.className="bg-white border rounded-2xl p-4 flex justify-between items-center";
    row.innerHTML=`
      <div>
        <div class="font-bold text-slate-900">${p.nama}</div>
        <div class="text-xs text-teal-600 font-bold">Rp ${Number(p.umum||0).toLocaleString()}</div>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <button onclick="ubahKeranjangQty(${p.id},-1)" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs">-</button>
          <div class="text-xs font-bold text-slate-700 min-w-[22px] text-center">x ${qty}</div>
          <button onclick="ubahKeranjangQty(${p.id},1)" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs">+</button>
        </div>
        <button onclick="hapusKeranjang(${p.id})" class="text-red-500 text-xs font-bold ml-2">Hapus</button>
      </div>
    `;
    list.appendChild(row);
  });

  if(subtotalEl) subtotalEl.textContent='Rp '+subtotal.toLocaleString();
  if(totalEl) totalEl.textContent='Rp '+subtotal.toLocaleString();
}

function timeAgo(iso){
  const d=iso?new Date(iso):null;
  if(!d||Number.isNaN(d.getTime())) return '-';
  const diff=Date.now()-d.getTime();
  const s=Math.max(0,Math.floor(diff/1000));
  const m=Math.floor(s/60);
  const h=Math.floor(m/60);
  const day=Math.floor(h/24);
  if(day>0) return day+' hari';
  if(h>0) return h+' jam';
  if(m>0) return m+' menit';
  return s+' detik';
}

// ===== Customer Payment Proof (Prioritas #1) =====
function renderCustomerTransaksi(){
  if(!sessionUser||sessionUser.role!=='customer'){
    showToast('Login sebagai customer untuk melihat transaksi.');
    return;
  }

  bookingExpiredScheduler();

  const tbody=document.getElementById('customer-transaksi-body');

  if(!tbody) return;

  loadAll();
  const list=transaksi
    .filter(t=>t.username===sessionUser.username)
    .slice()
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));

  tbody.innerHTML='';
  if(!list.length){
    tbody.innerHTML='<tr><td class="p-4 text-slate-500" colspan="5">Belum ada transaksi.</td></tr>';
    return;
  }

  list.forEach(trx=>{
    const statusText=trx.paymentStatus || trx.status || '-';
    const isNeedUpload = (trx.paymentStatus==='Belum Upload' || trx.paymentStatus==='Menunggu Verifikasi' || trx.status==='Menunggu Pembayaran' || trx.status==='Butuh Pengisian');
    const hasProof = !!trx.paymentProof?.dataUrl;

    const paymentMethod = trx.pembayaran?.metode;
    // Customer hanya upload proof bila metode transfer dan status masih "Belum Upload".
    const canUpload = paymentMethod==='transfer' && !hasProof && (trx.paymentStatus==='Belum Upload');


    const statusColor=(statusText==='Approved' || trx.status==='Dikirim')?'text-emerald-700':(statusText==='Rejected'?'text-rose-700':'text-amber-700');

    const row=document.createElement('tr');
    row.className='border-b';
    row.innerHTML=`
      <td class="p-4 font-bold text-slate-900">${trx.id}</td>
      <td class="p-4 font-bold text-slate-900">Rp ${Number(trx.total||0).toLocaleString()}</td>
      <td class="p-4"><span class="text-xs font-bold ${statusColor}">${statusText}</span></td>
      <td class="p-4">
        ${hasProof?'<div class="text-xs font-bold text-emerald-700">Proof tersimpan</div>':'<div class="text-xs text-slate-500">Belum ada bukti</div>'}
        <div class="text-[10px] text-slate-400 mt-1">${timeAgo(trx.createdAt)}</div>
      </td>
      <td class="p-4">
        ${canUpload ? `
          <div class="flex items-center gap-2">
            <input type="file" accept="image/*,.pdf" onchange="uploadPaymentProof('${trx.id}', this.files[0])" class="text-xs" />
          </div>
        ` : `
          <div class="text-[10px] text-slate-500">Menunggu verifikasi</div>
        `}
      </td>
    `;

    tbody.appendChild(row);
  });
}

function uploadPaymentProof(trxId, file){
  if(!sessionUser||sessionUser.role!=='customer') return showToast('Akses ditolak.');
  if(!trxId) return;
  if(!file) return showToast('Pilih file bukti pembayaran.');

  const maxBytes=4*1024*1024;
  if(file.size>maxBytes) return showToast('Ukuran bukti maks 4MB.');

  loadAll();
  const idx=transaksi.findIndex(x=>x.id===trxId && x.username===sessionUser.username);
  if(idx<0) return showToast('Transaksi tidak ditemukan.');

  const trx=transaksi[idx];
  if(trx.paymentStatus!=='Belum Upload') return showToast('Bukti sudah ter-upload / tidak bisa diubah.');

  const reader=new FileReader();
  reader.onload=(e)=>{
    const dataUrl=String(e.target.result||'');
    trx.paymentProof={fileName:file.name,dataUrl};
    trx.paymentStatus='Menunggu Verifikasi';
    trx.approvedAt=null;
    trx.rejectedAt=null;
    trx.statusHistory=Array.isArray(trx.statusHistory)?trx.statusHistory:[];
    trx.statusHistory.push({status:'Menunggu Verifikasi',at:new Date().toISOString(),note:'Customer upload proof',by:sessionUser.username});

    persistTransaksi();
    showToast('Bukti pembayaran tersimpan. Menunggu verifikasi admin.');
    renderCustomerTransaksi();
  };
  reader.readAsDataURL(file);
}

function refreshTransaksiButuhPengisian(){

  // Jika stok sudah cukup, ubah status transaksi
  let changed=false;
  loadAll();
  // refresh booking expired dulu
  bookingExpiredScheduler();

  transaksi.forEach(trx=>{
    if(trx.status!=='Butuh Pengisian') return;


    const kekurangan=Array.isArray(trx.kekurangan)?trx.kekurangan:[];
    // cek semua item qty
    const ok=Array.isArray(trx.items)&&trx.items.every(it=>{
      const p=produk.find(x=>x.id===it.produkId);
      if(!p) return false;
      return Number(p.stok||0)>=Number(it.qty||0);
    });

    if(ok){
      trx.status='Menunggu Pembayaran';
      trx.kekurangan=[];
      changed=true;
    }
  });

  if(changed) persistTransaksi();
  if(sessionUser?.role==='admin-sales') renderSales();
}

function checkout(){
  if(!sessionUser||sessionUser.role!=='customer'){
    const hint=document.getElementById('checkout-hint');
    if(hint) hint.classList.remove('hidden');
    showToast('Login sebagai customer untuk checkout.');
    showLogin();
    return;
  }

  if(!keranjang.length) return showToast('Keranjang kosong.');

  const met=document.querySelector('input[name="metode-pengambilan"]:checked');
  const metodePengambilan=met?met.value:'ambil-tempat';
  let alamatGoSend='';
  if(metodePengambilan==='gosend'){
    alamatGoSend=(document.getElementById('gosend-alamat')?.value||'').trim();
    if(!alamatGoSend) return showToast('Isi alamat GoSend terlebih dahulu.');
  }

  loadAll();
  const items=keranjang.map(it=>{
    const p=produk.find(x=>x.id===it.produkId);
    return {produkId:it.produkId,nama:p?p.nama:'(hapus)',qty:it.qty,hargaUmum:p?Number(p.umum||0):0,hargaMedis:p?Number(p.medis||0):0};
  });

  const total=items.reduce((s,it)=>{

    const p2=produk.find(x=>x.id===it.produkId);
    const isMedis=(p2 && Number(p2.medis||0)>0);
    const isMedisMember=!!sessionUser?.medisMember;
    const discPct=Number(sessionUser?.medisDiscountPct||0);
    const hargaMedis=Number(p2?Number(p2.medis||0):0);
    const hargaUmum=Number(p2?Number(p2.umum||0):0);
    const hargaFinal=isMedisMember && isMedis ? Math.round(hargaMedis*(1-(discPct/100))) : hargaUmum;
    return s+hargaFinal*it.qty;
  },0);

  const trxId="TRX-"+Date.now();

  // Validasi stok (jika kurang => status Butuh Pengisian)
  const kekurangan=[];
  const kurang=items.some(it=>{
    const p=produk.find(x=>x.id===it.produkId);
    const stok=Number(p?.stok||0);
    if(stok>=Number(it.qty||0)) return false;
    kekurangan.push({
      produkId:it.produkId,
      nama:it.nama,
      diminta:Number(it.qty||0),
      tersedia:stok
    });
    return true;
  });

  const nextStatus=kurang?'Butuh Pengisian':'Menunggu Pembayaran';

  const nowIso=new Date().toISOString();
  const bookingExpiresAt=Date.now()+24*60*60*1000;

  // Metode pembayaran: customer pilih via radio (bayar di tempat / transfer)
  // Saat ini belum ada UI radio pembayaran di index.html, jadi untuk backward-compat tetap default transfer.
  // Jika di kemudian hari ada input: name="metode-pembayaran" value="tunai"|"transfer",
  // maka akan otomatis terpakai.
  let metodePembayaranRaw='transfer';
  const radioPay=document.querySelector('input[name="metode-pembayaran"]:checked');
  if(radioPay && radioPay.value) metodePembayaranRaw=radioPay.value;

  const metodePembayaran = (metodePembayaranRaw==='tunai') ? 'tunai' : 'transfer';

  // Untuk tunai: langsung Approved (tanpa proof)
  const awalPaymentStatus = metodePembayaran==='tunai' ? 'Approved' : 'Belum Upload';

  transaksi.push({
    id:trxId,
    pelanggan:sessionUser.nama,
    username:sessionUser.username,
    items,
    total,
    status:nextStatus,
    kekurangan:kurang?kekurangan:[],

    paymentProof:null,
    paymentStatus:awalPaymentStatus,
    approvedAt: metodePembayaran==='tunai' ? nowIso : null,
    rejectedAt:null,
    statusHistory:[
      {status:'Dibuat',at:nowIso,note:'Checkout dibuat',by:sessionUser.username}
    ],
    bookingExpiresAt,

    pengambilan:{
      metode:metodePengambilan==='gosend'?'GoSend':'Ambil di Tempat',
      alamatGoSend:alamatGoSend||''
    },
    pembayaran:{
      metode:metodePembayaran,
      nama:QRIS_DANA.nama,
      nomor:QRIS_DANA.nomor,
      createdAt:nowIso
    },
    createdAt:nowIso
  });

  // Jika tunai, deposit saldo langsung ke Bank DANA dan set status berjalan.
  if(metodePembayaran==='tunai'){
    // deposit sesuai total pesanan (demo)
    depositKeDana(QRIS_DANA.nomor,total);
    const idx=transaksi.findIndex(t=>t.id===trxId);
    const trx=transaksi[idx];
    if(trx){
      trx.statusHistory.push({status:'Approved',at:nowIso,note:'Bayar di tempat (langsung approved)',by:sessionUser.username});
      trx.status='Dikirim';
      trx.statusHistory.push({status:'Dikirim',at:new Date().toISOString(),note:'Diproses setelah bayar di tempat (demo)',by:sessionUser.username});
      // potong stok (karena payment approved langsung)
      trx.items.forEach(it=>{
        const p=produk.find(x=>x.id===it.produkId);
        if(!p) return;
        p.stok=Math.max(0,(Number(p.stok||0)-Number(it.qty||0)));
      });
      persistProduk();
    }
  }


  persistTransaksi();
  keranjang=[];
  updateKeranjangUI();

  showToast(`Pesanan dibuat. Scan QRIS DANA: ${QRIS_DANA.nomor} | Total: Rp ${total.toLocaleString()}.`);

  switchTab('admin-sales');
  renderSales();
}



// ===== Admin Penjualan =====
function renderSales(){
  // pastikan booking yang expired sudah di-reject sebelum ditampilkan/di-approve
  bookingExpiredScheduler();

  const tbody=document.getElementById('sales-table-body');
  if(!tbody) return;


  const isAdminSales=sessionUser?.role==='admin-sales';

  loadAll();
  tbody.innerHTML="";
  if(!transaksi.length){
    tbody.innerHTML='<tr><td class="p-4 text-slate-500" colspan="5">Belum ada transaksi.</td></tr>';
    return;
  }

  transaksi.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).forEach(t=>{
    const statusText=t.paymentStatus || t.status || '-';
  const paymentMethod=t.pembayaran?.metode;
  const isWaiting = (t.paymentStatus==='Menunggu Verifikasi' || t.status==='Menunggu Pembayaran');
  const disabled=!isWaiting || paymentMethod==='tunai';


    const tr=document.createElement('tr');
    tr.className='border-b';
    const statusColor=(statusText==='Menunggu Verifikasi' || statusText==='Menunggu Pembayaran')?'text-amber-700':'text-emerald-700';

    tr.innerHTML=`
      <td class="p-4 font-bold text-slate-900">${t.id}</td>
      <td class="p-4">
        <div class="font-bold">${t.pelanggan||'-'}</div>
        <div class="text-[10px] text-emerald-700 font-extrabold mt-1">
          QRIS: ${t.pembayaran?.nomor ? t.pembayaran.nomor : '-'}
        </div>
      </td>
      <td class="p-4 font-bold text-slate-900">Rp ${Number(t.total||0).toLocaleString()}</td>
      <td class="p-4"><span class="text-xs font-bold ${statusColor}">${statusText}</span></td>
      <td class="p-4">
        ${isAdminSales ? `
          <div class="flex gap-2">
            <button ${disabled?'disabled':''} onclick="adminVerifikasi('${t.id}','approved')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg ${disabled?'opacity-50 cursor-not-allowed':''}">
              Approve
            </button>
            <button ${disabled?'disabled':''} onclick="adminVerifikasi('${t.id}','rejected')" class="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg ${disabled?'opacity-50 cursor-not-allowed':''}">
              Reject
            </button>
          </div>
        ` : `
          <button disabled class="bg-slate-200 text-slate-500 font-bold text-xs px-3 py-1.5 rounded-lg opacity-60 cursor-not-allowed">
            Verifikasi
          </button>
        `}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function adminVerifikasi(id, outcome){
  if(sessionUser?.role!=='admin-sales') return showToast('Akses ditolak');
  bookingExpiredScheduler();
  loadAll();


  const idx=transaksi.findIndex(x=>x.id===id);

  if(idx<0) return;

  const trx=transaksi[idx];
  const paymentMethod=trx.pembayaran?.metode;
  if(paymentMethod==='tunai') return showToast('Pembayaran di tempat sudah diproses.');

  const isWaiting = trx.paymentStatus==='Menunggu Verifikasi' || trx.status==='Menunggu Pembayaran' || trx.status==='Menunggu Verifikasi';
  if(!isWaiting) return showToast('Transaksi tidak dalam status verifikasi.');

  if(outcome==='approved'){

    trx.paymentStatus='Approved';
    trx.approvedAt=new Date().toISOString();
    trx.statusHistory=Array.isArray(trx.statusHistory)?trx.statusHistory:[];
    trx.statusHistory.push({status:'Approved',at:trx.approvedAt,note:'Pembayaran disetujui',by:sessionUser.username});

    // potong stok setelah approve
    trx.items.forEach(it=>{
      const p=produk.find(x=>x.id===it.produkId);
      if(!p) return;
      p.stok=Math.max(0,(Number(p.stok||0)-Number(it.qty||0)));
    });

    trx.status='Dikirim';
    trx.statusHistory.push({status:'Dikirim',at:new Date().toISOString(),note:'Stok dipotong setelah approve',by:sessionUser.username});

    persistProduk();
    persistTransaksi();
    showToast('Pembayaran Approved. Status: Dikirim.');
    renderSales();
    if(typeof renderKatalog==='function') renderKatalog(document.getElementById('filter-kategori')?document.getElementById('filter-kategori').value:'Semua');
    return;
  }

  if(outcome==='rejected'){
    trx.paymentStatus='Rejected';
    trx.rejectedAt=new Date().toISOString();
    trx.statusHistory=Array.isArray(trx.statusHistory)?trx.statusHistory:[];
    trx.statusHistory.push({status:'Rejected',at:trx.rejectedAt,note:'Pembayaran ditolak',by:sessionUser.username});

    // status dikembalikan biar bisa diulang (opsional sederhana)
    trx.status='Ditolak';

    persistTransaksi();
    showToast('Pembayaran ditolak.');
    renderSales();
    return;
  }
}

function adminKirimObat(id){
  // Legacy tombol lama: map ke verifikasi approve untuk kompatibilitas.
  return adminVerifikasi(id,'approved');
}


// ===== Admin Gudang =====
function renderGudang(){
  const tbody=document.getElementById('gudang-table-body');
  if(!tbody) return;

  if(sessionUser?.role!=='admin-gudang'){
    tbody.innerHTML="";
    return;
  }

  loadAll();
  tbody.innerHTML="";

  if(!produk.length){
    tbody.innerHTML='<tr><td class="p-4 text-slate-500" colspan="8">Belum ada produk.</td></tr>';
    return;
  }

  produk.forEach(p=>{
    const tr=document.createElement('tr');
    tr.className='border-b align-top';

    const imgHtml=p.gambarBase64
      ? `<img src="${p.gambarBase64}" class="w-16 h-16 object-contain rounded-xl bg-slate-50 border border-slate-200" alt="${p.nama||''}" />`
      : `<div class="w-16 h-16 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-[10px] text-slate-400">No</div>`;

    tr.innerHTML=`
      <td class="p-3">${imgHtml}</td>
      <td class="p-3"><input data-field="nama" data-id="${p.id}" value="${p.nama||''}" class="w-44 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none text-xs font-bold"/></td>
      <td class="p-3"><input data-field="kategori" data-id="${p.id}" value="${p.kategori||''}" class="w-32 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none text-xs font-bold"/></td>
      <td class="p-3"><input type="number" min="0" data-field="stok" data-id="${p.id}" value="${p.stok||0}" class="w-24 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none text-xs font-bold"/></td>
      <td class="p-3"><input type="number" min="0" data-field="medis" data-id="${p.id}" value="${p.medis||0}" class="w-28 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none text-xs font-bold"/></td>
      <td class="p-3"><input type="number" min="0" data-field="umum" data-id="${p.id}" value="${p.umum||0}" class="w-28 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none text-xs font-bold"/></td>
      <td class="p-3"><input data-field="unit" data-id="${p.id}" value="${p.unit||''}" class="w-28 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none text-xs font-bold"/></td>
      <td class="p-3 w-80">
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <input type="file" accept="image/*" data-upload-id="${p.id}" onchange="adminUploadGambar(this)" class="text-xs" />
          </div>
          <button onclick="simpanEditProduk(${p.id})" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-2 rounded-xl">
            Simpan Perubahan
          </button>
        </div>
      </td>
    `;

    // Enter-to-save UX untuk admin-gudang
    tr.querySelectorAll(`input[data-id="${p.id}"]`).forEach(inp=>{
      inp.addEventListener('keydown',(ev)=>{
        if(ev.key==='Enter'){
          ev.preventDefault();
          simpanEditProduk(p.id);
        }
      });
    });

    tbody.appendChild(tr);
  });
}

function simpanEditProduk(id){
  if(sessionUser?.role!=='admin-gudang') return showToast('Akses ditolak');
  loadAll();
  const p=produk.find(x=>x.id===id);
  if(!p) return;

  const getVal=(field)=>document.querySelector(`input[data-field="${field}"][data-id="${id}"]`)?.value;
  const nama=(getVal('nama')||p.nama||'').trim();
  const kategori=(getVal('kategori')||p.kategori||'').trim();
  const unit=(getVal('unit')||p.unit||'').trim();

  const stok=Number(getVal('stok'));
  const medis=Number(getVal('medis'));
  const umum=Number(getVal('umum'));

  if(!nama||!kategori||!unit) return showToast('Nama/kategori/unit wajib diisi.');
  if(isNaN(stok)||stok<0) return showToast('Stok tidak valid.');
  if(isNaN(medis)||medis<0) return showToast('Harga medis tidak valid.');
  if(isNaN(umum)||umum<0) return showToast('Harga umum tidak valid.');

  p.nama=nama;
  p.kategori=kategori;
  p.unit=unit;
  p.stok=stok;
  p.medis=medis;
  p.umum=umum;

  persistProduk();
  refreshTransaksiButuhPengisian();
  renderGudang();
  renderKatalog('Semua');
  showToast('Produk tersimpan.');
}

function adminUploadGambar(inputEl){
  if(sessionUser?.role!=='admin-gudang') return showToast('Akses ditolak');
  const file=inputEl?.files?.[0];
  if(!file) return;

  const maxBytes=2*1024*1024;
  if(file.size>maxBytes) return showToast('Ukuran gambar maks 2MB.');

  const id=Number(inputEl.getAttribute('data-upload-id'));
  if(!id) return;

  const reader=new FileReader();
  reader.onload=(e)=>{
    loadAll();
    const p=produk.find(x=>x.id===id);
    if(!p) return;
    p.gambarBase64=String(e.target.result||'');
    persistProduk();
    refreshTransaksiButuhPengisian();
    renderGudang();
    renderKatalog('Semua');
    showToast('Gambar tersimpan.');
  };
  reader.readAsDataURL(file);
}

function openAddProduct(){
  if(sessionUser?.role!=='admin-gudang') return showToast('Akses ditolak');
  document.getElementById('modal-add-product')?.classList.remove('hidden');
}
function closeAddProduct(){
  document.getElementById('modal-add-product')?.classList.add('hidden');
}

function submitAddProduct(){
  if(sessionUser?.role!=='admin-gudang') return showToast('Akses ditolak');
  loadAll();

  const get=(id)=>document.getElementById(id)?.value.trim()||'';
  const nama=get('add-nama');
  const kategori=get('add-kategori');
  const unit=get('add-unit');
  const stok=Number(get('add-stok'));
  const medis=Number(get('add-medis'));
  const umum=Number(get('add-umum'));

  if(!nama||!kategori||!unit) return showToast('Nama/kategori/unit wajib diisi.');
  if(isNaN(stok)||stok<0) return showToast('Stok tidak valid.');
  if(isNaN(medis)||medis<0) return showToast('Harga medis tidak valid.');
  if(isNaN(umum)||umum<0) return showToast('Harga umum tidak valid.');

  const file=document.getElementById('add-gambar')?.files?.[0]||null;
  const nextId=produk.length?Math.max(...produk.map(x=>x.id))+1:1;
  const base={id:nextId,nama,kategori,unit,stok,medis,umum,gambarBase64:""};

  const finish=(gambarBase64)=>{
    base.gambarBase64=gambarBase64||"";
    produk.push(base);
    persistProduk();
    closeAddProduct();
    document.getElementById('add-gambar').value='';
    renderGudang();
    renderKatalog('Semua');
    showToast('Produk baru ditambahkan.');
  };

  if(!file) return finish('');
  const maxBytes=2*1024*1024;
  if(file.size>maxBytes) return showToast('Ukuran gambar maks 2MB.');

  const reader=new FileReader();
  reader.onload=(e)=>finish(String(e.target.result||''));
  reader.readAsDataURL(file);
}

// ===== Resep (demo) =====
let resepFileName="";
function uploadResep(e){
  const f=e?.target?.files?.[0];
  if(!f) return;
  resepFileName=f.name;
  const el=document.getElementById('resep-file-name');
  if(el) el.textContent=f.name;
}
function kirimResep(){
  if(!resepFileName) return showToast('Pilih file resep terlebih dahulu.');
  showToast('Resep terkirim (demo): '+resepFileName);
  resepFileName="";
  const el=document.getElementById('resep-file-name');
  if(el) el.textContent='Klik untuk mengunggah foto resep Anda';
  const input=document.getElementById('resep-file');
  if(input) input.value='';
}

