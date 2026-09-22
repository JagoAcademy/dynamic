import { supabase } from './supabase.js';

if (localStorage.getItem('logged_in') !== 'true' || localStorage.getItem('user_role') !== 'owner') {
  window.location.href = 'login.html';
} else {
  const ownerName = localStorage.getItem('user_name') || 'Director';
  document.getElementById('welcomeOwner').innerText = `Halo, ${ownerName}!`;
}

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.clear();
  window.location.href = 'login.html';
});

async function loadExecutiveSummary() {
  try {
    // 1. Tarik total jumlah kasus dari tabel debts
    const { count: totalDebts, error: errDebts } = await supabase
      .from('debts')
      .select('*', { count: 'exact', head: true });
    
    if (errDebts) throw errDebts;

    // 2. Tarik nominal pembayaran yang sudah terverifikasi
    const { data: payments, error: errPay } = await supabase
      .from('payments')
      .select('amount')
      .eq('status', 'Verified'); // Bisa disesuaikan dengan status valid di sistem lu
      
    if (errPay) throw errPay;

    // 3. Kalkulasi total nominal (SUM)
    const totalRecovery = payments.reduce((sum, row) => sum + Number(row.amount), 0);
    
    // Format mata uang Rupiah
    const formattedRecovery = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(totalRecovery);

    // 4. Update UI
    const elTotalKasus = document.getElementById('val-total-kasus');
    const elTotalRecovery = document.getElementById('val-total-recovery');
    
    if(elTotalKasus) elTotalKasus.innerText = `${totalDebts || 0} Kasus`;
    if(elTotalRecovery) elTotalRecovery.innerText = formattedRecovery;

  } catch (err) {
    console.error("Gagal memuat ringkasan eksekutif:", err);
  }
}

loadExecutiveSummary();
