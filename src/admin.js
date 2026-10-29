import { supabase } from './supabase.js';

// Load Worker PDF.js jika tersedia
if (window['pdfjs-dist/build/pdf']) {
    window.pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// === STATE MANAGEMENT ===
let globalDebitur = [];
let globalPenugasan = [];
let globalCollectors = [];

let unassignedDebitur = [];
let masterFilteredData = [];
let masterCurrentPage = 1;
const itemsPerPage = 12;

// Cek Sesi Login
if (localStorage.getItem('logged_in') !== 'true' || localStorage.getItem('user_role') !== 'admin') {
  window.location.href = 'login.html';
} else {
  const adminName = localStorage.getItem('user_name') || 'Admin';
  document.getElementById('welcomeAdmin').innerText = `Halo, ${adminName}!`;
}

// Inisialisasi Aplikasi
const initApp = async () => {
  const elManual = document.getElementById('manual_date');
  const elExcel = document.getElementById('excel_date'); 
  const today = new Date();
  
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const strDate = today.toLocaleDateString('id-ID', options);
  const isoDate = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');

  if (elManual) { elManual.value = strDate; elManual.dataset.date = isoDate; }
  if (elExcel) { elExcel.value = strDate; elExcel.dataset.date = isoDate; }

  await fetchAllData(); 
};
initApp();

window.logout = function() {
  localStorage.clear();
  window.location.href = 'login.html';
}

// === LOGIKA NAVIGASI SIDEBAR ===
const navItems = document.querySelectorAll('.nav-item');
const sectionTabs = document.querySelectorAll('.section-tab');
const pageTitle = document.getElementById('pageTitle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    // Reset warna menu
    navItems.forEach(nav => nav.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    // Ganti Judul
    pageTitle.innerText = e.currentTarget.innerText.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F]/g, '').trim();
    
    // Tampilkan Tab Konten
    const targetId = e.currentTarget.getAttribute('data-target');
    sectionTabs.forEach(tab => {
      tab.classList.remove('active');
      if (tab.id === targetId) tab.classList.add('active');
    });
    
    closeMobileSidebar();
  });
});

window.openMobileSidebar = function() { 
    sidebar.classList.remove('-translate-x-full'); 
    sidebarOverlay.classList.remove('hidden'); 
}
window.closeMobileSidebar = function() { 
    sidebar.classList.add('-translate-x-full'); 
    sidebarOverlay.classList.add('hidden'); 
}


// =========================================
// FETCH ALL DATA 
// =========================================
async function fetchAllData() {
    const loadingUI = document.getElementById('global-loading');
    if(loadingUI) loadingUI.classList.remove('hidden');

    try {
        const [resMan, resExc, resCol, resPen] = await Promise.all([
            supabase.from('manual_debitur').select('*'),
            supabase.from('excel_debitur').select('*'),
            supabase.from('users').select('*').eq('role', 'collector').order('created_at', { ascending: false }),
            supabase.from('penugasan_kolektor').select('*')
        ]);

        if (resMan.error) throw resMan.error;
        if (resExc.error) throw resExc.error;
        if (resCol.error) throw resCol.error;
        if (resPen.error) throw resPen.error;

        globalCollectors = resCol.data || [];
        globalPenugasan = resPen.data || [];

        const normalizedManual = (resMan.data || []).map(d => ({ ...d, sumber_tabel: 'manual_debitur' }));
        
        const normalizedExcel = (resExc.data || []).map(e => {
            const rawData = e.debitur || {};
            const nameKey = Object.keys(rawData).find(k => k.toLowerCase().includes('nama') || k.toLowerCase().includes('name'));
            const idKey = Object.keys(rawData).find(k => k.toLowerCase().includes('id') || k.toLowerCase().includes('nik') || k.toLowerCase().includes('no_akun'));
            
            const contactInfo = { ...rawData };
            if (nameKey) delete contactInfo[nameKey];
            if (idKey) delete contactInfo[idKey];
            
            return {
                ...e, 
                name: nameKey ? rawData[nameKey] : 'Tanpa Nama',
                nik: idKey ? rawData[idKey] : '-',
                contact_info: contactInfo,
                sumber_tabel: 'excel_debitur'
            };
        });

        // Gabung data & Urutkan Paling Baru
        globalDebitur = [...normalizedManual, ...normalizedExcel].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Pisahkan yang sudah ditugaskan vs belum
        const assignedIds = new Set(globalPenugasan.map(p => p.debitur_id));
        unassignedDebitur = globalDebitur.filter(d => !assignedIds.has(d.id));
        
        masterFilteredData = [...globalDebitur];
        masterCurrentPage = 1;

        // Render Ulang Semua UI
        renderAkunTab();
        populateAssignDropdowns();
        runAssignFilter(); 
        populateMonitorDropdowns();
        runMonitorFilter(); 
        populateMasterDropdowns();
        runMasterFilter();
        renderAntreanTab();

    } catch (err) {
        alert("Gagal sinkronisasi data: " + err.message);
    } finally {
        if(loadingUI) loadingUI.classList.add('hidden');
    }
}


// =========================================
// TAB 1: KELOLA AKUN
// =========================================
function renderAkunTab() {
    const listContainer = document.getElementById('collector-list');
    const selectKol = document.getElementById('select_kolektor'); 
    
    if(selectKol) {
      selectKol.innerHTML = '<option value="">-- Pilih Kolektor --</option>';
      globalCollectors.forEach(kol => { selectKol.innerHTML += `<option value="${kol.id}">${kol.name}</option>`; });
    }
    
    if(listContainer) {
      if(globalCollectors.length === 0) { 
          listContainer.innerHTML = '<p class="text-sm text-slate-500 py-4 text-center">Belum ada akun kolektor.</p>'; 
      } else {
         listContainer.innerHTML = globalCollectors.map(kol => `
            <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-orange-300 transition-colors mb-2">
               <div>
                  <p class="text-[12px] font-black text-slate-800 uppercase tracking-wide">${kol.name}</p>
                  <p class="text-[10px] font-semibold text-slate-500 mt-0.5">User: <span class="text-slate-700">${kol.username}</span> | WA: ${kol.phone || '-'}</p>
               </div>
               <button onclick="openEditKolektor('${kol.id}', '${kol.name.replace(/'/g, "\\'")}', '${kol.username.replace(/'/g, "\\'")}', '${kol.phone || ''}')" class="text-[10px] bg-white border border-slate-200 px-3 py-1.5 rounded-lg font-black uppercase text-slate-600 hover:bg-orange-100 hover:text-[#E65C00] transition-all shadow-sm">✏️ Edit</button>
            </div>
         `).join('');
      }
    }
}

// BIKIN AKUN KOLEKTOR (DENGAN VALIDASI DOUBLE PASSWORD)
document.getElementById('formCollector')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); 
    
    const nameVal = document.getElementById('c_name').value.trim();
    const usernameVal = document.getElementById('c_user').value.trim();
    const passwordVal = document.getElementById('c_pass').value;
    const passConfirmVal = document.getElementById('c_pass_confirm').value;
    const phoneVal = document.getElementById('c_phone').value.trim();
    
    // Cek Konfirmasi Password
    if (passwordVal !== passConfirmVal) {
        alert("❌ Password dan Konfirmasi Password tidak sama!");
        return;
    }

    btn.innerText = "Memproses...";
    
    try {
      const { error } = await supabase.from('users').insert([{ 
          name: nameVal, 
          username: usernameVal, 
          password: passwordVal, 
          phone: phoneVal || null, 
          role: 'collector', 
          created_by: localStorage.getItem('user_id') 
      }]);
      if (error) throw error; 
      
      alert(`✅ Akun Collector atas nama "${nameVal}" berhasil dibuat!`); 
      e.target.reset(); 
      await fetchAllData(); 
      
    } catch (err) { 
        alert("Gagal membuat akun: " + err.message); 
    } finally { 
        btn.innerText = "Simpan Akun Collector"; 
    }
});

window.openEditKolektor = function(id, name, username, phone) {
    document.getElementById('edit_col_id').value = id; 
    document.getElementById('edit_col_name').value = name; 
    document.getElementById('edit_col_user').value = username; 
    document.getElementById('edit_col_phone').value = phone || ''; 
    document.getElementById('edit_col_pass').value = ''; 
    
    document.getElementById('modal-edit-kolektor').classList.remove('hidden'); 
    document.getElementById('modal-edit-kolektor').classList.add('flex');
}

window.closeEditKolektor = function() {
    document.getElementById('modal-edit-kolektor').classList.add('hidden'); 
    document.getElementById('modal-edit-kolektor').classList.remove('flex'); 
    document.getElementById('formEditKolektor').reset();
}

document.getElementById('formEditKolektor')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.innerText = "Menyimpan Perubahan...";
    
    const id = document.getElementById('edit_col_id').value; 
    const name = document.getElementById('edit_col_name').value.trim(); 
    const phone = document.getElementById('edit_col_phone').value.trim(); 
    const newPass = document.getElementById('edit_col_pass').value; 
    
    let payload = { name: name, phone: phone || null }; 
    if(newPass.length > 0) payload.password = newPass; 
    
    try {
        const { error } = await supabase.from('users').update(payload).eq('id', id); 
        if (error) throw error; 
        alert(`✅ Profil kolektor "${name}" sukses diperbarui!${newPass ? '\nPassword juga telah di-reset.' : ''}`); 
        closeEditKolektor(); 
        await fetchAllData(); 
    } catch (err) { alert("Gagal update profil: " + err.message); } finally { btn.innerText = "Simpan Perubahan"; }
});


// =========================================
// TAB 2 & 4: PENUGASAN & ANTREAN
// =========================================
function renderAntreanTab() {
    const listContainer = document.getElementById('antrean-list'); 
    document.getElementById('badgeAntreanCount').innerText = `${unassignedDebitur.length} Antrean`;
    
    if(unassignedDebitur.length === 0) { 
        listContainer.innerHTML = '<p class="text-sm text-slate-500 py-4 text-center bg-slate-50 rounded-xl border border-slate-200">Tidak ada kasus menganggur. Semua sudah ditugaskan!</p>'; 
        return; 
    }
    
    listContainer.innerHTML = unassignedDebitur.map(d => `
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3 hover:border-orange-200 transition-colors">
           <div class="flex-1">
              <span class="text-[9px] font-black text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-md mb-1 inline-block">🏢 ${d.client}</span>
              <h3 class="font-black text-slate-800 text-[13px] uppercase">${d.name}</h3><p class="text-[10px] text-slate-500 font-bold mt-0.5">ID: ${d.nik} | Kec. ${d.kecamatan || '-'}</p>
           </div>
           <span class="text-[9px] bg-slate-100 text-slate-500 font-bold px-3 py-1.5 rounded-lg border border-slate-200">Menunggu Kolektor</span>
        </div>
    `).join('');
}

function populateAssignDropdowns() {
    const uniqueClients = [...new Set(unassignedDebitur.map(d => d.client))].filter(Boolean); 
    const filterTab = document.getElementById('filter_assign_client');
    if(filterTab) { 
        filterTab.innerHTML = `<option value="ALL">Semua Klien</option>`; 
        uniqueClients.forEach(c => filterTab.innerHTML += `<option value="${c}">${c}</option>`); 
    }
}

window.runAssignFilter = function() {
  const client = document.getElementById('filter_assign_client').value; 
  const kec = document.getElementById('filter_assign_kecamatan').value.toLowerCase(); 
  const kel = document.getElementById('filter_assign_kelurahan').value.toLowerCase(); 
  const pos = document.getElementById('filter_assign_kodepos').value.toLowerCase();
  
  const filtered = unassignedDebitur.filter(d => {
    const cekLokasi = (key) => (d[key] || '').toLowerCase(); 
    return (client === 'ALL' || d.client === client) && 
           (!kec || cekLokasi('kecamatan').includes(kec)) && 
           (!kel || cekLokasi('kelurahan').includes(kel)) && 
           (!pos || cekLokasi('kodepos').includes(pos));
  });
  renderAssignList(filtered);
}

window.updateSelectedCount = function() { 
    document.getElementById('assign-selected-count').innerText = `${document.querySelectorAll('.assign-checkbox:checked').length} Dipilih`; 
}

window.toggleAllAssign = function(sourceCheckbox) { 
    document.querySelectorAll('.assign-checkbox').forEach(cb => cb.checked = sourceCheckbox.checked); 
    updateSelectedCount(); 
}

function renderAssignList(dataArray) {
  const container = document.getElementById('assign-debitur-list');
  if (dataArray.length === 0) { 
      container.innerHTML = `<p class="col-span-full text-sm text-slate-500 py-4 text-center bg-white rounded-2xl border border-slate-200">Tidak ada debitur *menganggur* di area ini.</p>`; 
      return; 
  }
  
  container.innerHTML = `<div class="col-span-full bg-blue-50 px-4 py-3 rounded-xl border border-blue-200 flex gap-3 items-center mb-1"><input type="checkbox" onclick="toggleAllAssign(this)" class="w-5 h-5 cursor-pointer accent-blue-600 rounded"><span class="text-xs font-black text-blue-900 uppercase tracking-wide">Pilih Semua (${dataArray.length} Debitur)</span></div>` + dataArray.map(d => {
    const fullAlamat = [d.alamat_lengkap, d.kelurahan, d.kecamatan].filter(Boolean).join(' | ');
    return `<label class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4 cursor-pointer hover:border-blue-400 transition-colors"><input type="checkbox" value="${d.id}|${d.sumber_tabel}" onchange="updateSelectedCount()" class="assign-checkbox w-5 h-5 accent-blue-600 rounded mt-1 shadow-sm"><div class="flex-1"><div class="flex items-center gap-2 mb-1"><span class="text-[9px] font-black text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-md">🏢 ${d.client}</span><span class="text-slate-400 text-[9px] font-bold">ID: ${d.nik}</span></div><h3 class="font-black text-[#0B1B3D] text-[13px] uppercase leading-tight">${d.name}</h3><p class="text-[10px] text-slate-500 font-medium mt-1 truncate max-w-[200px]">📍 ${fullAlamat || '-'}</p></div></label>`;
  }).join('');
  updateSelectedCount(); 
}

window.submitPenugasan = async function() {
  const selectedKolektor = document.getElementById('select_kolektor').value; 
  const checkedBoxes = document.querySelectorAll('.assign-checkbox:checked');
  if(!selectedKolektor) { alert("❌ Pilih nama kolektornya dulu bray!"); return; } 
  if(checkedBoxes.length === 0) { alert("❌ Belum ada debitur yang dicentang!"); return; }
  
  const payload = Array.from(checkedBoxes).map(cb => { 
      const [debitur_id, sumber_tabel] = cb.value.split('|'); 
      return { collector_id: selectedKolektor, debitur_id: debitur_id, sumber_tabel: sumber_tabel, status: 'Ditugaskan' }; 
  });
  
  try { 
      const { error } = await supabase.from('penugasan_kolektor').insert(payload); 
      if (error) throw error; 
      alert(`🚀 MANTAP! ${payload.length} Debitur berhasil ditugaskan.`); 
      await fetchAllData(); 
  } catch (err) { 
      alert("❌ Gagal menugaskan kolektor: " + err.message); 
  }
}


// =========================================
// TAB 3: MONITORING
// =========================================
function populateMonitorDropdowns() { 
    const sel = document.getElementById('filter_mon_kolektor'); 
    if(sel) { 
        sel.innerHTML = '<option value="ALL">Semua Kolektor</option>'; 
        globalCollectors.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.name}</option>`); 
    } 
}

window.runMonitorFilter = function() {
    const kolId = document.getElementById('filter_mon_kolektor').value; 
    const stat = document.getElementById('filter_mon_status').value;
    
    const filtered = globalPenugasan.filter(p => {
        const matchKol = (kolId === 'ALL' || p.collector_id === kolId); 
        let matchStat = true;
        if(stat !== 'ALL') { 
            if(stat === 'Gagal') matchStat = p.status.includes('Kosong') || p.status.includes('Menolak') || p.status.includes('Palsu'); 
            else matchStat = p.status.includes(stat); 
        }
        return matchKol && matchStat;
    });
    renderMonitoringList(filtered);
}

function getStatusBadge(status) {
    if (!status || status === 'Ditugaskan') return `<span class="text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-widest border border-slate-200 shadow-sm">⏳ Menunggu</span>`;
    if (status.includes('Janji')) return `<span class="text-[9px] font-black text-orange-600 bg-orange-50 px-2 py-0.5 rounded uppercase tracking-widest border border-orange-200 shadow-sm">📅 Janji Bayar</span>`;
    if (status.includes('Sebagian')) return `<span class="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-widest border border-blue-200 shadow-sm">💸 Cicil</span>`;
    if (status.includes('Lunas')) return `<span class="text-[9px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded uppercase tracking-widest border border-green-200 shadow-sm">✅ LUNAS</span>`;
    return `<span class="text-[9px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded uppercase tracking-widest border border-red-200 shadow-sm">❌ Invalid</span>`;
}

function renderMonitoringList(dataArray) {
    const container = document.getElementById('monitoring-list');
    if(dataArray.length === 0) { 
        container.innerHTML = `<p class="col-span-full text-sm text-slate-500 py-4 text-center bg-white rounded-2xl border border-slate-200">Tidak ada data history penugasan.</p>`; 
        return; 
    }
    
    dataArray.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    container.innerHTML = dataArray.map(task => {
        const dbt = globalDebitur.find(d => d.id === task.debitur_id) || { name: 'Data Dihapus', client: '-' }; 
        const col = globalCollectors.find(c => c.id === task.collector_id) || { name: 'Kolektor Dihapus' };
        
        const safeNama = dbt.name.replace(/'/g, "\\'"); 
        const safeKol = col.name.replace(/'/g, "\\'"); 
        const safeStat = task.status || 'Ditugaskan'; 
        const safeCatatan = task.catatan_lapangan ? task.catatan_lapangan.replace(/'/g, "\\'") : '-'; 
        const safeTgl = task.tanggal_janji_bayar || '-'; 
        const safeImg = task.foto_url || '';
        
        let nominalFormatted = '-';
        if(task.nominal_bayar) {
            nominalFormatted = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(task.nominal_bayar);
        }

        return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-[0_2px_15px_-4px_rgba(0,0,0,0.05)] flex flex-col h-full hover:border-blue-300 transition-colors"><div class="flex justify-between items-start mb-3"><span class="text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-widest border border-slate-200">👤 ${col.name}</span>${getStatusBadge(task.status)}</div><h3 class="font-black text-[#0B1B3D] text-[13px] uppercase leading-tight mb-1 truncate">${dbt.name}</h3><p class="text-[10px] text-slate-400 font-bold mb-2">🏢 ${dbt.client}</p><p class="text-[11px] font-black text-blue-600 mb-4">💰 Nominal: ${nominalFormatted}</p><div class="mt-auto"><button onclick="openLaporan('${safeNama}', '${safeKol}', '${safeStat}', '${safeCatatan}', '${safeTgl}', '${safeImg}')" class="w-full bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-300 text-[10px] font-black py-2.5 rounded-xl uppercase tracking-widest transition-all">👁️ Lihat Laporan</button></div></div>`;
    }).join('');
}

window.openLaporan = function(namaDb, namaKol, status, catatan, tgl, img) {
    document.getElementById('lap_debitur_name').innerText = namaDb; 
    document.getElementById('lap_kol_name').innerText = namaKol; 
    document.getElementById('lap_status').innerText = status; 
    document.getElementById('lap_catatan').innerText = catatan;
    
    if(tgl !== '-' && tgl) { 
        document.getElementById('lap_tgl_wrap').classList.remove('hidden'); 
        document.getElementById('lap_tgl_janji').innerText = tgl; 
    } else { 
        document.getElementById('lap_tgl_wrap').classList.add('hidden'); 
    }
    
    const imgEl = document.getElementById('lap_foto'); 
    const txtNoImg = document.getElementById('lap_no_foto');
    if(img) { 
        imgEl.src = img; imgEl.style.display = 'block'; txtNoImg.classList.add('hidden'); 
    } else { 
        imgEl.style.display = 'none'; txtNoImg.classList.remove('hidden'); 
    }
    
    document.getElementById('modal-laporan').classList.remove('hidden'); 
    document.getElementById('modal-laporan').classList.add('flex');
}

window.closeLaporan = function() { 
    document.getElementById('modal-laporan').classList.add('hidden'); 
    document.getElementById('modal-laporan').classList.remove('flex'); 
}


// =========================================
// TAB 5: MASTER DATA & PEMBERSIHAN (POP-UP RAW JSON)
// =========================================
function populateMasterDropdowns() {
    const uniqueClients = [...new Set(globalDebitur.map(d => d.client))].filter(Boolean);
    const filterTab = document.getElementById('filter_master_client');
    if(filterTab) {
        filterTab.innerHTML = `<option value="ALL">Semua Klien</option>`;
        uniqueClients.forEach(c => filterTab.innerHTML += `<option value="${c}">${c}</option>`);
    }
}

window.runMasterFilter = function() {
    const client = document.getElementById('filter_master_client').value;
    const search = document.getElementById('filter_master_search').value.toLowerCase();
    
    masterFilteredData = globalDebitur.filter(d => {
        const matchClient = (client === 'ALL' || d.client === client);
        const matchSearch = !search || (d.name.toLowerCase().includes(search) || String(d.nik).toLowerCase().includes(search));
        return matchClient && matchSearch;
    });
    
    masterCurrentPage = 1;
    renderMasterTab();
}

window.updateMasterSelectedCount = function() {
    document.getElementById('master-selected-count').innerText = document.querySelectorAll('.master-checkbox:checked').length;
}

window.toggleAllMaster = function(sourceCheckbox) {
    document.querySelectorAll('.master-checkbox').forEach(cb => cb.checked = sourceCheckbox.checked);
    updateMasterSelectedCount();
}

window.prevMasterPage = function() { if (masterCurrentPage > 1) { masterCurrentPage--; renderMasterTab(); } }
window.nextMasterPage = function() { if (masterCurrentPage < Math.ceil(masterFilteredData.length / itemsPerPage)) { masterCurrentPage++; renderMasterTab(); } }

function renderMasterTab() {
  const container = document.getElementById('master-debitur-list');
  const counterBadge = document.getElementById('total-master-count');
  const pagControls = document.getElementById('pagination-controls');
  const pageInfo = document.getElementById('page-info');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  
  const totalItems = masterFilteredData.length;
  if(counterBadge) counterBadge.innerText = totalItems;
  
  if (totalItems === 0) {
    container.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center bg-white rounded-2xl border border-slate-200">Database kosong atau tidak ditemukan pencarian yang cocok.</p>`;
    pagControls.classList.add('hidden'); 
    return;
  }
  
  const maxPage = Math.ceil(totalItems / itemsPerPage);
  const startIdx = (masterCurrentPage - 1) * itemsPerPage;
  const paginatedData = masterFilteredData.slice(startIdx, startIdx + itemsPerPage);
  
  pagControls.classList.remove('hidden');
  pageInfo.innerText = `Halaman ${masterCurrentPage} dari ${maxPage}`;
  btnPrev.disabled = masterCurrentPage === 1;
  btnNext.disabled = masterCurrentPage === maxPage;
  
  let htmlResult = `<div class="bg-red-50 px-4 py-3 rounded-xl border border-red-200 flex gap-3 items-center mb-1"><input type="checkbox" onclick="toggleAllMaster(this)" class="w-5 h-5 cursor-pointer accent-red-600 rounded"><span class="text-xs font-black text-red-900 uppercase tracking-wide">Pilih Semua di Halaman Ini</span></div>`;

  htmlResult += paginatedData.map(d => {
    const isAssigned = globalPenugasan.find(p => p.debitur_id === d.id);
    const badgeAsg = isAssigned 
        ? `<span class="text-[9px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded border border-green-200">Ditugaskan</span>`
        : `<span class="text-[9px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded border border-slate-200">Nganggur</span>`;

    const contactInfo = d.sumber_tabel === 'excel_debitur' ? d.debitur : d.contact_info;
    const jsonEncoded = encodeURIComponent(JSON.stringify(contactInfo || {}));

    return `
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4 hover:border-red-300 transition-colors">
        <input type="checkbox" value="${d.id}|${d.sumber_tabel}" onchange="updateMasterSelectedCount()" class="master-checkbox w-5 h-5 accent-red-600 rounded mt-1 shadow-sm shrink-0 cursor-pointer">
        <div class="flex-1 overflow-hidden">
          <div class="flex items-center gap-2 mb-1">
             <span class="text-[9px] font-black text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-md">🏢 ${d.client || '-'}</span>
             ${badgeAsg}
          </div>
          <h3 onclick="openMasterDetail('${jsonEncoded}')" class="font-black text-[#0B1B3D] text-[13px] uppercase leading-tight mb-0.5 truncate cursor-pointer hover:text-red-600 transition-colors flex items-center gap-2">
             <span>${d.name}</span>
             <span class="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[9px] shrink-0 border border-blue-100 shadow-sm font-bold">🔍 Cek Data JSON</span>
          </h3>
          <p class="text-[10px] text-slate-400 font-bold">ID: <span class="text-slate-600">${d.nik}</span> | Masuk: ${d.tanggal_upload}</p>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = htmlResult;
  updateMasterSelectedCount();
}

window.openMasterDetail = function(jsonStrEncoded) {
    const infoData = JSON.parse(decodeURIComponent(jsonStrEncoded));
    const container = document.getElementById('master-detail-content');
    container.innerHTML = '';
    
    for (const [key, value] of Object.entries(infoData)) {
        const cleanKey = key.replace(/_/g, ' ').toUpperCase();
        container.innerHTML += `
            <div class="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span class="text-[9px] font-black text-slate-400 block uppercase mb-1 tracking-widest">${cleanKey}</span>
                <span class="text-xs font-bold text-slate-800 block break-words">${value || '-'}</span>
            </div>
        `;
    }
    document.getElementById('modal-master-detail').classList.remove('hidden');
    document.getElementById('modal-master-detail').classList.add('flex');
}

window.closeMasterDetail = function() {
    document.getElementById('modal-master-detail').classList.add('hidden');
    document.getElementById('modal-master-detail').classList.remove('flex');
}


// --- FITUR HAPUS MASSAL & EXPORT PDF ---
window.triggerMassDelete = function() {
    const checked = document.querySelectorAll('.master-checkbox:checked');
    if (checked.length === 0) { alert("❌ Pilih minimal 1 data dengan mencentang kotak di daftar untuk dihapus."); return; }
    document.getElementById('del-count-text').innerText = checked.length;
    document.getElementById('modal-delete-confirm').classList.remove('hidden');
    document.getElementById('modal-delete-confirm').classList.add('flex');
}

window.closeDeleteConfirm = function() {
    document.getElementById('modal-delete-confirm').classList.add('hidden');
    document.getElementById('modal-delete-confirm').classList.remove('flex');
}

window.executeMassDelete = async function(isExportPdf) {
    closeDeleteConfirm();
    const checkedBoxes = Array.from(document.querySelectorAll('.master-checkbox:checked'));
    const idsToDelete = checkedBoxes.map(cb => cb.value.split('|')[0]);
    const dataToExport = globalDebitur.filter(d => idsToDelete.includes(d.id));

    if (isExportPdf) {
        const loadingUI = document.getElementById('global-loading');
        loadingUI.classList.remove('hidden');
        document.getElementById('loading-text').innerText = "Menyiapkan PDF...";
        
        const reportDiv = document.createElement('div');
        reportDiv.style.padding = '30px'; reportDiv.style.fontFamily = 'Helvetica, Arial, sans-serif';
        reportDiv.innerHTML = `
           <h2 style="text-align:center; color:#0B1B3D; margin-bottom:5px;">Laporan Penghapusan Master Data ACS</h2>
           <p style="text-align:center; font-size:12px; color:#666; margin-top:0;">Diekspor pada: ${new Date().toLocaleString('id-ID')}</p>
           <table border="1" cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse; font-size:11px; margin-top:20px; border-color:#ccc;">
             <tr style="background-color:#f1f5f9; color:#333;"><th>No</th><th>Perusahaan Klien</th><th>Nama Debitur</th><th>NIK / ID Akun</th><th>Tanggal Masuk Database</th></tr>
             ${dataToExport.map((d, index) => `<tr><td style="text-align:center;">${index + 1}</td><td>${d.client}</td><td>${d.name}</td><td>${d.nik}</td><td>${d.tanggal_upload}</td></tr>`).join('')}
           </table>
           <p style="font-size:10px; color:#999; margin-top:30px;">Dokumen ini digenerate secara otomatis oleh Aviando Collector System.</p>
        `;
        
        const opt = { margin: 0.5, filename: `Report_Delete_${new Date().getTime()}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
        await html2pdf().set(opt).from(reportDiv).save();
    }

    const loadingUI = document.getElementById('global-loading');
    loadingUI.classList.remove('hidden'); document.getElementById('loading-text').innerText = "Menghapus Data...";

    try {
        for (const id of idsToDelete) { await supabase.from('penugasan_kolektor').delete().eq('debitur_id', id); }
        
        const tableMap = {};
        checkedBoxes.forEach(cb => { 
            const [id, tabel] = cb.value.split('|'); 
            if(!tableMap[tabel]) tableMap[tabel] = []; 
            tableMap[tabel].push(id); 
        });
        
        for (const tabel in tableMap) {
            const { error } = await supabase.from(tabel).delete().in('id', tableMap[tabel]);
            if (error) throw error;
        }
        
        alert(`✅ Selesai! ${checkedBoxes.length} Data telah dihapus dari database.`);
        await fetchAllData();
        
    } catch (err) { 
        alert("Gagal menghapus data: " + err.message); 
    } finally { 
        loadingUI.classList.add('hidden'); 
        document.getElementById('loading-text').innerText = "Sinkronisasi Database..."; 
    }
}

window.massDeleteAll = async function() {
    if(!confirm("⚠️ PERINGATAN KERAS ⚠️\n\nAnda yakin ingin menghapus SELURUH DATA DEBITUR beserta riwayat penugasannya?\nIni akan mengosongkan database!\n\nKetik OK jika setuju.")) return;
    try {
        document.getElementById('global-loading').classList.remove('hidden');
        await supabase.from('penugasan_kolektor').delete().not('id', 'is', null);
        await supabase.from('excel_debitur').delete().not('id', 'is', null);
        await supabase.from('manual_debitur').delete().not('id', 'is', null);
        alert("✅ SELURUH DATABASE BERHASIL DIKOSONGKAN!");
        await fetchAllData();
    } catch (err) { alert("Gagal hapus massal: " + err.message); }
}


// --- INPUT MANUAL & PARSER EXCEL/PDF ---
window.addJsonField = function() {
  const container = document.getElementById('jsonb-fields-container');
  const newRow = document.createElement('div'); newRow.className = "flex gap-2 json-row mt-2";
  newRow.innerHTML = `<input type="text" placeholder="Label (Cth: Agama)" required class="json-key w-1/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-orange-500"><input type="text" placeholder="Isi Data..." required class="json-val w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500"><button type="button" onclick="this.parentElement.remove()" class="bg-red-100 text-red-500 px-3 rounded-lg font-bold hover:bg-red-200">X</button>`;
  container.appendChild(newRow);
}

document.getElementById('formEditDebitur')?.addEventListener('submit', async (e) => {
  e.preventDefault(); const btn = e.target.querySelector('button'); btn.innerText = "Menyimpan Data...";
  const isoUploadDate = document.getElementById('manual_date').dataset.date;
  
  const jsonbData = { total_terutang: document.getElementById('input_amount').value, jatuh_tempo: document.getElementById('input_tgl').value };
  
  document.querySelectorAll('.json-row').forEach(row => {
    const key = row.querySelector('.json-key') || row.querySelector('input[readonly]');
    const val = row.querySelector('.json-val');
    if (key && val && val.value.trim() !== '') { jsonbData[key.value.trim().replace(/\s+/g, '_').toLowerCase()] = val.value.trim(); }
  });
  
  try {
    const { error } = await supabase.from('manual_debitur').insert([{ tanggal_upload: isoUploadDate, client: document.getElementById('input_client').value.trim(), name: document.getElementById('input_nama').value.trim(), nik: document.getElementById('input_nik').value.trim(), alamat_lengkap: document.getElementById('input_alamat').value.trim(), kelurahan: document.getElementById('input_kelurahan').value.trim(), kecamatan: document.getElementById('input_kecamatan').value.trim(), kota_kabupaten: document.getElementById('input_kota').value.trim(), kodepos: document.getElementById('input_kodepos').value.trim(), provinsi: document.getElementById('input_provinsi').value.trim(), contact_info: jsonbData }]);
    
    if (error) throw error; 
    alert(`✅ Data berhasil disimpan!`); 
    e.target.reset(); 
    
    document.getElementById('jsonb-fields-container').innerHTML = `<div class="flex gap-2 json-row"><input type="text" value="No WhatsApp" readonly class="w-1/3 bg-slate-100 border border-slate-200 text-slate-500 rounded-lg px-3 py-2 text-xs font-semibold"><input type="text" placeholder="6281234..." required class="json-val w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500"></div>`; 
    
    await fetchAllData(); 
  } catch (err) { 
      alert("Gagal simpan debitur: " + err.message); 
  } finally { 
      btn.innerText = "Simpan Data Manual ke Database"; 
  }
});

function parseAlamat(alamatStr) {
  if (!alamatStr) return {}; const str = String(alamatStr);
  const extract = (prefix) => { const rgx = new RegExp(`(?:${prefix})\\s*([a-zA-Z\\s]+?)(?:,|\\b(?:kec|kel|desa|kota|kab|prov)\\b|\\d{5}|$)`, 'i'); const match = str.match(rgx); return match ? match[1].trim() : null; };
  return { kodepos: str.match(/\b\d{5}\b/)?.[0] || null, kelurahan: extract('kelurahan|kel\\.?|desa'), kecamatan: extract('kecamatan|kec\\.?'), kota_kabupaten: extract('kota|kabupaten|kab\\.?'), provinsi: extract('provinsi|prov\\.?') };
}

async function parsePDFToJSON(file) {
    if (!window.pdfjsLib) throw new Error("Library PDF.js belum termuat.");
    const arrayBuffer = await file.arrayBuffer(); const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise; let extractedRows = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i); const textContent = await page.getTextContent(); const rawStrings = textContent.items.map(item => item.str);
        const textNormalized = rawStrings.join(' ').replace(/\s+/g, ' '); const textNoSpace = rawStrings.join('').replace(/\s+/g, ''); let rowData = { "_sumber": `PDF Halaman ${i}` };
        
        const matchCcBri = textNoSpace.match(/(\d{16})/); 
        if (matchCcBri) rowData["NIK"] = matchCcBri[1]; 
        else { const matchNikUmum = textNormalized.match(/(?:NIK|No Akun|ID|KTP)\s*[:\-]?\s*(\d{10,16})/i); if (matchNikUmum) rowData["NIK"] = matchNikUmum[1].trim(); }
        
        const matchNamaBri = textNormalized.match(/NAMA CUSTOMER.*?:\s*([A-Za-z\s\.\'\-]{3,40})(?:TELEPON|JENIS|K\s*=|R\s*=|$)/i); const matchNamaUmum = textNormalized.match(/(?:Nama Debitur|Nama|Name)\s*[:\-]?\s*([A-Za-z\s\.\'\-]{3,40})/i);
        if (matchNamaBri) rowData["Nama"] = matchNamaBri[1].replace(/TELEPON/i, '').replace(/:/g, '').trim(); 
        else if (matchNamaUmum) rowData["Nama"] = matchNamaUmum[1].trim();
        
        const matchUangBriNoSpace = textNoSpace.match(/Rp\.?(\d{5,})/i); const matchUangNormal = textNormalized.match(/Rp\.?\s*([\d\.,]{5,})/i);
        if (matchUangBriNoSpace) rowData["Total Terutang"] = matchUangBriNoSpace[1]; 
        else if (matchUangNormal) rowData["Total Terutang"] = matchUangNormal[1].replace(/[^\d]/g, '');
        
        const matchAlamatBri = textNormalized.match(/ALAMAT[^:]*:\s*(.*?)(?:KANTOR|EMERGENCY|TELEPON|MEMO)/i); 
        if (matchAlamatBri) rowData["Alamat Lengkap"] = matchAlamatBri[1].replace(/\b\d{16}\b/g, '').replace(/\|/g, '').trim();
        
        const matchTelp = textNoSpace.match(/(?:08|628)\d{8,11}/); if (matchTelp) rowData["No WhatsApp"] = matchTelp[0];
        const matchKol = textNormalized.match(/(MACET|DIRAGUKAN|KURANG LANCAR)/i); if (matchKol) rowData["Kolektibilitas"] = matchKol[1].toUpperCase();
        
        if (rowData["NIK"]) { 
            if (!rowData["Nama"]) rowData["Nama"] = `Debitur (${rowData["NIK"].substring(0, 6)}...)`; 
            extractedRows.push(rowData); 
        } else if (rowData["Nama"]) { extractedRows.push(rowData); }
    }
    
    if (extractedRows.length === 0) throw new Error("Gagal membaca data (Mesin tidak mendeteksi format yang tepat)."); 
    return extractedRows;
}

window.openExcelModal = function() { document.getElementById('modal-excel').classList.remove('hidden'); }
window.closeExcelModal = function() { document.getElementById('modal-excel').classList.add('hidden'); document.getElementById('formUploadExcel').reset(); }

document.getElementById('formUploadExcel')?.addEventListener('submit', async (e) => {
  e.preventDefault(); 
  
  const clientName = document.getElementById('excel_client').value.trim(); 
  const fileInput = document.getElementById('excel_file'); 
  const submitBtn = document.getElementById('btnUploadProcess'); 
  const isoUploadDate = document.getElementById('excel_date').dataset.date;
  
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0]; 
    const isPDF = file.name.toLowerCase().endsWith('.pdf'); 
    
    submitBtn.innerText = isPDF ? "Menerjemahkan PDF..." : "Membaca Excel..."; 
    submitBtn.disabled = true;
    
    try {
        let extractedRows = []; 
        if (isPDF) { 
            extractedRows = await parsePDFToJSON(file); 
        } else { 
            const arrayBuffer = await file.arrayBuffer(); 
            const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' }); 
            extractedRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]); 
        }
        
        if (!extractedRows || extractedRows.length === 0) throw new Error("File kosong atau format rusak.");
        submitBtn.innerText = `Menyimpan ${extractedRows.length} Baris...`;
        
        const payload = extractedRows.map(row => {
          const alamatKey = Object.keys(row).find(k => k.toLowerCase().includes('alamat')); 
          const locInfo = parseAlamat(alamatKey ? String(row[alamatKey]) : null);
          return { tanggal_upload: isoUploadDate, client: clientName, alamat_lengkap: locInfo ? String(row[alamatKey]) : null, kelurahan: locInfo.kelurahan, kecamatan: locInfo.kecamatan, kota_kabupaten: locInfo.kota_kabupaten, kodepos: locInfo.kodepos, provinsi: locInfo.provinsi, debitur: row, status: 'Pending' };
        });
        
        const { error } = await supabase.from('excel_debitur').insert(payload); 
        if (error) throw error; 
        
        alert(`✅ UPLOAD BERHASIL!\n\n${extractedRows.length} data sukses masuk.`); 
        closeExcelModal(); 
        await fetchAllData(); 
        
    } catch (err) { 
        alert(`❌ ERROR: ${err.message}`); 
    } finally { 
        submitBtn.innerText = "Mulai Proses & Upload Data"; 
        submitBtn.disabled = false; 
    }
  }
});