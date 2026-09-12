document.documentElement.classList.add('js');
document.querySelector('#currentYear').textContent = new Date().getFullYear();

const header = document.querySelector('.site-header');
const revealElements = document.querySelectorAll('.reveal');
const emblem = document.querySelector('.poller-emblem');

function updateHeader() {
  header.classList.toggle('is-scrolled', window.scrollY > 24);
}

window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

if (emblem && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let frame;

  function updateEmblem(event) {
    const bounds = emblem.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      emblem.style.setProperty('--pointer-x', `${x * 100}%`);
      emblem.style.setProperty('--pointer-y', `${y * 100}%`);
      emblem.style.setProperty('--tilt-x', `${(0.5 - y) * 15}deg`);
      emblem.style.setProperty('--tilt-y', `${(x - 0.5) * 15}deg`);
      emblem.style.setProperty('--shift-x', `${(x - 0.5) * 18}px`);
      emblem.style.setProperty('--shift-y', `${(y - 0.5) * 18}px`);
    });
  }

  function resetEmblem() {
    emblem.style.removeProperty('--pointer-x');
    emblem.style.removeProperty('--pointer-y');
    emblem.style.removeProperty('--tilt-x');
    emblem.style.removeProperty('--tilt-y');
    emblem.style.removeProperty('--shift-x');
    emblem.style.removeProperty('--shift-y');
    emblem.classList.remove('is-pressed');
  }

  emblem.addEventListener('pointermove', updateEmblem, { passive: true });
  emblem.addEventListener('pointerdown', (event) => {
    updateEmblem(event);
    emblem.classList.add('is-pressed');
  }, { passive: true });
  emblem.addEventListener('pointerup', () => emblem.classList.remove('is-pressed'));
  emblem.addEventListener('pointercancel', resetEmblem);
  emblem.addEventListener('pointerleave', resetEmblem);
}

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );

  for (const element of revealElements) {
    revealObserver.observe(element);
  }
} else {
  for (const element of revealElements) {
    element.classList.add('is-visible');
  }
}
