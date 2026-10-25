import { supabase } from './supabase.js';

// --- PROTEKSI HALAMAN ---
if (localStorage.getItem('logged_in') !== 'true' || localStorage.getItem('user_role') !== 'owner') {
  window.location.href = 'login.html';
} else {
  const ownerName = localStorage.getItem('user_name') || 'Director';
  document.getElementById('welcomeOwner').innerText = `Halo, ${ownerName}!`;
}

// --- LOGOUT LOGIC ---
document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.clear();
  window.location.href = 'login.html';
});

// --- SISTEM NAVIGASI SIDEBAR / TAB ---
const navItems = document.querySelectorAll('.nav-item');
const sectionTabs = document.querySelectorAll('.section-tab');
const pageTitle = document.getElementById('pageTitle');
const sidebar = document.getElementById('sidebar');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebarOverlay = document.getElementById('sidebarOverlay');

// Logic ganti tab menu
navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    // 1. Hapus class 'active' dari semua menu, tambahkan ke yg diklik
    navItems.forEach(nav => nav.classList.remove('active'));
    e.currentTarget.classList.add('active');

    // 2. Ubah Judul Halaman di Topbar berdasarkan teks menu (buang emojinya)
    const rawText = e.currentTarget.innerText;
    pageTitle.innerText = rawText.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F]/g, '').trim();

    // 3. Sembunyikan semua konten tab, tampilkan yg targetnya cocok
    const targetId = e.currentTarget.getAttribute('data-target');
    sectionTabs.forEach(tab => {
      tab.classList.remove('active');
      if (tab.id === targetId) {
        tab.classList.add('active');
      }
    });

    // 4. Otomatis tutup sidebar di Mobile jika menu diklik
    closeMobileSidebar();
  });
});

// Logic Toggle Sidebar di Mobile
mobileMenuBtn?.addEventListener('click', () => {
  sidebar.classList.remove('-translate-x-full');
  sidebarOverlay.classList.remove('hidden');
});

sidebarOverlay?.addEventListener('click', closeMobileSidebar);

function closeMobileSidebar() {
  sidebar.classList.add('-translate-x-full');
  sidebarOverlay.classList.add('hidden');
}


// --- PENGAMBILAN DATA (FULL DATA DASHBOARD) ---
async function loadDashboardData() {
  try {
    // 1. TOTAL DEBITUR (Semua data di tabel debts)[span_0](start_span)[span_0](end_span)
    const { count: totalDebts, error: errTotal } = await supabase
      .from('debts')
      .select('*', { count: 'exact', head: true });
    if (errTotal) throw errTotal;

    // 2. PENAGIHAN AKTIF 
    // Catatan: Ganti 'Active' dengan value status di databasemu (misal 'Berjalan', 'Open', dll)
    const { count: totalAktif, error: errAktif } = await supabase
      .from('debts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Active'); 

    // 3. PENAGIHAN SELESAI / NON-AKTIF
    // Catatan: Ganti 'Inactive' dengan value databasemu (misal 'Lunas', 'Closed', dll)
    const { count: totalNonAktif, error: errNonAktif } = await supabase
      .from('debts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Inactive'); 

    // 4. REALISASI RECOVERY (Total uang dari tabel payments)[span_1](start_span)[span_1](end_span)
    const { data: payments, error: errPay } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'Verified'); // Sesuaikan dengan status valid di sistemmu[span_2](start_span)[span_2](end_span)
    if (errPay) throw errPay;

    // Kalkulasi Total Uang Masuk[span_3](start_span)[span_3](end_span)
    const totalRecovery = payments.reduce((sum, row) => sum + Number(row.amount), 0);
    
    // Format mata uang Rupiah[span_4](start_span)[span_4](end_span)
    const formattedRecovery = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(totalRecovery);

    // 5. UPDATE UI (Tampilkan Angka ke Layar)
    document.getElementById('stat-total-debitur').innerText = totalDebts || 0;
    
    // Gunakan try-catch per elemen jaga-jaga kalau error databasenya beda status
    document.getElementById('stat-aktif').innerText = totalAktif !== null ? totalAktif : '-';
    document.getElementById('stat-non-aktif').innerText = totalNonAktif !== null ? totalNonAktif : '-';
    
    document.getElementById('stat-realisasi').innerText = formattedRecovery;

  } catch (err) {
    console.error("Gagal memuat data dashboard Owner:", err);
  }
}

// Panggil fungsi saat halaman diload
loadDashboardData();
