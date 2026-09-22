import { supabase } from './supabase.js';

// === STATE MANAGEMENT UNTUK PAGINATION ===
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

// Inisialisasi Tanggal Manual 
const initManualDate = () => {
  const el = document.getElementById('manual_date');
  if (el) {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    el.value = today.toLocaleDateString('id-ID', options);
    el.dataset.date = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0') + "-" + String(today.getDate()).padStart(2, '0');
  }
};
initManualDate();

window.logout = function() {
  localStorage.clear();
  window.location.href = 'login.html';
}

window.switchTab = function(tabName) {
  document.getElementById('content-akun').classList.add('hidden');
  document.getElementById('content-debitur').classList.add('hidden');
  document.getElementById(`content-${tabName}`).classList.remove('hidden');
  document.getElementById('tab-akun').classList.remove('tab-active');
  document.getElementById('tab-debitur').classList.remove('tab-active');
  document.getElementById(`tab-${tabName}`).classList.add('tab-active');
  
  if(tabName === 'debitur') loadDebitur();
}

// =========================================
// LOGIKA MODAL EXCEL
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

// Upload Excel -> Masuk ke excel_debitur
document.getElementById('formUploadExcel')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const clientName = document.getElementById('excel_client').value.trim();
  const fileInput = document.getElementById('excel_file');
  const submitBtn = e.target.querySelector('button');
  const isoUploadDate = document.getElementById('excel_date').dataset.date;
  
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    submitBtn.innerText = "Membaca & Parsing File...";
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
        // Disini belum kita panggil loadDebitur() karena list tabel sementara ngambil dari manual_debitur.
        // Jika perlu, gabungkan datanya nanti.
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
    <input type="text" placeholder="Label (Cth: Pekerjaan)" required class="json-key w-1/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-orange-500">
    <input type="text" placeholder="Isi Data..." required class="json-val w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500">
    <button type="button" onclick="this.parentElement.remove()" class="bg-red-100 text-red-500 px-3 rounded-lg font-bold hover:bg-red-200 transition-colors">X</button>
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
    if (error) {
      if (error.code === '23505') throw new Error("Username tersebut sudah digunakan.");
      throw error;
    }
    alert(`✅ Akun Collector atas nama "${nameVal}" berhasil dibuat!`);
    e.target.reset(); 
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

  const jsonbData = {
    total_terutang: amount,
    jatuh_tempo: dueDate
  };

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

    if (error) {
      if (error.code === '23505') throw new Error("NIK / ID Akun tersebut sudah terdaftar!");
      throw error;
    }

    alert(`✅ Data Debitur ${namaDebitur} berhasil disimpan manual!`);
    e.target.reset();
    
    document.getElementById('jsonb-fields-container').innerHTML = `
      <div class="flex gap-2 json-row">
        <input type="text" value="No WhatsApp" readonly class="w-1/3 bg-slate-100 border border-slate-200 text-slate-500 rounded-lg px-3 py-2 text-xs font-semibold">
        <input type="text" placeholder="6281234..." required class="json-val w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500">
      </div>
    `;
    initManualDate();
    loadDebitur(); 

  } catch (err) {
    alert("Gagal simpan debitur: " + err.message);
  } finally {
    btn.innerText = "Simpan Data Debitur (Manual) ke Database";
  }
});


// =========================================
// LOGIKA TAMPILAN DAFTAR DEBITUR & PAGINATION
// =========================================

async function loadDebitur() {
  const container = document.getElementById('admin-debitur-list');
  try {
    const { data, error } = await supabase.from('manual_debitur').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    
    globalDebiturData = data || []; 
    currentFilteredData = [...globalDebiturData];
    currentPage = 1;
    
    populateFilterDropdown(); 
    renderPage(); 
    
  } catch (err) {
    container.innerHTML = `<p class="text-sm text-red-500 w-full text-center py-4 bg-white rounded-2xl">Error: ${err.message}</p>`;
  }
}

function populateFilterDropdown() {
  const filterSelect = document.getElementById('filter_client');
  if(!filterSelect) return;
  
  const uniqueClients = [...new Set(globalDebiturData.map(d => d.client))].filter(Boolean);
  filterSelect.innerHTML = `<option value="ALL">Semua Klien</option>`; 
  uniqueClients.forEach(client => {
    filterSelect.innerHTML += `<option value="${client}">${client}</option>`;
  });
}

window.filterList = function() {
  const selectedClient = document.getElementById('filter_client').value;
  if(selectedClient === 'ALL') {
      currentFilteredData = [...globalDebiturData]; 
  } else {
      currentFilteredData = globalDebiturData.filter(d => d.client === selectedClient);
  }
  currentPage = 1; // Kembali ke halaman pertama tiap ganti filter
  renderPage();
}

// Fungsi Navigasi Pagination
window.prevPage = function() {
  if (currentPage > 1) {
    currentPage--;
    renderPage();
  }
}

window.nextPage = function() {
  const maxPage = Math.ceil(currentFilteredData.length / itemsPerPage);
  if (currentPage < maxPage) {
    currentPage++;
    renderPage();
  }
}

// Render data sesuai Halaman (Pagination)
function renderPage() {
  const container = document.getElementById('admin-debitur-list');
  const counterBadge = document.getElementById('total-pending');
  const pagControls = document.getElementById('pagination-controls');
  const pageInfo = document.getElementById('page-info');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  
  const totalItems = currentFilteredData.length;
  
  // Jika Kosong
  if (totalItems === 0) {
    if(counterBadge) counterBadge.innerText = `0 Pending`;
    container.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center bg-white rounded-2xl border border-slate-200">Tidak ada kasus ditemukan.</p>`;
    pagControls.classList.add('hidden'); // Sembunyikan tombol next/prev
    return;
  }
  
  // Hitung Data Halaman Ini
  const maxPage = Math.ceil(totalItems / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = Math.min(startIdx + itemsPerPage, totalItems);
  
  const paginatedData = currentFilteredData.slice(startIdx, endIdx);
  
  // Update Teks Counter & Pagination
  if(counterBadge) counterBadge.innerText = `${totalItems} PENDING KASUS`;
  pagControls.classList.remove('hidden');
  pageInfo.innerText = `Menampilkan ${startIdx + 1} - ${endIdx} dari total ${totalItems} data`;
  
  // Atur Tombol Mati/Nyala
  btnPrev.disabled = currentPage === 1;
  btnNext.disabled = currentPage === maxPage;
  
  // Render Baris Data
  container.innerHTML = paginatedData.map(d => {
    const namaKlien = d.client || 'Tanpa Klien';
    const kota = d.kota_kabupaten ? `📍 ${d.kota_kabupaten}` : ''; 
    
    const ignoredKeys = ['total_terutang', 'jatuh_tempo'];
    const contactKeys = Object.keys(d.contact_info || {}).filter(k => !ignoredKeys.includes(k));
    const labels = contactKeys.map(key => `<span class="text-slate-400 bg-slate-50 border border-slate-100 text-[10px] px-2 py-0.5 rounded-full font-bold mr-1 mb-1 inline-block capitalize">${key.replace(/_/g, ' ')}</span>`).join('');
    
    return `
      <!-- LIST MEMANJANG -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3 hover:border-orange-300 transition-colors">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
             <span class="text-[10px] font-black text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-full">🏢 ${namaKlien}</span>
             <span class="text-slate-400 text-[10px] font-bold border border-slate-200 px-2 py-0.5 rounded-full">📅 ${d.tanggal_upload}</span>
             <span class="text-[10px] text-slate-400 font-bold">${kota}</span>
          </div>
          <h3 class="font-black text-[#0B1B3D] text-[15px] uppercase leading-tight mb-0.5">${d.name}</h3>
          <p class="text-[11px] text-slate-500 font-bold">ID Akun: <span class="text-slate-700">${d.nik}</span></p>
        </div>
        <div class="w-full md:w-[40%] flex flex-wrap md:justify-end gap-1 mt-2 md:mt-0">
          ${labels || '<span class="text-[10px] text-slate-400">Tidak ada detail ekstra</span>'}
        </div>
      </div>
    `;
  }).join('');
}
