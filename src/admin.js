import { supabase } from './supabase.js';

// Variabel Global buat nyimpen data biar gampang difilter di sisi client (browser) tanpa manggil database berkali-kali
let globalDebiturData = [];

if (localStorage.getItem('logged_in') !== 'true' || localStorage.getItem('user_role') !== 'admin') {
  window.location.href = 'login.html';
} else {
  const adminName = localStorage.getItem('user_name') || 'Admin';
  document.getElementById('welcomeAdmin').innerText = `Halo, ${adminName}!`;
}

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
// LOGIKA POP-UP UPLOAD EXCEL 
// =========================================

window.openExcelModal = function() {
  const modal = document.getElementById('modal-excel');
  const dateInput = document.getElementById('excel_date');
  
  const today = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  dateInput.value = today.toLocaleDateString('id-ID', options); 
  dateInput.dataset.date = today.toISOString().split('T')[0];
  
  modal.classList.remove('hidden');
}

window.closeExcelModal = function() {
  const modal = document.getElementById('modal-excel');
  modal.classList.add('hidden');
  document.getElementById('formUploadExcel').reset(); 
}

// Menangani klik tombol submit Excel
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

        alert(`✅ SUCCESS MAGIC DONE!\n\nSebanyak ${excelRows.length} data berhasil tersimpan di DB.`);
        closeExcelModal();
        loadDebitur(); // Refresh data!
      } catch (err) {
        alert(`❌ GAGAL PARSING EXCEL!\n\nPesan Error: ${err.message}`);
      } finally {
        submitBtn.innerText = "Mulai Proses Parsing & Upload";
        submitBtn.disabled = false;
      }
    };
    reader.readAsArrayBuffer(file);
  }
});


// =========================================
// LOGIKA TAMPILAN DAFTAR DEBITUR & FILTER
// =========================================

// Menarik data debitur asli dari tabel `manual_debitur` (sebagai contoh, kalau lu pakai excel_debitur, tinggal diubah)
async function loadDebitur() {
  const container = document.getElementById('admin-debitur-list');
  try {
    const { data, error } = await supabase.from('manual_debitur').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    
    globalDebiturData = data || []; // Simpan ke variabel global buat difilter lokal
    
    populateFilterDropdown(); // Siapkan pilihan Client di dropdown
    renderList(globalDebiturData); // Tampilkan datanya
    
  } catch (err) {
    container.innerHTML = `<p class="text-sm text-red-500 w-full text-center">Error: ${err.message}</p>`;
  }
}

// Bikin isi Dropdown Filter secara dinamis biar unik (Cuma munculin Bank X & Bank Y sekali aja)
function populateFilterDropdown() {
  const filterSelect = document.getElementById('filter_client');
  if(!filterSelect) return;
  
  // Ambil semua nama client dari data dan bikin unik (menghapus duplikat)
  const uniqueClients = [...new Set(globalDebiturData.map(d => d.client))].filter(Boolean);
  
  filterSelect.innerHTML = `<option value="ALL">Semua Klien</option>`; // Reset dengan opsi 'Semua'
  
  uniqueClients.forEach(client => {
    filterSelect.innerHTML += `<option value="${client}">${client}</option>`;
  });
}

// Fungsi yg dipanggil pas admin ganti pilihan di Dropdown
window.filterList = function() {
  const selectedClient = document.getElementById('filter_client').value;
  
  if(selectedClient === 'ALL') {
      renderList(globalDebiturData); // Tampil semua
  } else {
      // Saring (filter) data yang nama client-nya cocok aja
      const filteredData = globalDebiturData.filter(d => d.client === selectedClient);
      renderList(filteredData);
  }
}

// Render data ke layar (Format Baris Panjang, limit 10 aja)
function renderList(dataArray) {
  const container = document.getElementById('admin-debitur-list');
  const counterBadge = document.getElementById('total-pending');
  
  // Update badge total data sesuai jumlah data yg lagi difilter
  if(counterBadge) counterBadge.innerText = `${dataArray.length} Kasus`;
  
  if (dataArray.length === 0) {
    container.innerHTML = `<p class="text-sm text-slate-500 py-4 text-center bg-white rounded-2xl border border-slate-200">Tidak ada kasus ditemukan.</p>`;
    return;
  }
  
  // Batasi hanya menampilkan 10 data paling atas
  const limitedData = dataArray.slice(0, 10);
  
  container.innerHTML = limitedData.map(d => {
    const namaKlien = d.client || 'Tanpa Klien';
    
    // Ambil isi metadata JSON dan buang yg nggak penting diliatin ke list utama
    const ignoredKeys = ['total_terutang', 'jatuh_tempo'];
    const contactKeys = Object.keys(d.contact_info || {}).filter(k => !ignoredKeys.includes(k));
    
    // Bikin label key JSON-nya jadi jejeran label rapi
    const labels = contactKeys.map(key => `<span class="text-slate-400 bg-slate-50 border border-slate-100 text-[10px] px-2 py-0.5 rounded-full font-bold mr-1 mb-1 inline-block capitalize">${key.replace(/_/g, ' ')}</span>`).join('');
    
    return `
      <!-- LIST MEMANJANG (BUKAN CARD) -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3 hover:border-orange-300 transition-colors">
        
        <!-- Bagian Kiri: Identitas -->
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
             <span class="text-[10px] font-black text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-full">🏢 ${namaKlien}</span>
             <span class="text-slate-400 text-[10px] font-bold border border-slate-200 px-2 py-0.5 rounded-full">📅 ${d.tanggal_upload}</span>
          </div>
          <h3 class="font-black text-[#0B1B3D] text-[15px] uppercase leading-tight mb-0.5">${d.name}</h3>
          <p class="text-[11px] text-slate-500 font-bold">ID Akun: <span class="text-slate-700">${d.nik}</span></p>
        </div>
        
        <!-- Bagian Kanan: Metadata JSON -->
        <div class="w-full md:w-[40%] flex flex-wrap md:justify-end gap-1 mt-2 md:mt-0">
          ${labels || '<span class="text-[10px] text-slate-400">Tidak ada detail ekstra</span>'}
        </div>
        
      </div>
    `;
  }).join('');
}
