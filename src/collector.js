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
// HELPER PEMBACA DATA SESUAI TEMPLATE
// ==========================================
function isValidVal(val) {
    if (val === undefined || val === null) return false;
    const str = String(val).trim();
    return str !== '' && str !== '0' && str !== '.' && str !== '-';
}

// 2. Format WO menjadi 3 digit angka
function formatWO3Digit(val) {
    if (!isValidVal(val)) return '-';
    const num = Number(String(val).replace(/,/g, '.').replace(/[^\d.-]/g, ''));
    if (isNaN(num)) return String(val).trim();
    const rounded = Math.max(0, Math.round(num));
    return String(rounded).padStart(3, '0');
}

// 3. Format tampilan tanggal START / END (DD/MM/YYYY)
function formatDateDDMMYYYYDisplay(val) {
    if (!isValidVal(val)) return '-';
    if (typeof val === 'number' && val > 20000 && val < 90000) {
        const utcDays = Math.floor(val - 25569);
        const dt = new Date(utcDays * 86400 * 1000);
        return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
    }
    const str = String(val).trim();
    if (/^\d{5}$/.test(str)) {
        const numVal = Number(str);
        if (numVal > 20000 && numVal < 90000) return formatDateDDMMYYYYDisplay(numVal);
    }
    const isoMatch = str.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T\s].*)?$/);
    if (isoMatch) {
        return `${isoMatch[3].padStart(2, '0')}/${isoMatch[2].padStart(2, '0')}/${isoMatch[1]}`;
    }
    const dmyMatch = str.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})(?:\s.*)?$/);
    if (dmyMatch) {
        const y = dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3];
        return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${y}`;
    }
    return str;
}

function getDebiturName(db, sumberTabel) {
    if (sumberTabel === 'excel_debitur' && db.debitur) {
        const raw = db.debitur;
        const keys = Object.keys(raw);
        const priority = ['nama nasabah', 'nama debitur', 'nama customer', 'nama', 'name'];
        for (const target of priority) {
            const found = keys.find(k => k.trim().toLowerCase() === target);
            if (found && isValidVal(raw[found])) return String(raw[found]).trim();
        }
        const fallback = keys.find(k => {
            const lk = k.trim().toLowerCase();
            return (lk.includes('nama') || lk.includes('name')) &&
                   !lk.includes('kantor') && !lk.includes('ec') && !lk.includes('ibu') && !lk.includes('mother');
        });
        if (fallback && isValidVal(raw[fallback])) return String(raw[fallback]).trim();
    }
    return db.name || 'Tanpa Nama';
}

// 4. Ekstrak Nomor Kartu / No Debitur untuk posisi paling atas
function getDebiturCardOrAccountNo(db, contactInfo) {
    if (contactInfo) {
        const keys = Object.keys(contactInfo);
        const priority = ['no nasabah/ no kartu', 'no kartu', 'no nasabah', 'no debitur', 'no akun', 'nik', 'debtor', 'user id'];
        for (const target of priority) {
            const found = keys.find(k => k.trim().toLowerCase() === target);
            if (found && isValidVal(contactInfo[found])) return String(contactInfo[found]).trim();
        }
        const fallback = keys.find(k => {
            const lk = k.trim().toLowerCase();
            return lk.includes('no kartu') || lk.includes('no nasabah') || lk.includes('no debitur') || lk.includes('no akun') || lk.includes('nik');
        });
        if (fallback && isValidVal(contactInfo[fallback])) return String(contactInfo[fallback]).trim();
    }
    return isValidVal(db.nik) ? String(db.nik).trim() : '-';
}

function getDebiturAmount(contactInfo) {
    if (!contactInfo) return 0;
    const keys = Object.keys(contactInfo);
    const priority = ['os', 'total terutang', 'total_terutang', 'tagihan', 'amount', 'principal', 'limit'];
    for (const target of priority) {
        const found = keys.find(k => k.trim().toLowerCase() === target || k.trim().toLowerCase().includes(target));
        if (found && isValidVal(contactInfo[found])) {
            const num = Number(String(contactInfo[found]).replace(/[^\d.-]/g, ''));
            if (!isNaN(num) && num > 0) return num;
        }
    }
    return 0;
}

function getDebiturPhone(contactInfo) {
    if (!contactInfo) return '';
    const keys = Object.keys(contactInfo);
    const priority = ['hp', 'no whatsapp', 'no_whatsapp', 'whatsapp', 'wa', 'no hp', 'telepon', 'telp'];
    for (const target of priority) {
        const found = keys.find(k => {
            const lk = k.trim().toLowerCase();
            return (lk === target || lk.includes(target)) && !lk.includes('kantor') && !lk.includes('ec');
        });
        if (found && isValidVal(contactInfo[found])) return String(contactInfo[found]).trim();
    }
    return '';
}

function getDebiturFullAddress(db, contactInfo) {
    if (isValidVal(db.alamat_lengkap)) return String(db.alamat_lengkap).trim();
    if (!contactInfo) return '-';

    const norm = {};
    for (const [k, v] of Object.entries(contactInfo)) {
        norm[k.trim().toUpperCase()] = v;
    }

    let baseAddr = '';
    if (isValidVal(norm['ALAMAT MAIN'])) {
        baseAddr = String(norm['ALAMAT MAIN']).trim();
    } else if (isValidVal(norm['ALAMAT KTP'])) {
        baseAddr = String(norm['ALAMAT KTP']).trim();
    } else {
        const parts = ['ALAMAT 1', 'ALAMAT 2', 'ALAMAT 3', 'ALAMAT 4']
            .map(c => isValidVal(norm[c]) ? String(norm[c]).trim() : null)
            .filter(Boolean);
        baseAddr = parts.join(', ');
    }

    const areaParts = ['KEL', 'KEC', 'KOTA', 'KODE POS']
        .map(c => isValidVal(norm[c]) ? String(norm[c]).trim() : null)
        .filter(w => w && !baseAddr.toLowerCase().includes(w.toLowerCase()));

    const combined = [baseAddr, ...areaParts].filter(Boolean).join(', ');
    return combined || '-';
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
                const dName = getDebiturName(debiturDetail, task.sumber_tabel);
                const cInfo = task.sumber_tabel === 'excel_debitur' ? debiturDetail.debitur : debiturDetail.contact_info;
                const dNo = getDebiturCardOrAccountNo(debiturDetail, cInfo);
                
                finalTasks.push({ 
                    ...task, 
                    detail_debitur: debiturDetail, 
                    search_name: `${String(dName).toLowerCase()} ${String(dNo).toLowerCase()}`
                });
            }
        }

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
// FUNGSI PEMBANTU (BACKGROUND CARD & BADGE)
// ==========================================
function getCardBackground(status) {
    if (!status || status === 'Ditugaskan') return 'bg-white border-slate-200 hover:border-orange-300';
    if (status.includes('Janji')) return 'bg-orange-50/40 border-orange-200 hover:border-orange-400';
    if (status.includes('Sebagian')) return 'bg-blue-50/40 border-blue-200 hover:border-blue-400';
    if (status.includes('Lunas')) return 'bg-green-50/40 border-green-200 hover:border-green-400';
    return 'bg-red-50/40 border-red-200 hover:border-red-400';
}

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
        const namaDebitur = getDebiturName(db, task.sumber_tabel);
        const contactInfo = task.sumber_tabel === 'excel_debitur' ? db.debitur : db.contact_info;
        const noKartuDebitur = getDebiturCardOrAccountNo(db, contactInfo);
        
        const numericAmount = getDebiturAmount(contactInfo);
        const formatRp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(numericAmount);
        
        const wa = getDebiturPhone(contactInfo);
        const linkWa = wa ? `https://wa.me/${wa.replace(/\D/g, '').replace(/^0/, '62')}` : '#';
        
        const kelDisplay = db.kelurahan || (contactInfo && isValidVal(contactInfo['KEL']) ? contactInfo['KEL'] : '');
        const kecDisplay = db.kecamatan || (contactInfo && isValidVal(contactInfo['KEC']) ? contactInfo['KEC'] : '');
        const kotaDisplay = db.kota_kabupaten || (contactInfo && isValidVal(contactInfo['KOTA']) ? contactInfo['KOTA'] : '');
        const arrLokasi = [kelDisplay, kecDisplay, kotaDisplay].filter(Boolean);
        const alamatSingkat = arrLokasi.length > 0 ? arrLokasi.join(', ') : 'Cek Detail Alamat';

        const fullAlamat = getDebiturFullAddress(db, contactInfo);
        const jsonStringInfo = encodeURIComponent(JSON.stringify(contactInfo || {}));
        const safeAlamatLengkap = fullAlamat.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\r?\n/g, ' ');
        const safeNamaDebitur = namaDebitur.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\r?\n/g, ' ');

        const badgeStatus = getStatusBadge(task.status);
        const isDikerjakan = task.status !== 'Ditugaskan';
        const btnText = isDikerjakan ? 'Edit ✏️' : 'Eksekusi ⚡';
        
        const btnStyle = isDikerjakan 
            ? 'bg-slate-700 hover:bg-slate-800 border-slate-800' 
            : 'bg-[#E65C00] hover:bg-orange-600 border-orange-700';

        const cardBgClass = getCardBackground(task.status);

        return `
            <div class="${cardBgClass} p-5 rounded-2xl border shadow-[0_2px_15px_-4px_rgba(0,0,0,0.05)] flex flex-col h-full transition-colors">
                <div class="flex justify-between items-start mb-2.5">
                    <span class="text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-widest border border-slate-200">
                        🏢 ${db.client || '-'}
                    </span>
                    ${badgeStatus}
                </div>

                <!-- 4. INFORMASI NOMOR KARTU / NO DEBITUR PALING ATAS -->
                <div class="bg-slate-100/90 border border-slate-200 rounded-lg px-2.5 py-1.5 mb-2.5 flex items-center justify-between gap-2">
                    <span class="text-[9px] font-black text-slate-500 uppercase tracking-wider shrink-0">💳 No. Kartu / Debitur</span>
                    <span class="text-[11px] font-black text-[#0B1B3D] tracking-wide truncate">${noKartuDebitur}</span>
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
                    <button onclick="openModalDetail('${safeNamaDebitur}', '${safeAlamatLengkap}', '${jsonStringInfo}')" class="col-span-2 bg-slate-100 text-slate-600 text-[10px] font-black rounded-xl uppercase tracking-widest hover:bg-slate-200 transition-all border border-slate-200 w-full py-3 shadow-sm">
                        🔍 Rincian
                    </button>
                    <a href="${linkWa}" target="_blank" class="col-span-1 bg-green-50 text-green-600 border border-green-200 rounded-xl flex items-center justify-center hover:bg-green-100 transition-colors shadow-sm">
                        <span class="text-xl leading-none pt-0.5">📞</span>
                    </a>
                    <button onclick="openModalEksekusi('${task.id}', '${safeNamaDebitur}')" class="col-span-1 text-white rounded-xl flex items-center justify-center transition-all active:scale-95 shadow-sm border w-full ${btnStyle}">
                        <span class="text-sm font-bold pt-0.5 text-white">${btnText}</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}


// ==========================================
// 3. LOGIKA MODAL RINCIAN (NO KARTU/DEBITUR PALING ATAS, BUKAN DI COLLECTOR FIELD)
// ==========================================
function formatTemplateLabel(rawKey) {
    const k = rawKey.trim().toUpperCase();
    if (k === 'KOTA.1' || k === 'KOTA_1') return 'KOTA KANTOR';
    if (k === 'KODE POS.1' || k === 'KODE POS_1') return 'KODE POS KANTOR';
    if (k === 'KOTA.2' || k === 'KOTA_2') return 'KOTA EC';
    if (k === 'KODE POS.2' || k === 'KODE POS_2') return 'KODE POS EC';
    return k.replace(/_/g, ' ');
}

function formatVAValue(val) {
    const str = String(val).trim();
    if (str.startsWith('{') && str.endsWith('}')) {
        try {
            const vaObj = JSON.parse(str);
            return Object.entries(vaObj)
                .map(([bank, nomor]) => `<span class="block text-[10px] leading-snug"><span class="text-slate-400">${bank}:</span> ${nomor}</span>`)
                .join('');
        } catch (e) {
            return str;
        }
    }
    return str;
}

window.openModalDetail = function(nama, alamat, jsonStrEncoded) {
    const infoData = JSON.parse(decodeURIComponent(jsonStrEncoded));
    
    document.getElementById('detail_nama').innerText = nama;
    document.getElementById('detail_alamat').innerText = alamat;
    
    const queryMaps = alamat !== '-' ? alamat : (nama + ' ' + (infoData.KOTA || infoData.KEC || infoData.KECAMATAN || ''));
    document.getElementById('btn_maps_link').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryMaps)}`;

    const listContainer = document.getElementById('detail_json_list');
    
    let htmlIdentitasAtas = '';
    let htmlTagihan = ''; 
    let htmlPribadi = ''; 
    let htmlAlamat = '';
    let htmlKantor = '';
    let htmlEC = '';
    let htmlCollectorField = '';
    
    for (const [key, value] of Object.entries(infoData)) {
        const lowerKey = key.trim().toLowerCase();
        
        if (lowerKey === 'nama nasabah' || lowerKey === 'nama' || lowerKey === 'name' || lowerKey === '_sumber') continue;
        
        const cleanKey = formatTemplateLabel(key); 
        let cleanValue = (value !== undefined && value !== null && String(value).trim() !== '') ? String(value).trim() : '-';

        if (/^(bln\s*wo|wo)$/i.test(lowerKey) && cleanValue !== '-') {
            cleanValue = formatWO3Digit(cleanValue);
        }

        if ((lowerKey === 'start' || lowerKey === 'end') && cleanValue !== '-') {
            cleanValue = formatDateDDMMYYYYDisplay(cleanValue);
        }

        const isMoneyCol = /^(os|principal|limit|lpa|sum\s*pay|total\s*terutang|terutang|tagihan|amount|installment)$/i.test(lowerKey) ||
                           lowerKey.includes('terutang') || lowerKey.includes('tagihan') || lowerKey.includes('principal');
        if (isMoneyCol && cleanValue !== '-') {
            const numOnly = Number(cleanValue.replace(/[^\d.-]/g, ''));
            if (!isNaN(numOnly) && numOnly > 0) {
                cleanValue = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(numOnly);
            }
        }

        if (lowerKey === 'va' && cleanValue !== '-') {
            cleanValue = formatVAValue(cleanValue);
        }

        const rowHtml = `
            <div class="flex justify-between py-2.5 border-b border-slate-100 last:border-0 items-start hover:bg-slate-50 transition-colors px-1 gap-2">
                <span class="text-[10px] font-bold text-slate-400 w-[42%] break-words leading-tight">${cleanKey}</span>
                <span class="text-[11px] font-black text-slate-700 w-[58%] text-right break-words leading-tight">${cleanValue}</span>
            </div>
        `;
        
        // 4. NOMOR KARTU / NO DEBITUR -> PALING ATAS (BUKAN DI COLLECTOR FIELD)
        if (lowerKey.match(/^(no\s*nasabah\/?\s*no\s*kartu|no\s*kartu|no\s*nasabah|no\s*debitur|no\s*akun|debtor|user\s*id|nik)$/) ||
            lowerKey.includes('no kartu') || lowerKey.includes('no nasabah') || lowerKey.includes('no debitur')) {
            htmlIdentitasAtas += rowHtml;
        }
        else if (lowerKey.match(/^(os|principal|limit|dpd|lpa|lpd|lpc|tenor|va|kartu|sum\s*pay|open\s*date|tahun\s*wo|bln\s*wo|wo|aktifasi|loan\s*type|transaksi\s*akhir|act\s*type)/) ||
            lowerKey.match(/amount|terutang|tagihan|installment|byr|bayar|loan/)) { 
            htmlTagihan += rowHtml; 
        } 
        else if (lowerKey.match(/^(ttl|agama|status|gender|sex|ibu\s*kandung|kerjaan|pekerjaan)/) ||
                   lowerKey.match(/lahir|mother|ibu|sttus/)) { 
            htmlPribadi += rowHtml; 
        } 
        else if (lowerKey.includes('kantor') || lowerKey === 'kota.1' || lowerKey === 'kota_1' || lowerKey === 'kode pos.1' || lowerKey === 'kode pos_1') {
            htmlKantor += rowHtml;
        } 
        else if (lowerKey.includes(' ec') || lowerKey.startsWith('ec') || lowerKey === 'kota.2' || lowerKey === 'kota_2' || lowerKey === 'kode pos.2' || lowerKey === 'kode pos_2') {
            htmlEC += rowHtml;
        } 
        else if (lowerKey.match(/^(alamat|kota|kode\s*pos|kec|kel|city|kecamatan|kelurahan|provinsi)/)) {
            htmlAlamat += rowHtml;
        } 
        else { 
            htmlCollectorField += rowHtml; 
        }
    }
    
    listContainer.innerHTML = `
        ${htmlIdentitasAtas ? `<div class="mb-4 bg-orange-50/50 p-3 rounded-xl border border-orange-200"><div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-orange-200"><span class="text-sm">💳</span><p class="text-[10px] font-black text-[#E65C00] uppercase tracking-widest">Nomor Kartu & Identitas Debitur</p></div>${htmlIdentitasAtas}</div>` : ''}
        ${htmlTagihan ? `<div class="mb-4 bg-red-50/30 p-3 rounded-xl border border-red-100"><div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-red-100"><span class="text-sm">💰</span><p class="text-[10px] font-black text-red-600 uppercase tracking-widest">Detail Keuangan & Pinjaman</p></div>${htmlTagihan}</div>` : ''}
        ${htmlPribadi ? `<div class="mb-4 bg-blue-50/30 p-3 rounded-xl border border-blue-100"><div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-blue-100"><span class="text-sm">👤</span><p class="text-[10px] font-black text-blue-600 uppercase tracking-widest">Profil Pribadi</p></div>${htmlPribadi}</div>` : ''}
        ${htmlAlamat ? `<div class="mb-4 bg-emerald-50/30 p-3 rounded-xl border border-emerald-100"><div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-emerald-100"><span class="text-sm">🏠</span><p class="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Alamat Domisili & KTP</p></div>${htmlAlamat}</div>` : ''}
        ${htmlKantor ? `<div class="mb-4 bg-amber-50/30 p-3 rounded-xl border border-amber-100"><div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-amber-100"><span class="text-sm">🏢</span><p class="text-[10px] font-black text-amber-700 uppercase tracking-widest">Data Kantor & Pekerjaan</p></div>${htmlKantor}</div>` : ''}
        ${htmlEC ? `<div class="mb-4 bg-purple-50/30 p-3 rounded-xl border border-purple-100"><div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-purple-100"><span class="text-sm">☎️</span><p class="text-[10px] font-black text-purple-700 uppercase tracking-widest">Emergency Contact (EC)</p></div>${htmlEC}</div>` : ''}
        ${htmlCollectorField ? `<div class="mb-2 bg-slate-50/60 p-3 rounded-xl border border-slate-200"><div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-slate-200"><span class="text-sm">📋</span><p class="text-[10px] font-black text-slate-600 uppercase tracking-widest">Kontak & Collector Field</p></div>${htmlCollectorField}</div>` : ''}
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
    
    const now = new Date(); 
    const options = { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    document.getElementById('waktu_eksekusi').value = now.toLocaleDateString('id-ID', options).replace(/\./g, ':');

    document.getElementById('modalEksekusi').classList.remove('hidden'); 
    document.getElementById('modalEksekusi').classList.add('flex'); 
    document.body.style.overflow = 'hidden'; 
    
    toggleJanjiBayar();
}

window.closeModalEksekusi = function() {
    document.getElementById('modalEksekusi').classList.add('hidden'); 
    document.getElementById('modalEksekusi').classList.remove('flex');
    
    document.getElementById('formLogAktivitas').reset(); 
    document.getElementById('labelFoto').innerHTML = 'Buka Kamera<br>Atau Upload Bukti Bayar'; 
    document.body.style.overflow = 'auto'; 
}

window.previewFileName = function(input) {
    if(input.files && input.files[0]) { 
        document.getElementById('labelFoto').innerHTML = `<span class="text-green-600 font-black">✅ FOTO / BUKTI SIAP</span><br><span class="text-[9px] mt-1 text-slate-500">${input.files[0].name}</span>`; 
    }
}

window.toggleJanjiBayar = function() {
    const val = document.getElementById('hasil_tindak_lanjut').value; 
    const wrapDate = document.getElementById('wrapper_janji_bayar'); 
    const wrapNominal = document.getElementById('wrapper_nominal');
    
    if(val.includes('Janji') || val.includes('Cicil')) { 
        wrapDate.style.display = 'block'; 
    } else { 
        wrapDate.style.display = 'none'; 
        document.getElementById('tgl_janji').value = ''; 
    }

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
        const fileExt = fileBukti.name.split('.').pop(); 
        const fileName = `bukti_${penugasanId}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
            .from('bukti_kunjungan')
            .upload(fileName, fileBukti, { cacheControl: '3600', upsert: false });
            
        if (uploadError) throw new Error("Gagal upload foto: " + uploadError.message);
        
        const { data: { publicUrl } } = supabase.storage.from('bukti_kunjungan').getPublicUrl(fileName);
        
        btn.innerHTML = "⏳ MENYIMPAN DATA...";

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
