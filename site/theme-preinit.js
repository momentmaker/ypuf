/* No-FOUC: set the theme before first paint from the saved choice, else the OS preference. */
(function () {
  try {
    var t = localStorage.getItem('ypuf-theme');
    if (t !== 'light' && t !== 'dark' && t !== 'star') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
