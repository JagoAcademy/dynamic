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

// Navigasi Tab
window.switchTab = function(tabName) {
  document.getElementById('content-akun').classList.add('hidden');
  document.getElementById('content-debitur').classList.add('hidden');
  document.getElementById(`content-${tabName}`).classList.remove('hidden');
  document.getElementById('tab-akun').classList.remove('tab-active');
  document.getElementById('tab-debitur').classList.remove('tab-active');
  document.getElementById(`tab-${tabName}`).classList.add('tab-active');
  
  if(tabName === 'debitur') loadDebitur();
}

// Form Buat Akun Collector
document.getElementById('formCollector')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button'); 
  btn.innerText = "Memproses...";
  
  // Ambil semua data real dari form HTML
  const nameVal = document.getElementById('c_name').value.trim();
  const usernameVal = document.getElementById('c_user').value.trim();
  const passwordVal = document.getElementById('c_pass').value;
  const phoneVal = document.getElementById('c_phone').value.trim();
  
  // Ambil ID admin yang sedang login buat direkam di kolom created_by
  const adminId = localStorage.getItem('user_id'); 

  try {
    const { error } = await supabase.from('users').insert([
      { 
        name: nameVal,
        username: usernameVal, 
        password: passwordVal, 
        phone: phoneVal || null, 
        role: 'collector',
        created_by: adminId 
      }
    ]);
    
    if (error) {
      // Menangkap error dari DB jika username sudah pernah dipakai
      if (error.code === '23505') {
        throw new Error("Username tersebut sudah digunakan, silakan pilih yang lain.");
      }
      throw error;
    }
    
    alert(`✅ Akun Collector atas nama "${nameVal}" berhasil dibuat!`);
    e.target.reset(); // Kosongkan form setelah sukses
  } catch (err) {
    alert("Gagal membuat akun: " + err.message);
  } finally {
    btn.innerText = "Simpan Akun Collector";
  }
});

// Load Daftar Debitur
async function loadDebitur() {
  const container = document.getElementById('admin-debitur-list');
  try {
    const { data, error } = await supabase.from('debtors').select('*');
    if (error) throw error;
    
    if (data.length === 0) {
      container.innerHTML = `<p class="text-sm text-slate-500 text-center py-4 col-span-full">Database debitur kosong.</p>`;
      return;
    }
    
    container.innerHTML = data.map(d => {
      const wa = d.contact_info?.wa || '-';
      return `
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <h3 class="font-bold text-[#0B1B3D] text-[14px] uppercase">${d.name}</h3>
            <p class="text-[11px] text-slate-500 font-medium">NIK: ${d.nik}</p>
            <p class="text-[11px] text-slate-500 font-medium">📱 WA: ${wa}</p>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p class="text-sm text-red-500 col-span-full">Error: ${err.message}</p>`;
  }
}
