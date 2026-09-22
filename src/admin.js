import { supabase } from './supabase.js';

// === STATE MANAGEMENT ===
let globalDebiturData = [];
let currentFilteredData = [];
let currentPage = 1;
const itemsPerPage = 10;

// Cek Sesi
if (localStorage.getItem('logged_in') !== 'true' || localStorage.getItem('user_role') !== 'admin') {
  window.location.href = 'login.html';
} else {
  const adminName = localStorage.getItem('user_name') || 'Admin';
  document.getElementById('welcomeAdmin').innerText = `Halo, ${adminName}!`;
}

// Inisialisasi Aplikasi
const initApp = async () => {
  const el = document.getElementById('manual_date');
  if (el) {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    el.value = today.toLocaleDateString('id-ID', options);
    el.dataset.date = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');
  }
  
  await loadCollectors(); // Tarik 5 Akun Kolektor
  await loadDebitur();    // Tarik Semua Data Debitur
};

initApp();

window.logout = function() {
  localStorage.clear();
  window.location.href = 'login.html';
}

window.switchTab = function(tabName) {
  document.getElementById('content-akun').classList.add('hidden');
  document.getElementById('content-debitur').classList.add('hidden');
  document.getElementById('content-penugasan').classList.add('hidden');
  
  document.getElementById('tab-akun').classList.remove('tab-active');
  document.getElementById('tab-debitur').classList.remove('tab-active');
  document.getElementById('tab-penugasan').classList.remove('tab-active');
  
  document.getElementById(`content-${tabName}`).classList.remove('hidden');
  document.getElementById(`tab-${tabName}`).classList.add('tab-active');
  
  if(tabName === 'debitur') {
    renderPage();
  } else if (tabName === 'penugasan') {
    runAssignFilter(); // Render list saat buka tab penugasan
  }
}

// =========================================
// LOGIKA MODAL EXCEL & UPLOAD
// =========================================

window.openExcelModal = function() {
  const modal = document.getElementById('modal-excel');
  const dateInput = document.getElementById('excel_date');
  const today = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  dateInput.value = today.toLocaleDateString('id-ID', options); 
  dateInput.dataset.date = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');
  modal.classList.remove('hidden');
}

window.closeExcelModal = function() {
  const modal = document.getElementById('modal-excel');
  modal.classList.add('hidden');
  document.getElementById('formUploadExcel').reset(); 
}

document.getElementById('formUploadExcel')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const clientName = document.getElementById('excel_client').value.trim();
  const fileInput = document.getElementById('excel_file');
  const submitBtn = e.target.querySelector('button');
  const isoUploadDate = document.getElementById('excel_date').dataset.date;
  
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    submitBtn.innerText = "Membaca & Parsing...";
    submitBtn.disabled = true;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const excelRows = XLSX.utils.sheet_to_json(worksheet);

        if (excelRows.length === 0) throw new Error("File Excel/CSV kosong.");
        submitBtn.innerText = `Menyimpan ${excelRows.length} Baris...`;

        const payload = excelRows.map(row => {
          return {
            tanggal_upload: isoUploadDate,
            client: clientName,
            debitur: row, 
            status: 'Pending'
          };
        });

        const { error } = await supabase.from('excel_debitur').insert(payload);
        if (error) throw error;

        alert(`✅ UPLOAD MASSAL SUKSES!\n\n${excelRows.length} data masuk ke DB.`);
        closeExcelModal();
        await loadDebitur(); // Tarik ulang data gabungan terbaru
      } catch (err) {
        alert(`❌ GAGAL UPLOAD!\n\nPesan Error: ${err.message}`);
      } finally {
        submitBtn.innerText = "Mulai Proses Parsing & Upload";
        submitBtn.disabled = false;
      }
    };
    reader.readAsArrayBuffer(file);
  }
});


// =========================================
// LOGIKA INPUT FORM MANUAL + 6 KOLOM LOKASI
// =========================================

window.addJsonField = function() {
  const container = document.getElementById('jsonb-fields-container');
  const newRow = document.createElement('div');
  newRow.className = "flex gap-2 json-row mt-2";
  newRow.innerHTML = `
    <input type="text" placeholder="Label" required class="json-key w-1/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-orange-500">
    <input type="text" placeholder="Isi Data..." required class="json-val w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500">
    <button type="button" onclick="this.parentElement.remove()" class="bg-red-100 text-red-500 px-3 rounded-lg font-bold">X</button>
  `;
  container.appendChild(newRow);
}

document.getElementById('formCollector')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button'); 
  btn.innerText = "Memproses...";
  
  const nameVal = document.getElementById('c_name').value.trim();
  const usernameVal = document.getElementById('c_user').value.trim();
  const passwordVal = document.getElementById('c_pass').value;
  const phoneVal = document.getElementById('c_phone').value.trim();
  const adminId = localStorage.getItem('user_id'); 

  try {
    const { error } = await supabase.from('users').insert([{ 
      name: nameVal, username: usernameVal, password: passwordVal, phone: phoneVal || null, role: 'collector', created_by: adminId 
    }]);
    if (error) throw error;
    alert(`✅ Akun Collector atas nama "${nameVal}" berhasil dibuat!`);
    e.target.reset(); 
    loadCollectors(); // Perbarui dropdown
  } catch (err) {
    alert("Gagal membuat akun: " + err.message);
  } finally {
    btn.innerText = "Simpan Akun Collector";
  }
});

document.getElementById('formEditDebitur')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.innerText = "Menyimpan Data...";

  const isoUploadDate = document.getElementById('manual_date').dataset.date;
  const namaKlien = document.getElementById('input_client').value.trim();
  const namaDebitur = document.getElementById('input_nama').value.trim();
  const nikDebitur = document.getElementById('input_nik').value.trim();
  const amount = document.getElementById('input_amount').value;
  const dueDate = document.getElementById('input_tgl').value;

  const alamatLengkap = document.getElementById('input_alamat').value.trim();
  const kelurahan = document.getElementById('input_kelurahan').value.trim();
  const kecamatan = document.getElementById('input_kecamatan').value.trim();
  const kota = document.getElementById('input_kota').value.trim();
  const kodepos = document.getElementById('input_kodepos').value.trim();
  const provinsi = document.getElementById('input_provinsi').value.trim();

  const jsonbData = { total_terutang: amount, jatuh_tempo: dueDate };

  const jsonRows = document.querySelectorAll('.json-row');
  jsonRows.forEach(row => {
    const keyInput = row.querySelector('.json-key') || row.querySelector('input[readonly]');
    const valInput = row.querySelector('.json-val');
    if (keyInput && valInput && valInput.value.trim() !== '') {
      const keyStr = keyInput.value.trim().replace(/\s+/g, '_').toLowerCase(); 
      jsonbData[keyStr] = valInput.value.trim();
    }
  });

  try {
    const { error } = await supabase.from('manual_debitur').insert([{
      tanggal_upload: isoUploadDate,
      client: namaKlien,
      name: namaDebitur,
      nik: nikDebitur,
      alamat_lengkap: alamatLengkap,
      kelurahan: kelurahan,
      kecamatan: kecamatan,
      kota_kabupaten: kota,
      kodepos: kodepos,
      provinsi: provinsi,
      contact_info: jsonbData
    }]);

    if (error) throw error;
    alert(`✅ Data Debitur ${namaDebitur} berhasil disimpan manual!`);
    e.target.reset();
    
    document.getElementById('jsonb-fields-container').innerHTML = `
      <div class="flex gap-2 json-row">
        <input type="text" value="No WhatsApp" readonly class="w-1/3 bg-slate-100 border border-slate-200 text-slate-500 rounded-lg px-3 py-2 text-xs font-semibold">
        <input type="text" placeholder="6281234..." required class="json-val w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500">
      </div>
    `;
    await loadDebitur(); 

  } catch (err) {
    alert("Gagal simpan debitur: " + err.message);
  } finally {
    btn.innerText = "Simpan Data Debitur (Manual) ke Database";
  }
});


// =========================================
// GABUNG DATA UNTUK TAB MANAJEMEN DEBITUR
// =========================================

async function loadDebitur() {
  const container = document.getElementById('admin-debitur-list');
  try {
    const { data: manualData, error: manualError } = await supabase.from('manual_debitur').select('*');
    if (manualError) throw manualError;
    
    const { data: excelData, error: excelError } = await supabase.from('excel_debitur').select('*');
    if (excelError) throw excelError;

    // Normalisasi Data (Sekaligus nyelipin label 'sumber_tabel' buat kebutuhan penugasan nanti)
    const normalizedManual = (manualData || []).map(d => ({ ...d, sumber_tabel: 'manual_debitur' }));
    
    const normalizedExcelData = (excelData || []).map(e => {
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
         sumber_tabel: 'excel_debitur' // Penanda identitas tabel
       };
    });

    let mergedData = [...normalizedManual, ...normalizedExcelData];
    mergedData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    globalDebiturData = mergedData; 
    currentFilteredData = [...globalDebiturData];
    currentPage = 1;
    
    populateFilterDropdowns(); 
    renderPage(); 
    runAssignFilter(); // Refresh tab penugasan juga
    
  } catch (err) {
    container.innerHTML = `<p class="text-red-500 py-4 text-center">Error: ${err.message}</p>`;
  }
}

// Bikin dropdown buat Tab 2 (Manajemen) dan Tab 3 (Penugasan)
function populateFilterDropdowns() {
  const uniqueClients = [...new Set(globalDebiturData.map(d => d.client))].filter(Boolean);
  
  const filterTab2 = document.getElementById('filter_client');
  const filterTab3 = document.getElementById('filter_assign_client');
  
  if(filterTab2) {
    filterTab2.innerHTML = `<option value="ALL">Semua Klien</option>`; 
    uniqueClients.forEach(c => filterTab2.innerHTML += `<option value="${c}">${c}</option>`);
  }
  if(filterTab3) {
    filterTab3.innerHTML = `<option value="ALL">Semua Klien</option>`; 
    uniqueClients.forEach(c => filterTab3.innerHTML += `<option value="${c}">${c}</option>`);
  }
}

window.filterList = function() {
  const selectedClient = document.getElementById('filter_client').value;
  if(selectedClient === 'ALL') {
      currentFilteredData = [...globalDebiturData]; 
  } else {
      currentFilteredData = globalDebiturData.filter(d => d.client === selectedClient);
  }
  currentPage = 1; 
  renderPage();
}

window.prevPage = function() { if (currentPage > 1) { currentPage--; renderPage(); } }
window.nextPage = function() { 
  if (currentPage < Math.ceil(currentFilteredData.length / itemsPerPage)) { currentPage++; renderPage(); } 
}

function renderPage() {
  const container = document.getElementById('admin-debitur-list');
  const counterBadge = document.getElementById('total-pending');
  const pagControls = document.getElementById('pagination-controls');
  const pageInfo = document.getElementById('page-info');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  
  const totalItems = currentFilteredData.length;
  
  if (totalItems === 0) {
    if(counterBadge) counterBadge.innerText = `0 Pending`;
    container.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center bg-white rounded-2xl border border-slate-200">Tidak ada kasus ditemukan.</p>`;
    pagControls.classList.add('hidden'); 
    return;
  }
  
  const maxPage = Math.ceil(totalItems / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = Math.min(startIdx + itemsPerPage, totalItems);
  const paginatedData = currentFilteredData.slice(startIdx, endIdx);
  
  if(counterBadge) counterBadge.innerText = `${totalItems} PENDING KASUS`;
  pagControls.classList.remove('hidden');
  pageInfo.innerText = `Menampilkan ${startIdx + 1} - ${endIdx} dari total ${totalItems} data`;
  btnPrev.disabled = currentPage === 1;
  btnNext.disabled = currentPage === maxPage;
  
  container.innerHTML = paginatedData.map(d => {
    const namaKlien = d.client || 'Tanpa Klien';
    // Ambil info alamat dari field langsung, atau dari dalam JSON contact_info jika dari excel
    const getKec = d.kecamatan || d.contact_info?.kecamatan || d.contact_info?.Kecamatan || '';
    const infoLokasi = getKec ? `📍 Kec. ${getKec}` : ''; 
    
    const ignoredKeys = ['total_terutang', 'jatuh_tempo'];
    const contactKeys = Object.keys(d.contact_info || {}).filter(k => !ignoredKeys.includes(k));
    const labels = contactKeys.map(key => `<span class="text-slate-400 bg-slate-50 border border-slate-100 text-[10px] px-2 py-0.5 rounded-full font-bold mr-1 mb-1 inline-block capitalize">${key.replace(/_/g, ' ')}</span>`).join('');
    
    return `
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
             <span class="text-[10px] font-black text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-full">🏢 ${namaKlien}</span>
             <span class="text-slate-400 text-[10px] font-bold border border-slate-200 px-2 py-0.5 rounded-full">📅 ${d.tanggal_upload}</span>
             <span class="text-[10px] text-slate-400 font-bold">${infoLokasi}</span>
          </div>
          <h3 class="font-black text-[#0B1B3D] text-[15px] uppercase leading-tight mb-0.5">${d.name}</h3>
          <p class="text-[11px] text-slate-500 font-bold">ID Akun: <span class="text-slate-700">${d.nik}</span></p>
        </div>
        <div class="w-full md:w-[40%] flex flex-wrap md:justify-end gap-1 mt-2 md:mt-0">
          ${labels || '-'}
        </div>
      </div>
    `;
  }).join('');
}


// =========================================
// JURUS BARU: TAB PENUGASAN KOLEKTOR
// =========================================

// Tarik data 5 Kolektor dari Database untuk Dropdown
async function loadCollectors() {
  try {
    const { data, error } = await supabase.from('users').select('*').eq('role', 'collector');
    if (error) throw error;
    
    const selectKol = document.getElementById('select_kolektor');
    if(!selectKol) return;
    
    // Reset isi dropdown biar ga numpuk
    selectKol.innerHTML = '<option value="">-- Pilih Kolektor --</option>';
    data.forEach(kol => {
       selectKol.innerHTML += `<option value="${kol.id}">${kol.name}</option>`;
    });
  } catch (error) {
    console.error("Gagal load kolektor: ", error.message);
  }
}

// Logika Menyaring Area Penugasan
window.runAssignFilter = function() {
  const client = document.getElementById('filter_assign_client').value;
  const kec = document.getElementById('filter_assign_kecamatan').value.toLowerCase();
  const kel = document.getElementById('filter_assign_kelurahan').value.toLowerCase();
  const pos = document.getElementById('filter_assign_kodepos').value.toLowerCase();
  
  const filtered = globalDebiturData.filter(d => {
    // Fungsi cerdas: Ngecek kolom luar, atau nyari ke dalam JSON kalau file dari excel
    const cekLokasi = (key) => (d[key] || d.contact_info?.[key] || d.contact_info?.[key.charAt(0).toUpperCase() + key.slice(1)] || '').toLowerCase();
    
    const matchClient = (client === 'ALL' || d.client === client);
    const matchKec = !kec || cekLokasi('kecamatan').includes(kec);
    const matchKel = !kel || cekLokasi('kelurahan').includes(kel);
    const matchPos = !pos || cekLokasi('kodepos').includes(pos);
    
    return matchClient && matchKec && matchKel && matchPos;
  });
  
  renderAssignList(filtered);
}

// Update hitungan Checkbox kalau ada yang dicentang
window.updateSelectedCount = function() {
  const checkedBoxes = document.querySelectorAll('.assign-checkbox:checked');
  const badge = document.getElementById('assign-selected-count');
  if(badge) badge.innerText = `${checkedBoxes.length} Dipilih`;
}

// Centang Semua
window.toggleAllAssign = function(sourceCheckbox) {
  const checkboxes = document.querySelectorAll('.assign-checkbox');
  checkboxes.forEach(cb => cb.checked = sourceCheckbox.checked);
  updateSelectedCount();
}

// Tampilkan List Checklist Penugasan
function renderAssignList(dataArray) {
  const container = document.getElementById('assign-debitur-list');
  
  if (dataArray.length === 0) {
    container.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center bg-white rounded-2xl border border-slate-200">Tidak ada debitur di area ini.</p>`;
    return;
  }
  
  // Karena penugasan butuh presisi, kita tampilkan semua hasil filter (tanpa limit pagination) 
  // agar admin bisa "Pilih Semua" dalam satu kecamatan
  container.innerHTML = `
    <div class="bg-blue-50 px-4 py-3 rounded-xl border border-blue-200 flex gap-3 items-center mb-2">
       <input type="checkbox" onclick="toggleAllAssign(this)" class="w-5 h-5 cursor-pointer accent-blue-600 rounded">
       <span class="text-xs font-black text-blue-900 uppercase">Pilih Semua (${dataArray.length} Debitur)</span>
    </div>
  ` + dataArray.map(d => {
    // Siapkan detail alamat untuk memudahkan admin milih rute
    const cekLokasi = (key) => (d[key] || d.contact_info?.[key] || d.contact_info?.[key.charAt(0).toUpperCase() + key.slice(1)] || '-');
    const fullAlamat = `${cekLokasi('alamat_lengkap')} | Kel. ${cekLokasi('kelurahan')} | Kec. ${cekLokasi('kecamatan')} | ${cekLokasi('kodepos')}`;
    
    // Value checkbox digabung sama sumber_tabel buat modal ke database
    const checkboxVal = `${d.id}|${d.sumber_tabel}`;
    
    return `
      <label class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 cursor-pointer hover:border-blue-400 transition-colors">
        <input type="checkbox" value="${checkboxVal}" onchange="updateSelectedCount()" class="assign-checkbox w-5 h-5 accent-blue-600 rounded">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
             <span class="text-[10px] font-black text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-full">🏢 ${d.client}</span>
             <span class="text-slate-400 text-[10px] font-bold">ID: ${d.nik}</span>
          </div>
          <h3 class="font-black text-[#0B1B3D] text-[15px] uppercase leading-tight">${d.name}</h3>
          <p class="text-[11px] text-slate-500 font-medium mt-1">📍 ${fullAlamat}</p>
        </div>
      </label>
    `;
  }).join('');
  
  updateSelectedCount(); // Reset badge ke 0
}

// EKSEKUSI TUGAS KE DATABASE (Tabel penugasan_kolektor)
window.submitPenugasan = async function() {
  const selectedKolektor = document.getElementById('select_kolektor').value;
  const checkedBoxes = document.querySelectorAll('.assign-checkbox:checked');
  
  if(!selectedKolektor) {
      alert("❌ Pilih nama kolektornya dulu bray!"); return;
  }
  if(checkedBoxes.length === 0) {
      alert("❌ Belum ada debitur yang dicentang!"); return;
  }
  
  // Rangkai Data Massal
  const payload = Array.from(checkedBoxes).map(cb => {
      const [debitur_id, sumber_tabel] = cb.value.split('|');
      return {
          collector_id: selectedKolektor,
          debitur_id: debitur_id,
          sumber_tabel: sumber_tabel,
          status: 'Ditugaskan'
      };
  });
  
  try {
      const { error } = await supabase.from('penugasan_kolektor').insert(payload);
      if (error) throw error;
      
      const kolName = document.getElementById('select_kolektor').options[document.getElementById('select_kolektor').selectedIndex].text;
      alert(`🚀 MANTAP!\n\nSebanyak ${payload.length} Debitur berhasil ditugaskan ke "${kolName}".\nOtomatis masuk ke HP kolektor tersebut!`);
      
      // Uncheck semua setelah sukses
      checkedBoxes.forEach(cb => cb.checked = false);
      updateSelectedCount();
      
  } catch (err) {
      alert("❌ Gagal menugaskan kolektor: " + err.message);
  }
}
