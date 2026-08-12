import { supabase } from '../supabase.js';

const loginForm = document.getElementById('loginForm');
const errorMsg = document.getElementById('errorMsg');
const submitBtn = document.getElementById('submitBtn');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault(); 
  
  submitBtn.innerHTML = 'Memeriksa...';
  submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
  errorMsg.classList.add('hidden');

  const userVal = document.getElementById('username').value;
  const passVal = document.getElementById('password').value;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', userVal)
      .eq('password', passVal)
      .single(); 

    if (error || !data) throw new Error('Gagal login');

    // Simpan sesi global
    localStorage.setItem('logged_in', 'true');
    localStorage.setItem('user_name', data.username);
    localStorage.setItem('user_role', data.role); 
    
    // Redirect berdasarkan role
    if (data.role === 'coach') {
        window.location.href = 'coach.html';
    } else if (data.role === 'parent') {
        window.location.href = 'parent.html';
    } else if (data.role === 'admin') {
        window.location.href = 'admin.html';
    } else if (data.role === 'owner') {
        window.location.href = 'owner.html'; // Tembusan buat Bos!
    } else {
        alert("Role tidak dikenali!");
        submitBtn.innerHTML = 'Login Sekarang';
        submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
    }

  } catch (err) {
    errorMsg.classList.remove('hidden');
    submitBtn.innerHTML = 'Login Sekarang';
    submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
  }
});
