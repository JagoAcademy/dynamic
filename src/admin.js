import { supabase } from './supabase.js';

// Cek Sesi Admin
if (localStorage.getItem('logged_in') !== 'true' || localStorage.getItem('user_role') !== 'admin') {
  window.location.href = 'login.html';
} else {
  const adminName = localStorage.getItem('user_name') || 'Admin';
  document.getElementById('welcomeAdmin').innerText = `Halo, ${adminName}!`;
}

// Inisialisasi Tanggal Manual saat web dirender
const initManualDate = () => {
  const el = document.getElementById('manual_date');
  if (el) {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    el.value = today.toLocaleDateString('id-ID', options);
    el.dataset.date = today.toISOString().split('T')[0]; // Format standard YYYY-MM-DD untuk DB
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

// Menangani klik tombol submit dan menyuntikkan tanggal_upload
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

        // Menyuntikkan tanggal_upload ke setiap row sebelum di-insert
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

        alert(`✅ SUCCESS MAGIC DONE!\n\nSebanyak ${excelRows.length} data berhasil terikat dengan Tanggal Upload: ${isoUploadDate} dan tersimpan di DB.`);
        closeExcelModal();
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

  // Hapus 'klien_asal' dari sini karena udah punya kolom sendiri
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
      client: namaKlien, // Kolom client sekarang berdiri sendiri secara gagah
      name: namaDebitur,
      nik: nikDebitur,
      contact_info: jsonbData
    }]);

    if (error) {
      if (error.code === '23505') throw new Error("NIK / ID Akun tersebut sudah terdaftar!");
      throw error;
    }

    alert(`✅ Data Debitur ${namaDebitur} berhasil disimpan dengan Tanggal Upload: ${isoUploadDate}`);
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
    btn.innerText = "Simpan Data Debitur ke Database";
  }
});

// Load Daftar Debitur
async function loadDebitur() {
  const container = document.getElementById('admin-debitur-list');
  try {
    const { data, error } = await supabase.from('manual_debitur').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    
    if (data.length === 0) {
      container.innerHTML = `<p class="text-sm text-slate-500 py-4 col-span-full text-center">Database debitur kosong.</p>`;
      return;
    }
    
    container.innerHTML = data.map(d => {
      // Sekarang tarik namaKlien dari d.client asli database
      const namaKlien = d.client || 'Klien Tidak Diketahui';
      const ignoredKeys = ['total_terutang', 'jatuh_tempo'];
      const contactKeys = Object.keys(d.contact_info || {}).filter(k => !ignoredKeys.includes(k));
      const labels = contactKeys.map(key => `<span class="bg-slate-100 text-slate-500 text-[10px] px-2 py-1 rounded font-bold mr-1 mb-1 inline-block">${key}</span>`).join('');
      
      return `
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div class="flex justify-between items-start mb-2">
               <p class="text-[11px] font-black text-orange-600 uppercase tracking-wider">🏢 ${namaKlien}</p>
               <span class="bg-blue-50 text-blue-600 border border-blue-200 text-[9px] font-bold px-2 py-1 rounded shadow-sm">📅 ${d.tanggal_upload}</span>
            </div>
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
