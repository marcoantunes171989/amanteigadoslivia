// Mobile menu toggle
const toggle = document.getElementById('menuToggle');
const nav = document.getElementById('mainNav');

toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.classList.toggle('open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});

// Close menu when a link is clicked (mobile)
nav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  });
});

// Close menu with ESC (mobile)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav.classList.contains('open')) {
    nav.classList.remove('open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }
});

// Active link highlight on scroll (ids batem com os hrefs do menu:
// Cardápio é uma rota própria, /produtos, e não participa do scroll-spy)
const sections = ['inicio', 'encomendas', 'festas-momentos', 'personalizados-historia']
  .map(id => document.getElementById(id))
  .filter(Boolean);
const navLinks = [...nav.querySelectorAll('a')];

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + id));
    }
  });
}, { rootMargin: '-45% 0px -50% 0px' });

sections.forEach(s => observer.observe(s));

// Scroll-reveal effects (progressive enhancement: no JS => tudo visível)
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if ('IntersectionObserver' in window && !prefersReduced) {
  const revealEls = document.querySelectorAll('.moments-head, .card, .benefit, .diferencial, .catalog-cta, .brand-story, .feature-block, .step, .cta, .site-footer');
  revealEls.forEach(el => el.classList.add('will-reveal'));
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  revealEls.forEach(el => revealObserver.observe(el));
}
