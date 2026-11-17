/* Bloqueia zoom por gesto (pinch) em smartphones. Viewport + font 16px cobrem o resto. */
(function () {
  var ua = navigator.userAgent || '';
  var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var mobile = coarse || /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua);
  if (!mobile) return;

  function block(e) {
    if (e.cancelable) e.preventDefault();
  }

  document.addEventListener('gesturestart', block, { passive: false });
  document.addEventListener('gesturechange', block, { passive: false });
  document.addEventListener('gestureend', block, { passive: false });
  document.documentElement.classList.add('no-zoom-mobile');
})();
