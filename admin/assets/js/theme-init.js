// Admin theme before first paint: light unless the admin chose dark (separate from the public site's theme).
try { document.documentElement.dataset.theme = localStorage.getItem('adm_theme') === 'dark' ? 'dark' : 'light'; } catch { document.documentElement.dataset.theme = 'light'; }
