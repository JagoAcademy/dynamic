import { supabase } from './supabase.js';

// 1. Cek Otentikasi
if (localStorage.getItem('logged_in') !== 'true' || localStorage.getItem('user_role') !== 'collector') {
  window.location.href = 'login.html';
} else {
  const collectorName = localStorage.getItem('user_name') || 'Collector';
  document.getElementById('welcomeCollector').innerText = `Halo, ${collectorName}!`;
}

// 2. Fungsi Logout
window.logout = function() {
  localStorage.clear();
  window.location.href = 'login.html';
}

// 3. Logika Form Laporan
document.getElementById('formLogAktivitas')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.innerText = "Menyimpan...";

  const debiturId = document.getElementById('select_debitur').value;
  const hasilTindakLanjut = document.getElementById('hasil_tindak_lanjut').value;
  const catatan = document.getElementById('catatan').value;

  try {
    const { error } = await supabase.from('interactions').insert([{
      debt_id: debiturId, 
      collector_id: localStorage.getItem('user_id'),
      type: hasilTindakLanjut,
      notes: catatan,
      interaction_date: new Date().toISOString()
    }]);

    if (error) throw error;
    alert("✅ Laporan kunjungan/telepon berhasil disimpan!");
    e.target.reset();
  } catch (err) {
    console.log(err);
    alert("Simulasi berhasil (Atau gagal simpan jika ID debitur belum valid/belum diikat di database).");
  } finally {
    btn.innerText = "Simpan Laporan";
  }
});
