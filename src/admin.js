import { supabase } from './supabase.js';

// Cek Sesi Admin
if (localStorage.getItem('logged_in') !== 'true' || localStorage.getItem('user_role') !== 'admin') {
  window.location.href = 'login.html';
} else {
  const adminName = localStorage.getItem('user_name') || 'Admin';
  document.getElementById('welcomeAdmin').innerText = `Halo, ${adminName}!`;
}

// Fungsi Logout
window.logout = function() {
  localStorage.clear();
  window.location.href = 'login.html';
}

// Navigasi Tab Utama
window.switchTab = function(tabName) {
  document.getElementById('content-akun').classList.add('hidden');
  document.getElementById('content-debitur').classList.add('hidden');
  document.getElementById(`content-${tabName}`).classList.remove('hidden');
  document.getElementById('tab-akun').classList.remove('tab-active');
  document.getElementById('tab-debitur').classList.remove('tab-active');
  document.getElementById(`tab-${tabName}`).classList.add('tab-active');
  
  if(tabName === 'debitur') loadDebitur();
}

// Navigasi Mode Input (Manual / Excel)
window.switchInputMode = function(mode) {
  const btnManual = document.getElementById('btn-mode-manual');
  const btnExcel = document.getElementById('btn-mode-excel');
  const containerManual = document.getElementById('form-manual-container');
  const containerExcel = document.getElementById('form-excel-container');

  if (mode === 'manual') {
    // Style aktif ke Manual
    btnManual.className = "bg-[#0B1B3D] text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all";
    btnExcel.className = "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 px-5 py-2.5 rounded-xl text-sm font-bold transition-all";
    containerManual.classList.remove('hidden');
    containerExcel.classList.add('hidden');
  } else {
    // Style aktif ke Excel
    btnExcel.className = "bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all";
    btnManual.className = "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 px-5 py-2.5 rounded-xl text-sm font-bold transition-all";
    containerExcel.classList.remove('hidden');
    containerManual.classList.add('hidden');
  }
}

// Tambah Field Detail Ekstra JSONB Secara Dinamis
window.addJsonField = function() {
  const container = document.getElementById('jsonb-fields-container');
  const newRow = document.createElement('div');
  newRow.className = "flex gap-2 json-row mt-2";
  newRow.innerHTML = `
    <input type="text" placeholder="Nama Label (Cth: Alamat)" required class="json-key w-1/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-orange-500">
    <input type="text" placeholder="Isi Data..." required class="json-val w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500">
    <button type="button" onclick="this.parentElement.remove()" class="bg-red-100 text-red-500 px-3 rounded-lg font-bold hover:bg-red-200">X</button>
  `;
  container.appendChild(newRow);
}

// Simulasi Upload Excel
window.handleExcelUpload = function(event) {
  const file = event.target.files[0];
  if (file) {
    alert(`File "${file.name}" terdeteksi!\n\n(Catatan Sistem: Modul parsing Excel seperti 'xlsx' akan diintegrasikan di tahap selanjutnya untuk membaca baris menjadi JSON secara otomatis).`);
    event.target.value = ''; // Reset input file
  }
}

// Form Buat Akun Collector
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

// Form Simpan Debitur & JSONB
document.getElementById('formEditDebitur')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.innerText = "Menyimpan Data...";

  // 1. Kumpulkan Data Standar
  const namaDebitur = document.getElementById('input_nama').value;
  const nikDebitur = document.getElementById('input_nik').value;
  const amount = document.getElementById('input_amount').value;
  const dueDate = document.getElementById('input_tgl').value;
  // Note: input_client belum di-insert ke DB pada demo ini krn relasi ke tabel clients & debts terpisah,
  // di real system, ini akan trigger insert berantai ke debtors -> debts.

  // 2. Rangkai Data JSONB Elastis
  const jsonbData = {};
  const jsonRows = document.querySelectorAll('.json-row');
  
  jsonRows.forEach(row => {
    // Row pertama (WA) punya input readonly tanpa class json-key, jadi kita tangani terpisah
    const keyInput = row.querySelector('.json-key') || row.querySelector('input[readonly]');
    const valInput = row.querySelector('.json-val');
    
    if (keyInput && valInput && valInput.value.trim() !== '') {
      const keyStr = keyInput.value.trim().replace(/\s+/g, '_').toLowerCase(); // Ubah "No WhatsApp" jadi "no_whatsapp"
      jsonbData[keyStr] = valInput.value.trim();
    }
  });

  try {
    // Eksekusi insert ke tabel debtors
    const { error } = await supabase.from('debtors').insert([{
      name: namaDebitur,
      nik: nikDebitur,
      contact_info: jsonbData
    }]);

    if (error) {
      if (error.code === '23505') throw new Error("NIK / ID Akun tersebut sudah terdaftar!");
      throw error;
    }

    alert(`✅ Data Debitur ${namaDebitur} berhasil disimpan!\nData JSON: ${JSON.stringify(jsonbData)}`);
    e.target.reset();
    
    // Hapus sisa field json tambahan
    document.getElementById('jsonb-fields-container').innerHTML = `
      <div class="flex gap-2 json-row">
        <input type="text" value="No WhatsApp" readonly class="w-1/3 bg-slate-100 border border-slate-200 text-slate-500 rounded-lg px-3 py-2 text-xs font-semibold">
        <input type="text" placeholder="6281234..." required class="json-val w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500">
      </div>
    `;
    loadDebitur(); // Refresh tabel

  } catch (err) {
    alert("Gagal simpan debitur: " + err.message);
  } finally {
    btn.innerText = "Simpan Data Debitur";
  }
});

// Load Daftar Debitur
async function loadDebitur() {
  const container = document.getElementById('admin-debitur-list');
  try {
    const { data, error } = await supabase.from('debtors').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    
    if (data.length === 0) {
      container.innerHTML = `<p class="text-sm text-slate-500 py-4 col-span-full text-center">Database debitur kosong.</p>`;
      return;
    }
    
    container.innerHTML = data.map(d => {
      // Menarik data JSON (mengakomodir key no_whatsapp atau format apapun yg ada)
      const contactKeys = Object.keys(d.contact_info || {});
      const labels = contactKeys.map(key => `<span class="bg-slate-100 text-slate-500 text-[10px] px-2 py-1 rounded font-bold mr-1">${key}</span>`).join('');
      
      return `
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
          <div>
            <h3 class="font-bold text-[#0B1B3D] text-[15px] uppercase">${d.name}</h3>
            <p class="text-[12px] text-slate-500 font-medium">ID Akun: ${d.nik}</p>
          </div>
          <div class="mt-2 pt-3 border-t border-slate-100">
            <p class="text-[10px] font-bold text-slate-400 uppercase mb-1">Data Tersedia:</p>
            <div class="flex flex-wrap">${labels || '-'}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p class="text-sm text-red-500 col-span-full">Error: ${err.message}</p>`;
  }
}
