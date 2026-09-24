import { supabase } from './supabase.js';

// === STATE MANAGEMENT PAGINATION ===
let globalTasks = [];
let currentTaskPage = 1;
const tasksPerPage = 10;

// Cek Sesi
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

// ==========================================
// TARIK DATA DARI DATABASE (SEKALI SAJA)
// ==========================================
async function loadCollectorTasks() {
  const userId = localStorage.getItem('user_id');
  const taskList = document.getElementById('task-list');

  try {
    // 1. Tarik riwayat penugasan yang masih 'Ditugaskan' untuk Kolektor ini
    const { data: assignments, error: assignError } = await supabase
      .from('penugasan_kolektor')
      .select('*')
      .eq('collector_id', userId)
      .eq('status', 'Ditugaskan');

    if (assignError) throw assignError;

    if (!assignments || assignments.length === 0) {
      document.getElementById('badgeTugasCount').innerText = `0 AKTIF`;
      document.getElementById('select_debitur').innerHTML = `<option value="">Tidak ada tugas aktif.</option>`;
      taskList.innerHTML = `<div class="p-8 text-center text-slate-400 font-bold text-xs bg-white">Belum ada tugas penagihan aktif hari ini. Selamat ngopi! ☕</div>`;
      
      // Matikan tombol pagination
      document.getElementById('btnPrevTugas').disabled = true;
      document.getElementById('btnNextTugas').disabled = true;
      return;
    }

    // 2. Fetch detailnya satu per satu dari tabel sumber
    let finalTasks = [];
    for (const task of assignments) {
       const { data: debiturDetail, error: detailError } = await supabase
         .from(task.sumber_tabel)
         .select('*')
         .eq('id', task.debitur_id)
         .single();
         
       if (!detailError && debiturDetail) {
          finalTasks.push({ ...task, detail_debitur: debiturDetail });
       }
    }

    // Sortir biar yang tenggat waktunya paling mepet/expired tampil paling atas
    finalTasks.sort((a, b) => new Date(a.tenggat_waktu) - new Date(b.tenggat_waktu));

    // Simpan ke State Global
    globalTasks = finalTasks;
    currentTaskPage = 1;
    
    // Siapkan Dropdown
    populateDropdown();
    
    // Render Halaman 1
    renderTaskPage();

  } catch (err) {
    taskList.innerHTML = `<div class="p-8 text-center text-red-500 font-bold text-xs bg-white">Gagal memuat tugas: ${err.message}</div>`;
  }
}

// Bikin isi Dropdown Form
function populateDropdown() {
    const selectDebitur = document.getElementById('select_debitur');
    selectDebitur.innerHTML = `<option value="">-- Pilih Debitur / Kasus yang Ditangani --</option>` + globalTasks.map(task => {
      let n = task.detail_debitur.name;
      if(task.sumber_tabel === 'excel_debitur') {
         const k = Object.keys(task.detail_debitur.debitur).find(key => key.toLowerCase().includes('nama'));
         n = k ? task.detail_debitur.debitur[k] : 'Tanpa Nama';
      }
      return `<option value="${task.id}">${n} - (${task.detail_debitur.client})</option>`;
    }).join('');
}


// ==========================================
// LOGIKA PAGINATION & RENDERING (ALA F1 SWIMMING)
// ==========================================
window.prevTaskPage = function() {
  if (currentTaskPage > 1) {
    currentTaskPage--;
    renderTaskPage();
  }
}

window.nextTaskPage = function() {
  const maxPage = Math.ceil(globalTasks.length / tasksPerPage);
  if (currentTaskPage < maxPage) {
    currentTaskPage++;
    renderTaskPage();
  }
}

function renderTaskPage() {
    const container = document.getElementById('task-list');
    const badgeCount = document.getElementById('badgeTugasCount');
    const pageInfo = document.getElementById('pageInfoTugas');
    const btnPrev = document.getElementById('btnPrevTugas');
    const btnNext = document.getElementById('btnNextTugas');

    const totalTasks = globalTasks.length;
    badgeCount.innerText = `${totalTasks} AKTIF`;

    const maxPage = Math.ceil(totalTasks / tasksPerPage);
    const startIdx = (currentTaskPage - 1) * tasksPerPage;
    const endIdx = Math.min(startIdx + tasksPerPage, totalTasks);
    
    const paginatedData = globalTasks.slice(startIdx, endIdx);

    pageInfo.innerText = `HALAMAN ${currentTaskPage} DARI ${maxPage}`;
    btnPrev.disabled = currentTaskPage === 1;
    btnNext.disabled = currentTaskPage === maxPage;

    container.innerHTML = paginatedData.map((task, index) => {
        const db = task.detail_debitur;
        
        // 1. Ekstrak Nama
        let namaDebitur = db.name || 'Debitur Tidak Diketahui';
        if(task.sumber_tabel === 'excel_debitur' && db.debitur) {
            const nameKey = Object.keys(db.debitur).find(k => k.toLowerCase().includes('nama') || k.toLowerCase().includes('name'));
            if(nameKey) namaDebitur = db.debitur[nameKey];
        }

        // 2. Ekstrak Tagihan
        const contactInfo = task.sumber_tabel === 'excel_debitur' ? db.debitur : db.contact_info;
        const amountKey = Object.keys(contactInfo || {}).find(k => k.toLowerCase().includes('terutang') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('tagihan'));
        const rawAmount = amountKey ? contactInfo[amountKey] : 0;
        const formatRp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(rawAmount);
        
        // 3. Ekstrak WA
        const waKey = Object.keys(contactInfo || {}).find(k => k.toLowerCase().includes('wa') || k.toLowerCase().includes('whatsapp') || k.toLowerCase().includes('telp'));
        const wa = waKey ? String(contactInfo[waKey]) : '';
        const linkWa = wa ? `https://wa.me/${wa.replace(/\D/g, '').replace(/^0/, '62')}` : '#';
        
        // 4. Susun Alamat Ringkas
        const arrLokasi = [db.kelurahan, db.kecamatan].filter(Boolean);
        const alamatSingkat = arrLokasi.length > 0 ? arrLokasi.join(', ') : 'Lihat Detail';

        // 5. KALKULASI SISA WAKTU (EXPIRED LOGIC)
        const hariIni = new Date();
        // Set waktu hariIni ke jam 00:00 biar adil ngitung harinya
        hariIni.setHours(0,0,0,0); 
        
        const tenggat = new Date(task.tenggat_waktu);
        tenggat.setHours(0,0,0,0);
        
        const selisihWaktu = tenggat.getTime() - hariIni.getTime();
        const selisihHari = Math.ceil(selisihWaktu / (1000 * 3600 * 24));
        
        let statusWaktuBadge = '';
        if (selisihHari < 0) {
            // Telat / Expired (Warna Merah F1)
            statusWaktuBadge = `<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-red-200">EXPIRED (LEWAT ${Math.abs(selisihHari)} HARI)</span>`;
        } else if (selisihHari <= 2) {
            // Mepet (Warna Kuning/Amber F1)
            statusWaktuBadge = `<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-amber-200">MEPET (SISA ${selisihHari} HARI)</span>`;
        } else {
            // Masih Aman (Warna Hijau/Emerald F1)
            statusWaktuBadge = `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border border-emerald-200">SISA ${selisihHari} HARI</span>`;
        }

        // Tampilan Rapat & Responsif ala SCS / F1
        return `
            <div class="p-4 hover:bg-slate-50 transition-colors flex flex-col gap-2">
                <!-- Baris Atas: Badge Klien & Timer -->
                <div class="flex justify-between items-center">
                    <span class="text-[9px] font-black text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase tracking-widest">
                        🏢 ${db.client || '-'}
                    </span>
                    ${statusWaktuBadge}
                </div>
                
                <!-- Baris Tengah: Info Utama -->
                <div class="mt-1">
                    <h3 class="font-black text-slate-800 text-[14px] uppercase leading-tight">${namaDebitur}</h3>
                    <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1">
                        <span class="text-[11px] font-extrabold text-red-500">💰 ${formatRp}</span>
                        <span class="hidden sm:block text-slate-300 text-xs">•</span>
                        <span class="text-[10px] font-bold text-slate-500">📍 ${alamatSingkat}</span>
                    </div>
                    <p class="text-[9px] font-bold text-slate-400 mt-1.5 uppercase tracking-widest">
                        DITUGASKAN: ${task.tanggal_diberikan}
                    </p>
                </div>

                <!-- Baris Bawah: Tombol Aksi Rapat -->
                <div class="flex gap-2 mt-2">
                    <a href="${linkWa}" target="_blank" class="flex-1 bg-green-50 text-green-600 border border-green-200 hover:bg-green-500 hover:text-white transition-colors text-[10px] font-black py-2 rounded-lg text-center uppercase tracking-widest shadow-sm">
                        📞 Chat WA
                    </a>
                    <button class="flex-1 bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-600 hover:text-white transition-colors text-[10px] font-black py-2 rounded-lg text-center uppercase tracking-widest shadow-sm" 
                            onclick="alert('DETAIL ALAMAT:\\n\\n${db.alamat_lengkap || '-'}\\nKel: ${db.kelurahan || '-'}\\nKec: ${db.kecamatan || '-'}\\nKota: ${db.kota_kabupaten || '-'}\\nKode Pos: ${db.kodepos || '-'}')">
                        📍 Alamat
                    </button>
                </div>
            </div>
        `;
    }).join('');
}


// ==========================================
// SUBMIT LAPORAN (Tombol Biru)
// ==========================================
document.getElementById('btnSubmitLog')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btnSubmitLog');
  btn.innerHTML = "⏳ MENYIMPAN...";
  btn.disabled = true;

  const penugasanId = document.getElementById('select_debitur').value;
  const hasilTindakLanjut = document.getElementById('hasil_tindak_lanjut').value;
  const tglJanji = document.getElementById('tgl_janji').value;
  const catatan = document.getElementById('catatan').value;

  if (!penugasanId) {
    alert("❌ Pilih debitur terlebih dahulu di form dropdown atas!");
    btn.innerHTML = "🚀 Simpan Hasil Penagihan";
    btn.disabled = false;
    return;
  }

  // Format catatan kalau ada janji bayar
  const finalNotes = tglJanji ? `${catatan}\n[Janji Bayar: ${tglJanji}]` : catatan;

  try {
    // Update status di tabel penugasan (Kapan-kapan lu bisa bikin tabel 'interactions' biar ada log riwayatnya)
    const { error: updateError } = await supabase
        .from('penugasan_kolektor')
        .update({ status: hasilTindakLanjut })
        .eq('id', penugasanId);

    if (updateError) throw updateError;
    
    alert(`✅ MANTAP! Laporan tersimpan dengan status: ${hasilTindakLanjut}!`);
    document.getElementById('formLogAktivitas').reset();
    document.getElementById('catatan').value = '';
    
    // Refresh otomatis list biar kasus yang udah dieksekusi hilang dari layar
    loadCollectorTasks(); 
    
  } catch (err) {
    alert("❌ Gagal simpan laporan: " + err.message);
  } finally {
    btn.innerHTML = "🚀 Simpan Hasil Penagihan";
    btn.disabled = false;
  }
});
