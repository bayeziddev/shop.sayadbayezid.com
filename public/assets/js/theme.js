// Runs in <head> before paint to avoid a theme flash.
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.setAttribute('data-theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  } catch (e) {}
})();
