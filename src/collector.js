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
    // 1. Tarik riwayat penugasan dari tabel 'penugasan_kolektor' khusus untuk ID Kolektor yang lagi login
    const { data: assignments, error: assignError } = await supabase
      .from('penugasan_kolektor')
      .select('*')
      .eq('collector_id', userId)
      .eq('status', 'Ditugaskan'); // Cuma tarik yang masih aktif ditugaskan

    if (assignError) throw assignError;

    if (!assignments || assignments.length === 0) {
      taskList.innerHTML = `<p class="text-xs text-slate-500 text-center py-4 bg-white rounded-xl border border-slate-200 shadow-sm">Belum ada tugas penagihan aktif.</p>`;
      selectDebitur.innerHTML = `<option value="">Tidak ada debitur aktif</option>`;
      return;
    }

    // 2. Karena datanya mencar di manual_debitur & excel_debitur, kita harus fetch detailnya satu per satu berdasarkan ID
    let finalTasks = [];
    
    for (const task of assignments) {
       // Cek tabel mana yang harus kita tembak berdasarkan kolom sumber_tabel
       const { data: debiturDetail, error: detailError } = await supabase
         .from(task.sumber_tabel) // Ini bisa 'manual_debitur' atau 'excel_debitur'
         .select('*')
         .eq('id', task.debitur_id)
         .single();
         
       if (!detailError && debiturDetail) {
          // Gabungin data penugasan dengan detail profil debitur
          finalTasks.push({
             ...task,
             detail_debitur: debiturDetail
          });
       }
    }

    // 3. Render HTML untuk Daftar Tugas di Layar HP Kolektor
    taskList.innerHTML = finalTasks.map(task => {
      const db = task.detail_debitur;
      
      // Ambil nama (Kalau dari excel kadang disimpen di JSON, kalau manual di kolom 'name')
      let namaDebitur = db.name || 'Debitur Tidak Diketahui';
      if(task.sumber_tabel === 'excel_debitur' && db.debitur) {
          const nameKey = Object.keys(db.debitur).find(k => k.toLowerCase().includes('nama') || k.toLowerCase().includes('name'));
          if(nameKey) namaDebitur = db.debitur[nameKey];
      }

      // Ambil sisa tagihan (Mencar di dalam JSON)
      const contactInfo = task.sumber_tabel === 'excel_debitur' ? db.debitur : db.contact_info;
      const amountKey = Object.keys(contactInfo || {}).find(k => k.toLowerCase().includes('terutang') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('tagihan'));
      const rawAmount = amountKey ? contactInfo[amountKey] : 0;
      const formatRp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(rawAmount);
      
      // Ambil WA
      const waKey = Object.keys(contactInfo || {}).find(k => k.toLowerCase().includes('wa') || k.toLowerCase().includes('whatsapp') || k.toLowerCase().includes('telp'));
      const wa = waKey ? String(contactInfo[waKey]) : '';
      const linkWa = wa ? `https://wa.me/${wa.replace(/\D/g, '').replace(/^0/, '62')}` : '#';
      
      // Susun Alamat
      const kec = db.kecamatan || contactInfo?.kecamatan || contactInfo?.Kecamatan || '';
      const alamatSingkat = kec ? `Kec. ${kec}` : 'Lihat Detail Alamat';

      return `
        <div class="bg-white border border-slate-200 p-4 rounded-xl shadow-sm mb-3">
           <div class="flex justify-between items-start mb-1">
              <span class="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase">Klien: ${db.client || '-'}</span>
              <span class="text-[9px] font-bold text-slate-400">Tugas: ${task.tanggal_diberikan}</span>
           </div>
           <h3 class="font-bold text-[#0B1B3D] text-[15px] uppercase leading-tight mb-1">${namaDebitur}</h3>
           <p class="text-xs text-slate-500 font-medium mb-3">Tagihan: <span class="text-red-500 font-bold">${formatRp}</span></p>
           
           <div class="flex gap-2">
               <a href="${linkWa}" target="_blank" class="flex-1 bg-green-500 hover:bg-green-600 transition-colors text-white text-[11px] font-bold py-2.5 rounded-lg text-center shadow-sm">📞 Chat WA</a>
               <button class="flex-1 bg-blue-100 hover:bg-blue-200 transition-colors text-blue-800 text-[11px] font-bold py-2.5 rounded-lg text-center" onclick="alert('📍 Detail Alamat: \\n${db.alamat_lengkap || '-'} \\nKelurahan: ${db.kelurahan || '-'} \\nKecamatan: ${db.kecamatan || '-'} \\nKota: ${db.kota_kabupaten || '-'}')">
                  📍 ${alamatSingkat}
               </button>
           </div>
        </div>
      `;
    }).join('');

    // 4. Render Opsi Dropdown untuk Form Log Aktivitas
    selectDebitur.innerHTML = `<option value="">-- Pilih Debitur / Kasus --</option>` + finalTasks.map(task => {
      let n = task.detail_debitur.name;
      if(task.sumber_tabel === 'excel_debitur') {
         const k = Object.keys(task.detail_debitur.debitur).find(key => key.toLowerCase().includes('nama'));
         n = k ? task.detail_debitur.debitur[k] : 'Tanpa Nama';
      }
      // Kita kirim kombinasi id penugasan buat nanti gampang nge-update status
      return `<option value="${task.id}">${n} - (${task.detail_debitur.client})</option>`;
    }).join('');

  } catch (err) {
    taskList.innerHTML = `<p class="text-xs text-red-500 py-4 text-center">Gagal memuat tugas: ${err.message}</p>`;
  }
}

// Eksekusi Simpan Laporan Interaksi
document.getElementById('formLogAktivitas')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.innerText = "Menyimpan Laporan...";
  btn.disabled = true;

  const penugasanId = document.getElementById('select_debitur').value;
  const hasilTindakLanjut = document.getElementById('hasil_tindak_lanjut').value;
  const tglJanji = document.getElementById('tgl_janji').value;
  const catatan = document.getElementById('catatan').value;

  if (!penugasanId) {
    alert("❌ Pilih debitur terlebih dahulu!");
    btn.innerText = "Simpan Laporan";
    btn.disabled = false;
    return;
  }

  // Format catatan gabungan jika ada janji bayar
  const finalNotes = tglJanji ? `${catatan}\n[Janji Bayar: ${tglJanji}]` : catatan;

  try {
    // 1. Catat ke tabel Laporan (Interactions - pastikan lu punya tabel interactions di supabase lu atau kita bisa arahkan update status doang)
    
    // Karena ini versi simple, kita anggap kita mau UPDATE status di tabel penugasan_kolektor aja.
    const { error: updateError } = await supabase
        .from('penugasan_kolektor')
        .update({ status: hasilTindakLanjut })
        .eq('id', penugasanId);

    if (updateError) throw updateError;
    
    alert(`✅ Laporan aktivitas lapangan untuk kasus ini berhasil disimpan dengan status: ${hasilTindakLanjut}!`);
    e.target.reset();
    
    // Refresh daftar tugas biar yang udah selesai hilang (kalau misal di logic lu 'Lunas' itu bikin hilang)
    loadCollectorTasks(); 
    
  } catch (err) {
    alert("Gagal simpan laporan: " + err.message);
  } finally {
    btn.innerText = "Simpan Laporan";
    btn.disabled = false;
  }
});
