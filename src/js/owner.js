// Cek kalau belum login atau rolenya bukan owner
if (localStorage.getItem('logged_in') !== 'true' || localStorage.getItem('user_role') !== 'owner') {
    window.location.href = 'login.html'; 
} else {
    document.getElementById('welcomeOwner').innerText = `Halo, ${localStorage.getItem('user_name')}!`;
}

// Fitur Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'login.html';
});
