import { supabase } from './supabase.js';

// === INISIALISASI PDF.js WORKER UNTUK BACA PDF ===
if (window['pdfjs-dist/build/pdf']) {
    window.pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

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
  
  await loadCollectors(); 
  await loadDebitur();    
};

initApp();

window.logout = function() {
  localStorage.clear();
  window.location.href = 'login.html';
}


// =========================================
// SISTEM NAVIGASI SIDEBAR / TAB 
// =========================================
const navItems = document.querySelectorAll('.nav-item');
const sectionTabs = document.querySelectorAll('.section-tab');
const pageTitle = document.getElementById('pageTitle');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    navItems.forEach(nav => nav.classList.remove('active'));
    e.currentTarget.classList.add('active');

    const rawText = e.currentTarget.innerText;
    pageTitle.innerText = rawText.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F]/g, '').trim();

    const targetId = e.currentTarget.getAttribute('data-target');
    sectionTabs.forEach(tab => {
      tab.classList.remove('active');
      if (tab.id === targetId) tab.classList.add('active');
    });
    
    if(targetId === 'debitur') {
      renderPage();
    } else if (targetId === 'penugasan') {
      runAssignFilter(); 
    }

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
// JURUS KUNCI 1: FUNGSI PEMISAH ALAMAT OTOMATIS
// =========================================
function parseAlamat(alamatStr) {
  if (!alamatStr) return {};
  const str = String(alamatStr);
  const extract = (prefix) => {
    const rgx = new RegExp(`(?:${prefix})\\s*([a-zA-Z\\s]+?)(?:,|\\b(?:kec|kel|desa|kota|kab|prov)\\b|\\d{5}|$)`, 'i');
    const match = str.match(rgx);
    return match ? match[1].trim() : null;
  };
  return {
    kodepos: str.match(/\b\d{5}\b/)?.[0] || null,
    kelurahan: extract('kelurahan|kel\\.?|desa'),
    kecamatan: extract('kecamatan|kec\\.?'),
    kota_kabupaten: extract('kota|kabupaten|kab\\.?'),
    provinsi: extract('provinsi|prov\\.?')
  };
}


// =========================================
// JURUS KUNCI 2: PDF TEXT EXTRACTOR & TRANSLATOR
// =========================================
// Menerjemahkan isi teks PDF yang berantakan menjadi Format JSON Rapi
async function parsePDFToJSON(file) {
    if (!window.pdfjsLib) throw new Error("Library PDF.js belum termuat.");
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let extractedRows = [];

    // Baca Per Halaman
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Gabungkan semua teks dalam 1 halaman menjadi satu string panjang
        // (Bisa juga diurutkan berdasarkan Y axis kalau bentuknya tabel, tapi untuk teks form ini cukup)
        const pageText = textContent.items.map(item => item.str).join(' ');

        // Polisi Regex: Berburu Kata Kunci
        let rowData = { "_sumber": `PDF Halaman ${i}` };

        // 1. Cari Nama (Asumsi: "Nama : Budi Santoso")
        const matchNama = pageText.match(/(?:Nama Debitur|Nama|Name)\s*[:\-]?\s*([A-Z][A-Za-z\s]{2,40})/i);
        if (matchNama) rowData["Nama"] = matchNama[1].trim();

        // 2. Cari NIK/No Akun (Asumsi: "NIK : 357128919102")
        const matchNIK = pageText.match(/(?:NIK|No Akun|ID|KTP)\s*[:\-]?\s*(\d{10,16})/i);
        if (matchNIK) rowData["NIK"] = matchNIK[1].trim();

        // 3. Cari Total Uang (Asumsi: "Total Terutang : Rp 1.500.000")
        const matchUang = pageText.match(/(?:Tagihan|Terutang|Saldo|Amount)\s*[:\-]?\s*(?:Rp\.?\s*)?([\d\.,]+)/i);
        if (matchUang) rowData["Total Terutang"] = matchUang[1].trim().replace(/[^\d]/g, '');

        // 4. Cari Alamat (Agak panjang)
        const matchAlamat = pageText.match(/(?:Alamat|Address|Domisili)\s*[:\-]?\s*([^0-9][A-Za-z0-9\s,\.]+?(?:Kec|Kota|Kab|Kel|Desa)[A-Za-z0-9\s,\.]+)/i);
        if (matchAlamat) {
            rowData["Alamat Lengkap"] = matchAlamat[1].trim();
        } else {
            // Fallback klo gaada RT RW Kec, ambil string panjang setelah kata Alamat
            const fallbackAlamat = pageText.match(/(?:Alamat)\s*[:\-]?\s*([A-Za-z0-9\s\.\,\-\/]{15,100})/i);
            if(fallbackAlamat) rowData["Alamat Lengkap"] = fallbackAlamat[1].trim();
        }

        // 5. Cari No WA/Telp
        const matchTelp = pageText.match(/(?:Telp|WA|WhatsApp|No HP|Handphone)\s*[:\-]?\s*(\+?62\d{8,13}|08\d{8,11})/i);
        if (matchTelp) rowData["No WhatsApp"] = matchTelp[1].trim();

        // VALIDASI: Hanya simpan halaman jika ketemu NAMA atau NIK (Biar cover halaman kosong gak masuk)
        if (rowData["Nama"] || rowData["NIK"]) {
            extractedRows.push(rowData);
        }
    }

    if (extractedRows.length === 0) {
        throw new Error("Gagal menemukan data Debitur (Nama/NIK) di dalam PDF ini. Pastikan format teksnya bisa diblok/copy (bukan hasil scan gambar).");
    }

    return extractedRows;
}


// =========================================
// LOGIKA MODAL UPLOAD (EXCEL & PDF)
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

document.getElementById('formUploadExcel')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const clientName = document.getElementById('excel_client').value.trim();
  const fileInput = document.getElementById('excel_file');
  const submitBtn = document.getElementById('btnUploadProcess');
  const isoUploadDate = document.getElementById('excel_date').dataset.date;
  
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const isPDF = file.name.toLowerCase().endsWith('.pdf');
    
    submitBtn.innerText = isPDF ? "Sedang Menerjemahkan Teks PDF..." : "Membaca Data Excel...";
    submitBtn.disabled = true;

    try {
        let extractedRows = [];

        // CABANG LOGIKA: JIKA PDF vs JIKA EXCEL
        if (isPDF) {
            extractedRows = await parsePDFToJSON(file);
        } else {
            // Logika Excel (Lama)
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            extractedRows = XLSX.utils.sheet_to_json(worksheet);
        }

        if (!extractedRows || extractedRows.length === 0) throw new Error("File kosong atau tidak dapat diuraikan.");
        
        submitBtn.innerText = `Menyimpan ${extractedRows.length} Data ke Database...`;

        // NORMALISASI: Petakan data yang udah diekstrak ke dalam Payload Supabase
        const payload = extractedRows.map(row => {
          // Cari adakah kolom yang namanya ngandung kata "alamat"
          const alamatKey = Object.keys(row).find(k => k.toLowerCase().includes('alamat'));
          const alamatStr = alamatKey ? String(row[alamatKey]) : null;
          
          // Pecah alamat otomatis pakai jurus kita
          const locInfo = parseAlamat(alamatStr);

          return {
            tanggal_upload: isoUploadDate,
            client: clientName,
            alamat_lengkap: alamatStr,
            kelurahan: locInfo.kelurahan,
            kecamatan: locInfo.kecamatan,
            kota_kabupaten: locInfo.kota_kabupaten,
            kodepos: locInfo.kodepos,
            provinsi: locInfo.provinsi,
            debitur: row, // Seluruh data sisa (Nama, NIK, Uang) ngumpul di sini layaknya excel
            status: 'Pending'
          };
        });

        // Insert ke Supabase
        const { error } = await supabase.from('excel_debitur').insert(payload);
        if (error) throw error;

        alert(`✅ UPLOAD & TRANSLATE SUKSES!\n\n${extractedRows.length} data dari file ${isPDF ? 'PDF' : 'Excel/CSV'} berhasil diproses dan disimpan.`);
        closeExcelModal();
        await loadDebitur(); 

    } catch (err) {
        alert(`❌ GAGAL UPLOAD!\n\nPesan Error: ${err.message}`);
    } finally {
        submitBtn.innerText = "Mulai Proses & Upload Data";
        submitBtn.disabled = false;
    }
  }
});


// =========================================
// LOGIKA INPUT FORM MANUAL
// =========================================
window.addJsonField = function() {
  const container = document.getElementById('jsonb-fields-container');
  const newRow = document.createElement('div');
  newRow.className = "flex gap-2 json-row mt-2";
  newRow.innerHTML = `
    <input type="text" placeholder="Label (Cth: Agama)" required class="json-key w-1/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-orange-500">
    <input type="text" placeholder="Isi Data..." required class="json-val w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500">
    <button type="button" onclick="this.parentElement.remove()" class="bg-red-100 text-red-500 px-3 rounded-lg font-bold hover:bg-red-200">X</button>
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
    loadCollectors(); 
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
// GABUNG DATA & TAMPILKAN DAFTAR KASUS
// =========================================
async function loadDebitur() {
  const container = document.getElementById('admin-debitur-list');
  try {
    const { data: manualData, error: manualError } = await supabase.from('manual_debitur').select('*');
    if (manualError) throw manualError;
    
    const { data: excelData, error: excelError } = await supabase.from('excel_debitur').select('*');
    if (excelError) throw excelError;

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
         sumber_tabel: 'excel_debitur'
       };
    });

    let mergedData = [...normalizedManual, ...normalizedExcelData];
    mergedData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    globalDebiturData = mergedData; 
    currentFilteredData = [...globalDebiturData];
    currentPage = 1;
    
    populateFilterDropdowns(); 
    renderPage(); 
    runAssignFilter(); 
    
  } catch (err) {
    container.innerHTML = `<p class="text-red-500 py-4 text-center">Error: ${err.message}</p>`;
  }
}

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
    const getKec = d.kecamatan || '';
    const infoLokasi = getKec ? `📍 Kec. ${getKec}` : ''; 
    
    const ignoredKeys = ['total_terutang', 'jatuh_tempo', 'alamat_lengkap'];
    const contactKeys = Object.keys(d.contact_info || {}).filter(k => !ignoredKeys.includes(k.toLowerCase()) && !k.toLowerCase().includes('alamat'));
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
// TAB PENUGASAN KOLEKTOR
// =========================================
async function loadCollectors() {
  try {
    const { data, error } = await supabase.from('users').select('*').eq('role', 'collector');
    if (error) throw error;
    
    const selectKol = document.getElementById('select_kolektor');
    if(!selectKol) return;
    
    selectKol.innerHTML = '<option value="">-- Pilih Kolektor --</option>';
    data.forEach(kol => {
       selectKol.innerHTML += `<option value="${kol.id}">${kol.name}</option>`;
    });
  } catch (error) {
    console.error("Gagal load kolektor: ", error.message);
  }
}

window.runAssignFilter = function() {
  const client = document.getElementById('filter_assign_client').value;
  const kec = document.getElementById('filter_assign_kecamatan').value.toLowerCase();
  const kel = document.getElementById('filter_assign_kelurahan').value.toLowerCase();
  const pos = document.getElementById('filter_assign_kodepos').value.toLowerCase();
  
  const filtered = globalDebiturData.filter(d => {
    const cekLokasi = (key) => (d[key] || '').toLowerCase();
    
    const matchClient = (client === 'ALL' || d.client === client);
    const matchKec = !kec || cekLokasi('kecamatan').includes(kec);
    const matchKel = !kel || cekLokasi('kelurahan').includes(kel);
    const matchPos = !pos || cekLokasi('kodepos').includes(pos);
    
    return matchClient && matchKec && matchKel && matchPos;
  });
  
  renderAssignList(filtered);
}

window.updateSelectedCount = function() {
  const checkedBoxes = document.querySelectorAll('.assign-checkbox:checked');
  const badge = document.getElementById('assign-selected-count');
  if(badge) badge.innerText = `${checkedBoxes.length} Dipilih`;
}

window.toggleAllAssign = function(sourceCheckbox) {
  const checkboxes = document.querySelectorAll('.assign-checkbox');
  checkboxes.forEach(cb => cb.checked = sourceCheckbox.checked);
  updateSelectedCount();
}

function renderAssignList(dataArray) {
  const container = document.getElementById('assign-debitur-list');
  
  if (dataArray.length === 0) {
    container.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center bg-white rounded-2xl border border-slate-200">Tidak ada debitur di area ini.</p>`;
    return;
  }
  
  container.innerHTML = `
    <div class="bg-blue-50 px-4 py-3 rounded-xl border border-blue-200 flex gap-3 items-center mb-2">
       <input type="checkbox" onclick="toggleAllAssign(this)" class="w-5 h-5 cursor-pointer accent-blue-600 rounded">
       <span class="text-xs font-black text-blue-900 uppercase">Pilih Semua (${dataArray.length} Debitur)</span>
    </div>
  ` + dataArray.map(d => {
    const cekLokasi = (val, label) => val ? `${label} ${val}` : '';
    const arrLokasi = [
        d.alamat_lengkap || '-',
        cekLokasi(d.kelurahan, 'Kel.'),
        cekLokasi(d.kecamatan, 'Kec.'),
        d.kodepos || ''
    ].filter(Boolean);
    
    const fullAlamat = arrLokasi.join(' | ');
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
  
  updateSelectedCount(); 
}

window.submitPenugasan = async function() {
  const selectedKolektor = document.getElementById('select_kolektor').value;
  const checkedBoxes = document.querySelectorAll('.assign-checkbox:checked');
  
  if(!selectedKolektor) {
      alert("❌ Pilih nama kolektornya dulu bray!"); return;
  }
  if(checkedBoxes.length === 0) {
      alert("❌ Belum ada debitur yang dicentang!"); return;
  }
  
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
      alert(`🚀 MANTAP!\n\nSebanyak ${payload.length} Debitur berhasil ditugaskan ke "${kolName}".`);
      
      checkedBoxes.forEach(cb => cb.checked = false);
      updateSelectedCount();
      
  } catch (err) {
      alert("❌ Gagal menugaskan kolektor: " + err.message);
  }
}
