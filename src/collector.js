import { supabase } from './supabase.js';

// === STATE MANAGEMENT ===
let globalTasks = [];
let filteredTasks = []; 
let currentTaskPage = 1;
const tasksPerPage = 12;

// Cek Sesi Login
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
// 1. TARIK DATA DARI SUPABASE
// ==========================================
async function loadCollectorTasks() {
    const userId = localStorage.getItem('user_id');
    const taskList = document.getElementById('task-list');
    const pagWrapper = document.getElementById('pagination-wrapper');

    try {
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
                
                if (task.sumber_tabel === 'excel_debitur' && debiturDetail.debitur) {
                    const keyName = Object.keys(debiturDetail.debitur).find(k => k.toLowerCase().includes('nama'));
                    if(keyName) {
                        dName = debiturDetail.debitur[keyName];
                    }
                }
                
                finalTasks.push({ 
                    ...task, 
                    detail_debitur: debiturDetail, 
                    search_name: String(dName).toLowerCase() 
                });
            }
        }

        // Sorting: Tugas yang belum dikerjakan ("Ditugaskan") muncul paling atas
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
// FUNGSI PEMBANTU (BADGE STATUS)
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
    
    return `<span class="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded uppercase tracking-widest border border-red-200">❌ ${status}</span>`;
}

// ==========================================
// 2. PAGINATION & RENDER KARTU TUGAS
// ==========================================
window.prevTaskPage = function() {
    if (currentTaskPage > 1) { 
        currentTaskPage--; 
        renderTaskPage(); 
    }
}

window.nextTaskPage = function() {
    const maxPage = Math.ceil(filteredTasks.length / tasksPerPage);
    if (currentTaskPage < maxPage) { 
        currentTaskPage++; 
        renderTaskPage(); 
    }
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

    if (totalTasks === 0) {
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
        
        if (task.sumber_tabel === 'excel_debitur' && db.debitur) {
            const nameKey = Object.keys(db.debitur).find(k => k.toLowerCase().includes('nama') || k.toLowerCase().includes('name'));
            if(nameKey) {
                namaDebitur = db.debitur[nameKey];
            }
        }

        const contactInfo = task.sumber_tabel === 'excel_debitur' ? db.debitur : db.contact_info;
        
        const amountKey = Object.keys(contactInfo || {}).find(k => k.toLowerCase().includes('terutang') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('tagihan'));
        const rawAmount = amountKey ? contactInfo[amountKey] : 0;
        const formatRp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(String(rawAmount).replace(/\D/g, ''));
        
        const waKey = Object.keys(contactInfo || {}).find(k => k.toLowerCase().includes('wa') || k.toLowerCase().includes('whatsapp') || k.toLowerCase().includes('telepon') || k.toLowerCase().includes('hp'));
        const wa = waKey ? String(contactInfo[waKey]) : '';
        const linkWa = wa ? `https://wa.me/${wa.replace(/\D/g, '').replace(/^0/, '62')}` : '#';
        
        const arrLokasi = [db.kelurahan, db.kecamatan].filter(Boolean);
        const alamatSingkat = arrLokasi.length > 0 ? arrLokasi.join(', ') : 'Cek Detail Alamat';

        const jsonStringInfo = encodeURIComponent(JSON.stringify(contactInfo || {}));
        const safeAlamatLengkap = db.alamat_lengkap ? db.alamat_lengkap.replace(/'/g, "\\'") : '-';

        const badgeStatus = getStatusBadge(task.status);
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
// 3. LOGIKA MODAL RINCIAN (BONGKAR JSON & MAPS)
// ==========================================
window.openModalDetail = function(nama, alamat, jsonStrEncoded) {
    const infoData = JSON.parse(decodeURIComponent(jsonStrEncoded));
    
    document.getElementById('detail_nama').innerText = nama;
    document.getElementById('detail_alamat').innerText = alamat;
    
    // UPDATE GOOGLE MAPS LINK OTOMATIS
    const queryMaps = alamat !== '-' ? alamat : (nama + ' ' + (infoData.KECAMATAN || ''));
    document.getElementById('btn_maps_link').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryMaps)}`;

    const listContainer = document.getElementById('detail_json_list');
    
    let htmlTagihan = ''; 
    let htmlPribadi = ''; 
    let htmlLainnya = '';
    
    for (const [key, value] of Object.entries(infoData)) {
        const lowerKey = key.toLowerCase();
        
        // Lewati data yang sudah ada di Header
        if (lowerKey === 'nama' || lowerKey === 'name' || lowerKey === 'alamat lengkap' || lowerKey === 'alamat' || lowerKey === '_sumber') continue;
        
        const cleanKey = key.replace(/_/g, ' ').toUpperCase(); 
        let cleanValue = value ? value : '-';

        // Format angka jadi Rupiah jika terdeteksi kolom Uang
        if ((lowerKey.includes('amount') || lowerKey.includes('principal') || lowerKey.includes('terutang') || lowerKey.includes('limit') || lowerKey.includes('installment')) && !isNaN(String(cleanValue).replace(/\D/g, ''))) {
            const numOnly = String(cleanValue).replace(/\D/g, '');
            if(numOnly.length > 0) {
                cleanValue = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(numOnly);
            }
        }

        const rowHtml = `
            <div class="flex justify-between py-2.5 border-b border-slate-100 last:border-0 items-center hover:bg-slate-50 transition-colors px-1">
                <span class="text-[10px] font-bold text-slate-400 w-[45%] break-words pr-2 leading-tight">${cleanKey}</span>
                <span class="text-[11px] font-black text-slate-700 w-[55%] text-right break-words leading-tight">${cleanValue}</span>
            </div>
        `;
        
        // Pengelompokan Kategori
        if (lowerKey.match(/dpd|os|amount|principal|terutang|tagihan|limit|tenor|lpa|installment|byr|bayar|loan/)) { 
            htmlTagihan += rowHtml; 
        } else if (lowerKey.match(/lahir|agama|pekerjaan|gender|mother|ibu|sttus/)) { 
            htmlPribadi += rowHtml; 
        } else { 
            htmlLainnya += rowHtml; 
        }
    }
    
    listContainer.innerHTML = `
        ${htmlTagihan ? `<div class="mb-5 bg-red-50/30 p-2 rounded-xl border border-red-50"><div class="flex items-center gap-2 mb-2 pb-1 border-b border-red-100"><span class="text-sm">💰</span><p class="text-[10px] font-black text-red-600 uppercase tracking-widest">Detail Keuangan</p></div>${htmlTagihan}</div>` : ''}
        ${htmlPribadi ? `<div class="mb-5 bg-blue-50/30 p-2 rounded-xl border border-blue-50"><div class="flex items-center gap-2 mb-2 pb-1 border-b border-blue-100"><span class="text-sm">👤</span><p class="text-[10px] font-black text-blue-600 uppercase tracking-widest">Profil Pribadi</p></div>${htmlPribadi}</div>` : ''}
        ${htmlLainnya ? `<div class="mb-2 p-2"><div class="flex items-center gap-2 mb-2 pb-1 border-b border-slate-200"><span class="text-sm">📝</span><p class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Kontak & Keterangan</p></div>${htmlLainnya}</div>` : ''}
    `;
    
    const paramTitle = listContainer.previousElementSibling; 
    if(paramTitle && paramTitle.tagName.toLowerCase() === 'p') {
        paramTitle.style.display = 'none';
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
// 4. LOGIKA MODAL EKSEKUSI TUGAS
// ==========================================

// Fungsi Auto-Ketik Format Rupiah
window.formatRupiahInput = function(input) {
    let val = input.value.replace(/\D/g, '');
    if (val !== '') { 
        val = new Intl.NumberFormat('id-ID').format(val); 
    }
    input.value = val;
}

window.openModalEksekusi = function(penugasanId, nama) {
    document.getElementById('hidden_penugasan_id').value = penugasanId; 
    document.getElementById('modalDebiturName').innerText = nama;
    
    // SETUP TANGGAL & WAKTU EKSEKUSI (Format: 24 Okt 2023, 14:30)
    const now = new Date(); 
    const options = { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    document.getElementById('waktu_eksekusi').value = now.toLocaleDateString('id-ID', options).replace(/\./g, ':');

    document.getElementById('modalEksekusi').classList.remove('hidden'); 
    document.getElementById('modalEksekusi').classList.add('flex'); 
    document.body.style.overflow = 'hidden'; 
    
    toggleJanjiBayar(); // Reset UI state saat dibuka
}

window.closeModalEksekusi = function() {
    document.getElementById('modalEksekusi').classList.add('hidden'); 
    document.getElementById('modalEksekusi').classList.remove('flex');
    
    document.getElementById('formLogAktivitas').reset(); 
    document.getElementById('labelFoto').innerHTML = 'Buka Kamera<br>Atau Upload Bukti Bayar'; 
    document.body.style.overflow = 'auto'; 
}

// Munculkan nama file saat user berhasil upload foto/screenshot
window.previewFileName = function(input) {
    if(input.files && input.files[0]) { 
        document.getElementById('labelFoto').innerHTML = `<span class="text-green-600 font-black">✅ FOTO / BUKTI SIAP</span><br><span class="text-[9px] mt-1 text-slate-500">${input.files[0].name}</span>`; 
    }
}

// Logika Hide/Show Input Janji Bayar & Nominal Uang
window.toggleJanjiBayar = function() {
    const val = document.getElementById('hasil_tindak_lanjut').value; 
    const wrapDate = document.getElementById('wrapper_janji_bayar'); 
    const wrapNominal = document.getElementById('wrapper_nominal');
    
    // Munculkan Tanggal Janji jika PTP / Cicil
    if(val.includes('Janji') || val.includes('Cicil')) { 
        wrapDate.style.display = 'block'; 
    } else { 
        wrapDate.style.display = 'none'; 
        document.getElementById('tgl_janji').value = ''; 
    }

    // Munculkan Input Nominal Uang jika ada transaksi (Janji, Cicil, Lunas)
    if(val.includes('Janji') || val.includes('Sebagian') || val.includes('Lunas') || val.includes('Cicil')) { 
        wrapNominal.style.display = 'block'; 
    } else { 
        wrapNominal.style.display = 'none'; 
        document.getElementById('nominal_bayar').value = ''; 
    }
}

// ==========================================
// 5. PROSES UPLOAD & SIMPAN DATABASE
// ==========================================
document.getElementById('formLogAktivitas')?.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    const btn = document.getElementById('btnSubmitLog');
    const penugasanId = document.getElementById('hidden_penugasan_id').value; 
    const statusVal = document.getElementById('hasil_tindak_lanjut').value; 
    const tglJanjiVal = document.getElementById('tgl_janji').value; 
    const catatanVal = document.getElementById('catatan').value; 
    const waktuVal = document.getElementById('waktu_eksekusi').value;
    
    // Bersihkan titik Rupiah, ubah jadi integer murni
    const nominalRaw = document.getElementById('nominal_bayar').value.replace(/\D/g, ''); 
    const nominalVal = nominalRaw ? parseInt(nominalRaw) : null;
    
    const fileBukti = document.getElementById('foto_bukti').files[0]; 

    if(!fileBukti) { 
        alert("❌ WAJIB MENGAMBIL FOTO / UPLOAD BUKTI LOKASI!"); 
        return; 
    }
    
    btn.innerHTML = "⏳ MENGUNGGAH BUKTI..."; 
    btn.disabled = true;

    try {
        // Upload Foto ke Storage Supabase
        const fileExt = fileBukti.name.split('.').pop(); 
        const fileName = `bukti_${penugasanId}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
            .from('bukti_kunjungan')
            .upload(fileName, fileBukti, { cacheControl: '3600', upsert: false });
            
        if (uploadError) throw new Error("Gagal upload foto: " + uploadError.message);
        
        // Ambil URL Publik
        const { data: { publicUrl } } = supabase.storage.from('bukti_kunjungan').getPublicUrl(fileName);
        
        btn.innerHTML = "⏳ MENYIMPAN DATA...";

        // Update Tabel Penugasan
        const { error: updateError } = await supabase.from('penugasan_kolektor')
            .update({ 
                status: statusVal, 
                foto_url: publicUrl, 
                catatan_lapangan: catatanVal, 
                tanggal_janji_bayar: tglJanjiVal || null, 
                waktu_eksekusi: waktuVal, 
                nominal_bayar: nominalVal
            })
            .eq('id', penugasanId);

        if (updateError) throw updateError;
        
        alert(`✅ MANTAP! Laporan terkirim (Status: ${statusVal}).`);
        closeModalEksekusi(); 
        loadCollectorTasks(); 
        
    } catch (err) { 
        alert("❌ Gagal mengirim laporan: " + err.message); 
    } finally { 
        btn.innerHTML = "🚀 SIMPAN & SELESAIKAN"; 
        btn.disabled = false; 
    }
});