// Светлая/тёмная тема — переключатель (#themeToggle) + сохранение в localStorage.
// Подключать в <head>, ДО <link rel="stylesheet">, обычным <script> (не defer/async),
// чтобы data-theme проставлялся до первой отрисовки и не было мигания белым при загрузке.
(function () {
  var STORAGE_KEY = 'jetishub-theme';
  var root = document.documentElement;

  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function apply(theme) {
    root.setAttribute('data-theme', theme);
  }

  apply(getStored() || (systemPrefersDark() ? 'dark' : 'light'));

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    function sync() {
      btn.setAttribute('aria-pressed', String(root.getAttribute('data-theme') === 'dark'));
    }
    sync();
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
      sync();
    });
  });
})();
