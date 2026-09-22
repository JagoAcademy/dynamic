import { supabase } from './supabase.js';

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const btn = document.getElementById('submitBtn');
  const errorMsg = document.getElementById('errorMsg');
  
  // 1. Mengubah status tombol menjadi loading & sembunyikan error lama
  if (btn) {
    btn.innerText = "Memeriksa...";
    btn.disabled = true;
  }
  if (errorMsg) {
    errorMsg.classList.add('hidden');
  }

  // 2. Mengambil data input dari elemen HTML halaman login
  const usernameInput = document.getElementById('username')?.value || '';
  const passwordInput = document.getElementById('password')?.value || '';

  // Bersihkan spasi di ujung teks input username bray
  const cleanUsername = usernameInput.trim();

  try {
    // 3. Eksekusi pencarian data langsung ke tabel users internal KPI
    // Menggunakan .ilike agar login tetap tembus meskipun user mengetik huruf besar/kecil (contoh: Owner / OWNER)
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', cleanUsername)
      .eq('password', passwordInput)
      .single();

    // Jika data kosong atau query Supabase eror, lempar ke blok catch
    if (error || !data) {
      throw new Error("Kredensial tidak cocok atau akun tidak terdaftar.");
    }

    // 4. Perekaman data sesi ke LocalStorage Browser jika login sukses
    localStorage.setItem('logged_in', 'true');
    localStorage.setItem('user_id', data.id);
    localStorage.setItem('user_name', data.name);
    localStorage.setItem('user_role', data.role);

    // 5. Pengalihan Halaman Multi-role secara Akurat
    if (data.role === 'admin') {
      window.location.href = 'admin.html';
    } else if (data.role === 'owner') {
      window.location.href = 'owner.html';
    } else if (data.role === 'collector') {
      window.location.href = 'collector.html';
    } else {
      throw new Error("Tingkat hak akses (role) tidak dikenali.");
    }

  } catch (err) {
    // 6. Tampilkan pesan eror ke user jika validasi gagal
    if (errorMsg) {
      errorMsg.innerText = "Username atau password salah!";
      errorMsg.classList.remove('hidden');
    }
    console.error("Detail Eror Login:", err);
  } finally {
    // 7. Kembalikan status tombol ke semula
    if (btn) {
      btn.innerText = "Login Sekarang";
      btn.disabled = false;
    }
  }
});
