import { supabase } from './supabase.js';

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const errorMsg = document.getElementById('errorMsg');
  btn.innerText = "Memeriksa...";
  errorMsg.classList.add('hidden');

  const username = document.getElementById('username').value;
  // Karena struktur database kita pakai email untuk login:
  const targetEmail = username.includes('@') ? username : username + '@aviando.local';

  try {
    // Simulasi pengecekan sederhana dari tabel users berdasarkan email
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', targetEmail)
      .single();

    if (error || !data) {
      throw new Error("Kredensial tidak ditemukan.");
    }

    // Set LocalStorage untuk sesi
    localStorage.setItem('logged_in', 'true');
    localStorage.setItem('user_id', data.id);
    localStorage.setItem('user_name', data.name);
    localStorage.setItem('user_role', data.role);

    // Redirect berdasarkan role
    if (data.role === 'admin') window.location.href = 'admin.html';
    else if (data.role === 'owner') window.location.href = 'owner.html';
    else if (data.role === 'collector') window.location.href = 'collector.html';
    else throw new Error("Role tidak dikenali.");

  } catch (err) {
    errorMsg.innerText = "Username atau password salah!";
    errorMsg.classList.remove('hidden');
    console.error(err);
  } finally {
    btn.innerText = "Login Sekarang";
  }
});
