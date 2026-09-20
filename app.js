// Mobile menu toggle
const toggle = document.getElementById('menuToggle');
const nav = document.getElementById('mainNav');
const backdrop = document.getElementById('navBackdrop');

function setMenuOpen(open) {
  if (!toggle || !nav) return;
  nav.classList.toggle('open', open);
  toggle.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  document.body.classList.toggle('nav-locked', open);
  if (backdrop) {
    backdrop.hidden = !open;
    backdrop.classList.toggle('is-open', open);
  }
}

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    setMenuOpen(!nav.classList.contains('open'));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMenuOpen(false));
  });

  backdrop?.addEventListener('click', () => setMenuOpen(false));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) {
      setMenuOpen(false);
      toggle.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!nav.classList.contains('open')) return;
    if (nav.contains(e.target) || toggle.contains(e.target)) return;
    setMenuOpen(false);
  });
}

// Active link highlight on scroll (ids batem com os hrefs do menu:
// Cardápio é uma rota própria, /produtos, e não participa do scroll-spy)
const sections = ['inicio', 'encomendas', 'festas-momentos', 'personalizados-historia']
  .map((id) => document.getElementById(id))
  .filter(Boolean);
const navLinks = nav ? [...nav.querySelectorAll('a')] : [];

if (sections.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach((l) => {
          const active = l.getAttribute('href') === '#' + id;
          l.classList.toggle('active', active);
          if (active) l.setAttribute('aria-current', 'page');
          else l.removeAttribute('aria-current');
        });
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });

  sections.forEach((s) => observer.observe(s));
}

// Scroll-reveal effects (progressive enhancement: no JS => tudo visível)
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if ('IntersectionObserver' in window && !prefersReduced) {
  const revealEls = document.querySelectorAll('.moments-head, .card, .benefit, .diferencial, .catalog-cta, .brand-story, .feature-block, .step, .cta, .site-footer');
  revealEls.forEach((el) => el.classList.add('will-reveal'));
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  revealEls.forEach((el) => revealObserver.observe(el));
}
