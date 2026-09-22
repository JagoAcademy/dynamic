import { supabase } from './supabase.js';

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

document.getElementById('formCollector')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button'); 
  btn.innerText = "Memproses...";
  const emailVal = document.getElementById('c_user').value;

  try {
    const { error } = await supabase.from('users').insert([
      { email: emailVal + '@aviando.local', name: emailVal, role: 'collector' }
    ]);
    if (error) throw error;
    alert(`✅ Akun Collector "${emailVal}" berhasil dibuat!`);
    e.target.reset();
  } catch (err) {
    alert("Gagal membuat akun: " + err.message);
  } finally {
    btn.innerText = "Simpan Akun Collector";
  }
});

async function loadDebitur() {
  const container = document.getElementById('admin-debitur-list');
  try {
    const { data, error } = await supabase.from('debtors').select('*');
    if (error) throw error;
    
    if (data.length === 0) {
      container.innerHTML = `<p class="text-sm text-slate-500 text-center py-4 lg:col-span-2">Database debitur kosong.</p>`;
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
    container.innerHTML = `<p class="text-sm text-red-500 lg:col-span-2">Error: ${err.message}</p>`;
  }
}
