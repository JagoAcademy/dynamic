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

// =========================================
// LOGIKA POP-UP UPLOAD EXCEL
// =========================================

window.openExcelModal = function() {
  const modal = document.getElementById('modal-excel');
  const dateInput = document.getElementById('excel_date');
  
  const today = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  dateInput.value = today.toLocaleDateString('id-ID', options); 
  
  modal.classList.remove('hidden');
}

window.closeExcelModal = function() {
  const modal = document.getElementById('modal-excel');
  modal.classList.add('hidden');
  document.getElementById('formUploadExcel').reset(); 
}

// Menangani klik tombol submit di Pop-up Excel
document.getElementById('formUploadExcel')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const clientName = document.getElementById('excel_client').value.trim();
  const fileInput = document.getElementById('excel_file');
  
  if (fileInput.files.length > 0) {
    const fileName = fileInput.files[0].name;
    alert(`✅ BERHASIL DITERIMA!\n\nFile Excel: "${fileName}"\nKlien: "${clientName}"\nTanggal: ${document.getElementById('excel_date').value}\n\n(Catatan: Integrasi parsing tabel Excel akan diarahkan ke tabel "excel_debitur" di tahap berikutnya).`);
    closeExcelModal();
  }
});

// =========================================
// LOGIKA INPUT MANUAL DEBITUR & AKUN
// =========================================

window.addJsonField = function() {
  const container = document.getElementById('jsonb-fields-container');
  const newRow = document.createElement('div');
  newRow.className = "flex gap-2 json-row mt-2";
  newRow.innerHTML = `
    <input type="text" placeholder="Label (Cth: Alamat)" required class="json-key w-1/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-orange-500">
    <input type="text" placeholder="Isi Data..." required class="json-val w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500">
    <button type="button" onclick="this.parentElement.remove()" class="bg-red-100 text-red-500 px-3 rounded-lg font-bold hover:bg-red-200 transition-colors">X</button>
  `;
  container.appendChild(newRow);
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

// Form Simpan Debitur Manual & JSONB
document.getElementById('formEditDebitur')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.innerText = "Menyimpan Data...";

  const namaKlien = document.getElementById('input_client').value.trim();
  const namaDebitur = document.getElementById('input_nama').value.trim();
  const nikDebitur = document.getElementById('input_nik').value.trim();
  const amount = document.getElementById('input_amount').value;
  const dueDate = document.getElementById('input_tgl').value;

  const jsonbData = {
    klien_asal: namaKlien,
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
    // Arahkan insert ke tabel baru: manual_debitur
    const { error } = await supabase.from('manual_debitur').insert([{
      name: namaDebitur,
      nik: nikDebitur,
      contact_info: jsonbData
    }]);

    if (error) {
      if (error.code === '23505') throw new Error("NIK / ID Akun tersebut sudah terdaftar!");
      throw error;
    }

    alert(`✅ Data Debitur ${namaDebitur} dari Klien ${namaKlien} berhasil disimpan!`);
    e.target.reset();
    
    document.getElementById('jsonb-fields-container').innerHTML = `
      <div class="flex gap-2 json-row">
        <input type="text" value="No WhatsApp" readonly class="w-1/3 bg-slate-100 border border-slate-200 text-slate-500 rounded-lg px-3 py-2 text-xs font-semibold">
        <input type="text" placeholder="6281234..." required class="json-val w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500">
      </div>
    `;
    loadDebitur();

  } catch (err) {
    alert("Gagal simpan debitur: " + err.message);
  } finally {
    btn.innerText = "Simpan Data Debitur ke Database";
  }
});

// Load Daftar Debitur dari tabel manual_debitur
async function loadDebitur() {
  const container = document.getElementById('admin-debitur-list');
  try {
    // Arahkan tarikan data dari tabel baru: manual_debitur
    const { data, error } = await supabase.from('manual_debitur').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    
    if (data.length === 0) {
      container.innerHTML = `<p class="text-sm text-slate-500 py-4 col-span-full text-center">Database debitur kosong.</p>`;
      return;
    }
    
    container.innerHTML = data.map(d => {
      const namaKlien = d.contact_info?.klien_asal || 'Klien Tidak Diketahui';
      const ignoredKeys = ['klien_asal', 'total_terutang', 'jatuh_tempo'];
      const contactKeys = Object.keys(d.contact_info || {}).filter(k => !ignoredKeys.includes(k));
      const labels = contactKeys.map(key => `<span class="bg-slate-100 text-slate-500 text-[10px] px-2 py-1 rounded font-bold mr-1 mb-1 inline-block">${key}</span>`).join('');
      
      return `
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <p class="text-[11px] font-black text-orange-600 uppercase tracking-wider mb-1">🏢 ${namaKlien}</p>
            <h3 class="font-bold text-[#0B1B3D] text-[16px] uppercase mb-1">${d.name}</h3>
            <p class="text-[12px] text-slate-500 font-medium mb-3">ID Akun: <span class="font-bold text-slate-700">${d.nik}</span></p>
          </div>
          <div class="mt-2 pt-3 border-t border-slate-100">
            <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">Detail Metadata JSON Tersedia:</p>
            <div class="flex flex-wrap">${labels || '-'}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p class="text-sm text-red-500 col-span-full">Error: ${err.message}</p>`;
  }
}
