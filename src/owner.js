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

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    navItems.forEach(nav => nav.classList.remove('active'));
    e.currentTarget.classList.add('active');

    const rawText = e.currentTarget.innerText;
    pageTitle.innerText = rawText.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F]/g, '').trim();

    const targetId = e.currentTarget.getAttribute('data-target');
    sectionTabs.forEach(tab => {
      tab.classList.remove('active');
      if (tab.id === targetId) {
        tab.classList.add('active');
      }
    });

    closeMobileSidebar();
  });
});

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
    // 1. TOTAL DEBITUR (Gabungan excel_debitur & manual_debitur)
    const { count: countManual, error: errMan } = await supabase.from('manual_debitur').select('*', { count: 'exact', head: true });
    if (errMan) throw errMan;
    
    const { count: countExcel, error: errExc } = await supabase.from('excel_debitur').select('*', { count: 'exact', head: true });
    if (errExc) throw errExc;
    
    const totalDebitur = (countManual || 0) + (countExcel || 0);

    // 2. PENAGIHAN AKTIF VS SELESAI
    const { data: penugasan, error: errTugas } = await supabase.from('penugasan_kolektor').select('*');
    if (errTugas) throw errTugas;

    let totalAktif = 0;
    let totalNonAktif = 0;
    let totalRecovery = 0;
    let lunasTasks = [];

    if (penugasan) {
        penugasan.forEach(t => {
            const stat = (t.status || '').toLowerCase();
            // Asumsi: Jika kolektor set status mengandung kata LUNAS / SELESAI
            if (stat.includes('lunas') || stat.includes('selesai')) {
                totalNonAktif++;
                lunasTasks.push(t);
            } else {
                totalAktif++;
            }
        });
    }

    // 3. REALISASI RECOVERY (Ekstrak otomatis uang dari JSONB Debitur Lunas)
    for (const task of lunasTasks) {
        const { data: dbData } = await supabase.from(task.sumber_tabel).select('*').eq('id', task.debitur_id).single();
        if (dbData) {
            const info = task.sumber_tabel === 'excel_debitur' ? dbData.debitur : dbData.contact_info;
            // Deteksi kunci kolom yang berbau tagihan/uang
            const moneyKey = Object.keys(info || {}).find(k => k.toLowerCase().includes('terutang') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('tagihan'));
            if (moneyKey) {
                const rawAmount = String(info[moneyKey]).replace(/[^\d]/g, ''); 
                totalRecovery += Number(rawAmount || 0);
            }
        }
    }

    // Format Rupiah
    const formattedRecovery = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(totalRecovery);

    // 4. UPDATE UI HTML
    document.getElementById('stat-total-debitur').innerText = totalDebitur;
    document.getElementById('stat-aktif').innerText = totalAktif;
    document.getElementById('stat-non-aktif').innerText = totalNonAktif;
    document.getElementById('stat-realisasi').innerText = formattedRecovery;

  } catch (err) {
    console.error("Gagal memuat data dashboard Owner:", err.message);
    document.getElementById('welcomeOwner').innerText = `Error: Gagal memuat data.`;
  }
}

// Panggil fungsi saat halaman diload
loadDashboardData();