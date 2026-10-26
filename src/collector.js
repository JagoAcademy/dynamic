import { supabase } from './supabase.js';

// === STATE MANAGEMENT ===
let globalTasks = [];
let filteredTasks = []; 
let currentTaskPage = 1;
const tasksPerPage = 12; // Dibuat genap agar rapi di Desktop (grid-cols-2 atau grid-cols-3)

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
// 1. TARIK DATA (SEMUA STATUS UNTUK HISTORY)
// ==========================================
async function loadCollectorTasks() {
  const userId = localStorage.getItem('user_id');
  const taskList = document.getElementById('task-list');
  const pagWrapper = document.getElementById('pagination-wrapper');

  try {
    // KUNCI: Buang filter .eq('status', 'Ditugaskan') agar SEMUA tugas tampil
    const { data: assignments, error: assignError } = await supabase
      .from('penugasan_kolektor')
      .select('*')
      .eq('collector_id', userId);

    if (assignError) throw assignError;

    if (!assignments || assignments.length === 0) {
      document.getElementById('badgeTugasCount').innerText = `0 Kasus`;
      taskList.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 font-bold text-sm bg-white rounded-2xl border border-slate-200">Belum ada tugas penagihan untuk Anda.</div>`;
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

    // SORTING: Yang "Ditugaskan" (Belum disentuh) taruh di paling atas, sisanya turun.
    finalTasks.sort((a, b) => {
        if (a.status === 'Ditugaskan' && b.status !== 'Ditugaskan') return -1;
        if (a.status !== 'Ditugaskan' && b.status === 'Ditugaskan') return 1;
        return new Date(a.tenggat_waktu) - new Date(b.tenggat_waktu);
    });

    globalTasks = finalTasks;
    filteredTasks = [...finalTasks];
    currentTaskPage = 1;
    
    renderTaskPage();

  } catch (err) {
    taskList.innerHTML = `<div class="col-span-full p-8 text-center text-red-500 font-bold text-sm bg-white rounded-2xl border border-slate-200">Error Load: ${err.message}</div>`;
  }
}

// ==========================================
// PEMBERIAN WARNA STATUS (BADGE)
// ==========================================
function getStatusBadge(status) {
    if (!status || status === 'Ditugaskan') {
        return `<span class="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-widest border border-slate-200">⏳ Belum Dikerjakan</span>`;
    }
    if (status.includes('Janji')) {
        return `<span class="text-[10px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded uppercase tracking-widest border border-orange-200">📅 Janji Bayar</span>`;
    }
    if (status.includes('Sebagian')) {
        return `<span class="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-widest border border-blue-200">💸 Bayar Sebagian</span>`;
    }
    if (status.includes('Lunas')) {
        return `<span class="text-[10px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded uppercase tracking-widest border border-green-200">✅ LUNAS</span>`;
    }
    // Sisanya (Rumah Kosong, Menolak, Fiktif) = Merah Invalid
    return `<span class="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded uppercase tracking-widest border border-red-200">❌ ${status}</span>`;
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
      (t.detail_debitur.kecamatan && t.detail_debitur.kecamatan.toLowerCase().includes(keyword)) ||
      (t.status && t.status.toLowerCase().includes(keyword))
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
        container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 font-bold text-sm bg-white rounded-2xl border border-slate-200">Tidak ada rute sesuai pencarian.</div>`;
        pagWrapper.classList.add('hidden');
        return;
    }

    pagWrapper.classList.remove('hidden');
    const maxPage = Math.ceil(totalTasks / tasksPerPage);
    const startIdx = (currentTaskPage - 1) * tasksPerPage;
    const endIdx = Math.min(startIdx + tasksPerPage, totalTasks);
    
    const paginatedData = filteredTasks.slice(startIdx, endIdx);

    pageInfo.innerText = `HALAMAN ${currentTaskPage} DARI ${maxPage}`;
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
        
        const amountKey = Object.keys(contactInfo || {}).find(k => k.toLowerCase().includes('terutang') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('tagihan'));
        const rawAmount = amountKey ? contactInfo[amountKey] : 0;
        const formatRp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(String(rawAmount).replace(/\D/g, ''));
        
        const waKey = Object.keys(contactInfo || {}).find(k => k.toLowerCase().includes('wa') || k.toLowerCase().includes('whatsapp') || k.toLowerCase().includes('telepon'));
        const wa = waKey ? String(contactInfo[waKey]) : '';
        const linkWa = wa ? `https://wa.me/${wa.replace(/\D/g, '').replace(/^0/, '62')}` : '#';
        
        const arrLokasi = [db.kelurahan, db.kecamatan].filter(Boolean);
        const alamatSingkat = arrLokasi.length > 0 ? arrLokasi.join(', ') : 'Cek Detail Alamat';

        const jsonStringInfo = encodeURIComponent(JSON.stringify(contactInfo || {}));
        const safeAlamatLengkap = db.alamat_lengkap ? db.alamat_lengkap.replace(/'/g, "\\'") : '-';

        const badgeStatus = getStatusBadge(task.status);
        
        // Ubah tombol eksekusi kalau sudah dikerjakan
        const isDikerjakan = task.status !== 'Ditugaskan';
        const btnText = isDikerjakan ? 'Edit ✏️' : 'Eksekusi ⚡';
        const btnStyle = isDikerjakan 
            ? 'bg-slate-700 hover:bg-slate-800 border-slate-800' 
            : 'bg-[#E65C00] hover:bg-orange-600 border-orange-700';

        return `
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-[0_2px_15px_-4px_rgba(0,0,0,0.05)] flex flex-col h-full hover:border-orange-300 transition-colors">
                <div class="flex justify-between items-start mb-3">
                    <span class="text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-widest border border-slate-200">
                        🏢 ${db.client || '-'}
                    </span>
                    ${badgeStatus}
                </div>
                
                <h3 class="font-black text-[#0B1B3D] text-[15px] uppercase leading-tight mb-1">${namaDebitur}</h3>
                
                <div class="flex justify-between items-center mt-3 border-t border-slate-100 pt-3 mb-4 flex-1">
                    <div>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Total Tagihan</p>
                        <p class="text-[13px] font-black text-slate-700">${formatRp}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Area</p>
                        <p class="text-[11px] font-bold text-slate-600 truncate max-w-[120px]">${alamatSingkat}</p>
                    </div>
                </div>

                <!-- Tombol Aksi Bawah Card -->
                <div class="grid grid-cols-4 gap-2 mt-auto">
                    <button onclick="openModalDetail('${namaDebitur.replace(/'/g, "\\'")}', '${safeAlamatLengkap}', '${jsonStringInfo}')" class="col-span-2 bg-slate-100 text-slate-600 text-[10px] font-black rounded-xl uppercase tracking-widest hover:bg-slate-200 transition-all border border-slate-200 w-full py-3 shadow-sm">
                        🔍 Rincian
                    </button>
                    <a href="${linkWa}" target="_blank" class="col-span-1 bg-green-50 text-green-600 border border-green-200 rounded-xl flex items-center justify-center hover:bg-green-100 transition-colors shadow-sm">
                        <span class="text-xl leading-none pt-0.5">📞</span>
                    </a>
                    <button onclick="openModalEksekusi('${task.id}', '${namaDebitur.replace(/'/g, "\\'")}')" class="col-span-1 text-white rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm border w-full ${btnStyle}">
                        <span class="text-sm font-bold pt-0.5 text-white">${btnText}</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}


// ==========================================
// 3. LOGIKA MODAL RINCIAN (BONGKAR JSON)
// ==========================================
window.openModalDetail = function(nama, alamat, jsonStrEncoded) {
    const infoData = JSON.parse(decodeURIComponent(jsonStrEncoded));
    
    document.getElementById('detail_nama').innerText = nama;
    document.getElementById('detail_alamat').innerText = alamat;
    
    const listContainer = document.getElementById('detail_json_list');
    listContainer.innerHTML = '';
    
    for (const [key, value] of Object.entries(infoData)) {
        if(key.toLowerCase().includes('nama') || key.toLowerCase().includes('alamat')) continue;
        
        const cleanKey = key.replace(/_/g, ' ').toUpperCase();
        const cleanValue = value ? value : '-';

        listContainer.innerHTML += `
            <div class="flex justify-between py-3 border-b border-slate-200 last:border-0 items-center hover:bg-white px-2 rounded-lg transition-colors">
                <span class="text-[10px] font-bold text-slate-400 w-1/3 break-words pr-2">${cleanKey}</span>
                <span class="text-xs font-black text-slate-700 w-2/3 text-right break-words">${cleanValue}</span>
            </div>
        `;
    }
    
    document.getElementById('modalDetailData').classList.remove('hidden');
    document.getElementById('modalDetailData').classList.add('flex');
    document.body.style.overflow = 'hidden'; 
}

window.closeModalDetail = function() {
    document.getElementById('modalDetailData').classList.add('hidden');
    document.getElementById('modalDetailData').classList.remove('flex');
    document.body.style.overflow = 'auto'; 
}


// ==========================================
// 4. LOGIKA MODAL EKSEKUSI & UPLOAD BUKTI FOTO
// ==========================================
window.openModalEksekusi = function(penugasanId, nama) {
    document.getElementById('hidden_penugasan_id').value = penugasanId;
    document.getElementById('modalDebiturName').innerText = nama;
    document.getElementById('modalEksekusi').classList.remove('hidden');
    document.getElementById('modalEksekusi').classList.add('flex');
    document.body.style.overflow = 'hidden'; 
}

window.closeModalEksekusi = function() {
    document.getElementById('modalEksekusi').classList.add('hidden');
    document.getElementById('modalEksekusi').classList.remove('flex');
    document.getElementById('formLogAktivitas').reset(); 
    document.getElementById('labelFoto').innerText = 'Ketuk untuk Ambil Foto';
    document.getElementById('wrapper_janji_bayar').style.display = 'block'; 
    document.body.style.overflow = 'auto'; 
}

window.previewFileName = function(input) {
    if(input.files && input.files[0]) {
        document.getElementById('labelFoto').innerHTML = `<span class="text-green-600 font-black">✅ FOTO TERSIMPAN</span><br><span class="text-[9px] mt-1 text-slate-500">${input.files[0].name}</span>`;
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

// === SUBMIT KE SUPABASE STORAGE & DATABASE ===
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

    btn.innerHTML = "⏳ MENGUNGGAH FOTO...";
    btn.disabled = true;

    try {
        const fileExt = fileBukti.name.split('.').pop();
        const fileName = `bukti_${penugasanId}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
            .from('bukti_kunjungan')
            .upload(fileName, fileBukti, { cacheControl: '3600', upsert: false });

        if (uploadError) throw new Error("Gagal upload foto: " + uploadError.message);

        const { data: { publicUrl } } = supabase.storage.from('bukti_kunjungan').getPublicUrl(fileName);

        btn.innerHTML = "⏳ MENYIMPAN DATA...";

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
        
        alert(`✅ MANTAP! Laporan terkirim (Status: ${statusVal}).`);
        closeModalEksekusi();
        loadCollectorTasks(); // Reload List agar warnanya langsung berubah
        
    } catch (err) {
        alert("❌ Gagal mengirim laporan: " + err.message);
    } finally {
        btn.innerHTML = "🚀 SIMPAN & SELESAIKAN";
        btn.disabled = false;
    }
});