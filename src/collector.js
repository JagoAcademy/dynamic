import { supabase } from './supabase.js';

if (localStorage.getItem('logged_in') !== 'true' || localStorage.getItem('user_role') !== 'collector') {
  window.location.href = 'login.html';
} else {
  const collectorName = localStorage.getItem('user_name') || 'Collector';
  document.getElementById('welcomeCollector').innerText = `Halo, ${collectorName}!`;
  loadCollectorTasks();
}

window.logout = function() {
  localStorage.clear();
  window.location.href = 'login.html';
}

async function loadCollectorTasks() {
  const userId = localStorage.getItem('user_id');
  const taskList = document.getElementById('task-list');
  const selectDebitur = document.getElementById('select_debitur');

  try {
    // Tarik data tunggakan (debts) beserta detail profil debiturnya (debtors)
    const { data: debts, error } = await supabase
      .from('debts')
      .select(`
        id,
        amount,
        due_date,
        status,
        debtors ( name, contact_info )
      `)
      .eq('collector_id', userId)
      .neq('status', 'Lunas');

    if (error) throw error;

    if (!debts || debts.length === 0) {
      taskList.innerHTML = `<p class="text-xs text-slate-500 text-center py-4 bg-white rounded-xl border border-slate-200 shadow-sm">Belum ada tugas penagihan aktif.</p>`;
      selectDebitur.innerHTML = `<option value="">Tidak ada debitur aktif</option>`;
      return;
    }

    // Render HTML untuk Daftar Tugas
    taskList.innerHTML = debts.map(debt => {
      const wa = debt.debtors?.contact_info?.wa || '';
      const linkWa = wa ? `https://wa.me/${wa.replace(/\D/g, '').replace(/^0/, '62')}` : '#';
      const formatRp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(debt.amount);
      
      return `
        <div class="bg-white border border-slate-200 p-4 rounded-xl shadow-sm mb-3">
           <h3 class="font-bold text-[#0B1B3D] text-[15px] uppercase">${debt.debtors?.name || 'Debitur Tidak Diketahui'}</h3>
           <p class="text-xs text-slate-500 font-medium mb-3">Tunggakan: <span class="text-red-500 font-bold">${formatRp}</span> | JT: ${debt.due_date}</p>
           <div class="flex gap-2">
               <a href="${linkWa}" target="_blank" class="flex-1 bg-green-500 hover:bg-green-600 transition-colors text-white text-[11px] font-bold py-2 rounded-lg text-center">📞 Chat WA</a>
               <button class="flex-1 bg-blue-100 hover:bg-blue-200 transition-colors text-blue-700 text-[11px] font-bold py-2 rounded-lg text-center">📍 Alamat</button>
           </div>
        </div>
      `;
    }).join('');

    // Render Opsi Dropdown untuk Form Log Aktivitas
    selectDebitur.innerHTML = `<option value="">-- Pilih Debitur / Kasus --</option>` + debts.map(debt => {
      return `<option value="${debt.id}">${debt.debtors?.name} - (${debt.status})</option>`;
    }).join('');

  } catch (err) {
    taskList.innerHTML = `<p class="text-xs text-red-500 py-4">Gagal memuat tugas: ${err.message}</p>`;
  }
}

// Eksekusi Simpan Laporan Interaksi ke tabel 'interactions'
document.getElementById('formLogAktivitas')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.innerText = "Menyimpan...";
  btn.disabled = true;

  const debiturId = document.getElementById('select_debitur').value;
  const hasilTindakLanjut = document.getElementById('hasil_tindak_lanjut').value;
  const tglJanji = document.getElementById('tgl_janji').value;
  const catatan = document.getElementById('catatan').value;

  if (!debiturId) {
    alert("Pilih debitur terlebih dahulu!");
    btn.innerText = "Simpan Laporan";
    btn.disabled = false;
    return;
  }

  // Format catatan gabungan jika ada janji bayar
  const finalNotes = tglJanji ? `${catatan}\n[Janji Bayar: ${tglJanji}]` : catatan;

  try {
    const { error } = await supabase.from('interactions').insert([{
      debt_id: debiturId,
      collector_id: localStorage.getItem('user_id'),
      type: hasilTindakLanjut,
      notes: finalNotes,
      interaction_date: new Date().toISOString()
    }]);

    if (error) throw error;
    
    alert("✅ Laporan aktivitas lapangan berhasil disimpan!");
    e.target.reset();
  } catch (err) {
    alert("Gagal simpan laporan: " + err.message);
  } finally {
    btn.innerText = "Simpan Laporan";
    btn.disabled = false;
  }
});
