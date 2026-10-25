import { supabase } from './supabase.js';

// === STATE MANAGEMENT PAGINATION ===
let globalTasks = [];
let filteredTasks = []; 
let currentTaskPage = 1;
const tasksPerPage = 10;

// === PROTEKSI SESI ===
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
// 1. TARIK DATA PENUGASAN (PAGINATION)
// ==========================================
async function loadCollectorTasks() {
  const userId = localStorage.getItem('user_id');
  const taskList = document.getElementById('task-list');
  const pagWrapper = document.getElementById('pagination-wrapper');

  try {
    const { data: assignments, error: assignError } = await supabase
      .from('penugasan_kolektor')
      .select('*')
      .eq('collector_id', userId)
      .eq('status', 'Ditugaskan');

    if (assignError) throw assignError;

    if (!assignments || assignments.length === 0) {
      document.getElementById('badgeTugasCount').innerText = `0 Kasus`;
      taskList.innerHTML = `<div class="p-6 text-center text-slate-400 font-bold text-xs bg-white rounded-xl border border-slate-200">Semua tugas beres! Selamat istirahat. ☕</div>`;
      pagWrapper.classList.add('hidden');
      return;
    }

    let finalTasks = [];
    for (const task of assignments) {
       const { data: debiturDetail, error: detailError } = await supabase
         .from(task.sumber_tabel)
         .select('*')
         .eq('id', task.debitur_id)
         .single();
         
       if (!detailError && debiturDetail) {
          let dName = debiturDetail.name || '';
          if(task.sumber_tabel === 'excel_debitur' && debiturDetail.debitur) {
             const keyName = Object.keys(debiturDetail.debitur).find(k => k.toLowerCase().includes('nama'));
             if(keyName) dName = debiturDetail.debitur[keyName];
          }
          finalTasks.push({ ...task, detail_debitur: debiturDetail, search_name: String(dName).toLowerCase() });
       }
    }

    finalTasks.sort((a, b) => new Date(a.tenggat_waktu) - new Date(b.tenggat_waktu));

    globalTasks = finalTasks;
    filteredTasks = [...finalTasks];
    currentTaskPage = 1;
    
    renderTaskPage();

  } catch (err) {
    taskList.innerHTML = `<div class="p-6 text-center text-red-500 font-bold text-xs bg-white rounded-xl border border-slate-200">Error Load: ${err.message}</div>`;
  }
}

// ==========================================
// 2. RENDERING CARD DEBITUR
// ==========================================
window.prevTaskPage = function() {
  if (currentTaskPage > 1) { currentTaskPage--; renderTaskPage(); }
}

window.nextTaskPage = function() {
  const maxPage = Math.ceil(filteredTasks.length / tasksPerPage);
  if (currentTaskPage < maxPage) { currentTaskPage++; renderTaskPage(); }
}

window.filterLocalTasks = function() {
  const keyword = document.getElementById('searchClient').value.toLowerCase();
  filteredTasks = globalTasks.filter(t => 
      t.search_name.includes(keyword) || 
      (t.detail_debitur.client && t.detail_debitur.client.toLowerCase().includes(keyword)) ||
      (t.detail_debitur.kecamatan && t.detail_debitur.kecamatan.toLowerCase().includes(keyword))
  );
  currentTaskPage = 1;
  renderTaskPage();
}

function renderTaskPage() {
    const container = document.getElementById('task-list');
    const badgeCount = document.getElementById('badgeTugasCount');
    const pageInfo = document.getElementById('pageInfoTugas');
    const btnPrev = document.getElementById('btnPrevTugas');
    const btnNext = document.getElementById('btnNextTugas');
    const pagWrapper = document.getElementById('pagination-wrapper');

    const totalTasks = filteredTasks.length;
    badgeCount.innerText = `${totalTasks} KASUS`;

    if(totalTasks === 0) {
        container.innerHTML = `<div class="p-6 text-center text-slate-400 font-bold text-xs bg-white rounded-xl border border-slate-200">Tidak ada rute sesuai pencarian.</div>`;
        pagWrapper.classList.add('hidden');
        return;
    }

    pagWrapper.classList.remove('hidden');
    const maxPage = Math.ceil(totalTasks / tasksPerPage);
    const startIdx = (currentTaskPage - 1) * tasksPerPage;
    const endIdx = Math.min(startIdx + tasksPerPage, totalTasks);
    
    const paginatedData = filteredTasks.slice(startIdx, endIdx);

    pageInfo.innerText = `PG ${currentTaskPage} / ${maxPage}`;
    btnPrev.disabled = currentTaskPage === 1;
    btnNext.disabled = currentTaskPage === maxPage;

    container.innerHTML = paginatedData.map((task) => {
        const db = task.detail_debitur;
        
        let namaDebitur = db.name || 'Tanpa Nama';
        if(task.sumber_tabel === 'excel_debitur' && db.debitur) {
            const nameKey = Object.keys(db.debitur).find(k => k.toLowerCase().includes('nama') || k.toLowerCase().includes('name'));
            if(nameKey) namaDebitur = db.debitur[nameKey];
        }

        const contactInfo = task.sumber_tabel === 'excel_debitur' ? db.debitur : db.contact_info;
        const amountKey = Object.keys(contactInfo || {}).find(k => k.toLowerCase().includes('terutang') || k.toLowerCase().includes('amount'));
        const rawAmount = amountKey ? contactInfo[amountKey] : 0;
        const formatRp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(rawAmount);
        
        const waKey = Object.keys(contactInfo || {}).find(k => k.toLowerCase().includes('wa') || k.toLowerCase().includes('whatsapp'));
        const wa = waKey ? String(contactInfo[waKey]) : '';
        const linkWa = wa ? `https://wa.me/${wa.replace(/\D/g, '').replace(/^0/, '62')}` : '#';
        
        const arrLokasi = [db.kelurahan, db.kecamatan].filter(Boolean);
        const alamatSingkat = arrLokasi.length > 0 ? arrLokasi.join(', ') : 'Cek Detail Alamat';

        return `
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-widest border border-slate-200">
                        🏢 ${db.client || '-'}
                    </span>
                    <span class="text-[10px] font-black text-red-500 bg-red-50 px-2 py-0.5 rounded uppercase tracking-widest border border-red-100">
                        H+${Math.floor(Math.random() * 5) + 1}
                    </span>
                </div>
                
                <h3 class="font-black text-[#0B1B3D] text-sm uppercase leading-tight mb-0.5">${namaDebitur}</h3>
                
                <div class="flex justify-between items-center mt-2 border-t border-slate-100 pt-2 mb-3">
                    <div>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Total Tagihan</p>
                        <p class="text-[12px] font-black text-slate-700">${formatRp}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Area</p>
                        <p class="text-[10px] font-bold text-slate-600 truncate max-w-[120px]">${alamatSingkat}</p>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <div class="flex gap-2">
                        <a href="${linkWa}" target="_blank" class="w-10 h-10 bg-green-50 text-green-600 border border-green-200 rounded-lg flex items-center justify-center hover:bg-green-100 transition-colors shadow-sm">
                            <span class="text-lg leading-none pt-0.5">📞</span>
                        </a>
                        <button onclick="alert('ALAMAT LENGKAP:\\n\\n${db.alamat_lengkap || '-'}\\nKel: ${db.kelurahan || '-'}\\nKec: ${db.kecamatan || '-'}\\nKode Pos: ${db.kodepos || '-'}')" class="w-10 h-10 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg flex items-center justify-center hover:bg-blue-100 transition-colors shadow-sm">
                            <span class="text-lg leading-none pt-0.5">📍</span>
                        </button>
                    </div>
                    
                    <button onclick="openModalEksekusi('${task.id}', '${namaDebitur.replace(/'/g, "\\'")}')" class="bg-[#E65C00] hover:bg-orange-600 text-white text-[11px] font-black rounded-lg uppercase tracking-widest transition-all active:scale-95 shadow-sm border border-orange-700 w-full">
                        Eksekusi ⚡
                    </button>
                </div>
            </div>
        `;
    }).join('');
}


// ==========================================
// 3. LOGIKA MODAL & UPLOAD BUKTI FOTO
// ==========================================
window.openModalEksekusi = function(penugasanId, nama) {
    document.getElementById('hidden_penugasan_id').value = penugasanId;
    document.getElementById('modalDebiturName').innerText = nama;
    document.getElementById('modalEksekusi').classList.remove('hidden');
    document.body.style.overflow = 'hidden'; 
}

window.closeModalEksekusi = function() {
    document.getElementById('modalEksekusi').classList.add('hidden');
    document.getElementById('formLogAktivitas').reset(); 
    document.getElementById('labelFoto').innerText = 'Ketuk untuk Ambil Foto (Kamera)';
    document.getElementById('wrapper_janji_bayar').style.display = 'block'; 
    document.body.style.overflow = 'auto'; 
}

window.previewFileName = function(input) {
    if(input.files && input.files[0]) {
        document.getElementById('labelFoto').innerHTML = `<span class="text-green-600 font-black">✅ FOTO TERSIMPAN</span><br><span class="text-[9px]">${input.files[0].name}</span>`;
    }
}

window.toggleJanjiBayar = function() {
    const val = document.getElementById('hasil_tindak_lanjut').value;
    const wrapDate = document.getElementById('wrapper_janji_bayar');
    if(val.includes('Janji') || val.includes('Cicil')) {
        wrapDate.style.display = 'block';
    } else {
        wrapDate.style.display = 'none';
        document.getElementById('tgl_janji').value = ''; 
    }
}

// === UPLOAD KE STORAGE & UPDATE 1 TABEL ===
document.getElementById('formLogAktivitas')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitLog');
    
    const penugasanId = document.getElementById('hidden_penugasan_id').value;
    const statusVal = document.getElementById('hasil_tindak_lanjut').value;
    const tglJanjiVal = document.getElementById('tgl_janji').value;
    const catatanVal = document.getElementById('catatan').value;
    const fileBukti = document.getElementById('foto_bukti').files[0]; 

    if(!fileBukti) {
        alert("❌ WAJIB MENGAMBIL FOTO BUKTI LOKASI!");
        return;
    }

    btn.innerHTML = "⏳ MENGUNGGAH BUKTI FOTO...";
    btn.disabled = true;

    try {
        const fileExt = fileBukti.name.split('.').pop();
        const fileName = `bukti_${penugasanId}_${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('bukti_kunjungan')
            .upload(fileName, fileBukti, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw new Error("Gagal upload foto: " + uploadError.message);

        const { data: { publicUrl } } = supabase.storage
            .from('bukti_kunjungan')
            .getPublicUrl(fileName);

        btn.innerHTML = "⏳ MEMPROSES DATABASE...";

        // Update SEMUA data ke dalam 1 Tabel (penugasan_kolektor)
        const { error: updateError } = await supabase
            .from('penugasan_kolektor')
            .update({ 
                status: statusVal, 
                foto_url: publicUrl,
                catatan_lapangan: catatanVal,
                tanggal_janji_bayar: tglJanjiVal || null
            })
            .eq('id', penugasanId);

        if (updateError) throw updateError;
        
        alert(`✅ MANTAP! Kasus terselesaikan (Status: ${statusVal}).`);
        closeModalEksekusi();
        loadCollectorTasks(); 
        
    } catch (err) {
        alert("❌ Gagal menyelesaikan tugas: " + err.message);
    } finally {
        btn.innerHTML = "🚀 SIMPAN & SELESAIKAN TUGAS";
        btn.disabled = false;
    }
});