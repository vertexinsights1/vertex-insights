(function () {
  document.documentElement.classList.add('js');
  var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* hero slides */
  var box = document.querySelector('[data-slides]');
  if (box) {
    var s = box.querySelectorAll('.slide'), i = 0, t, d = document.createElement('div'); d.className = 'dots';
    var go = function (n) { s[i].classList.remove('on'); i = (n + s.length) % s.length; s[i].classList.add('on');
      [].forEach.call(d.children, function (b, k) { b.setAttribute('aria-current', k === i); }); };
    [].forEach.call(s, function (_, k) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Show slide ' + (k + 1));
      b.addEventListener('click', function () { go(k); run(); }); d.appendChild(b); });
    box.appendChild(d); go(0);
    var run = function () { clearInterval(t); if (!rm) t = setInterval(function () { go(i + 1); }, 6500); };
    box.addEventListener('mouseenter', function () { clearInterval(t); }); box.addEventListener('mouseleave', run); box.addEventListener('focusin', function () { clearInterval(t); }); run();
  }
  /* health check scorecard (nothing leaves the browser) */
  var sc = document.getElementById('sc');
  if (sc) sc.addEventListener('change', function () {
    var qs = sc.querySelectorAll('.sc-q'), sum = 0, done = 0;
    [].forEach.call(qs, function (q) { var c = q.querySelector('input:checked'); if (c) { done++; sum += +c.value; } });
    var bar = document.getElementById('scbar'), t = document.getElementById('sct'), dd = document.getElementById('scd'), cta = document.getElementById('scc');
    bar.style.width = Math.round(done / qs.length * 100) + '%';
    if (done < qs.length) { t.textContent = done + ' of ' + qs.length + ' answered.'; dd.textContent = ''; cta.hidden = true; return; }
    var gaps = qs.length * 2 - sum;
    bar.style.width = Math.round(sum / (qs.length * 2) * 100) + '%';
    if (sum >= 10) { t.textContent = 'Solid base: ' + sum + ' of 12.'; dd.textContent = 'Your numbers are mostly in hand. A review of scenarios and margin by product could still sharpen the next decision.'; }
    else if (sum >= 6) { t.textContent = 'Half the picture: ' + sum + ' of 12.'; dd.textContent = 'You have some visibility, but ' + gaps + ' points of risk sit in the gaps. This is the point where one agreed set of measures pays back fastest.'; }
    else { t.textContent = 'Flying blind: ' + sum + ' of 12.'; dd.textContent = 'Decisions are probably running on instinct and memory. A short conversation will show what to measure first.'; }
    cta.hidden = false;
  });
  /* cost-of-delay calculator */
  var c1 = document.getElementById('c1');
  if (c1) {
    var c2 = document.getElementById('c2'), c3 = document.getElementById('c3'), o = [1, 2, 3].map(function (n) { return document.getElementById('o' + n); });
    var inr = function (cr) { var l = cr * 100; if (l >= 100) return '₹' + (l / 100).toFixed(2) + ' cr'; if (l >= 1) return '₹' + l.toFixed(1) + ' lakh'; return '₹' + Math.round(l * 1e5).toLocaleString('en-IN'); };
    var calc = function () {
      var a = parseFloat(c1.value), b = parseFloat(c2.value), m = parseFloat(c3.value);
      if (!(a >= 0) || !(b >= 0) || !(m >= 0) || !(m <= 100) || b <= a) { o.forEach(function (e) { e.textContent = '—'; }); return; }
      var g = (b - a) * m / 100; o[0].textContent = inr(g); o[1].textContent = inr(g / 12); o[2].textContent = inr(g / 365);
    };
    [c1, c2, c3].forEach(function (e) { e.addEventListener('input', calc); });
  }
  /* section rail + reading progress */
  var secs = [].slice.call(document.querySelectorAll('[data-rail]'));
  if (secs.length && 'IntersectionObserver' in window) {
    var nav = document.createElement('nav'); nav.className = 'rail'; nav.setAttribute('aria-label', 'Page sections');
    secs.forEach(function (el) { var a = document.createElement('a'); a.href = '#' + el.id; a.innerHTML = '<span></span><i></i>'; a.firstChild.textContent = el.getAttribute('data-rail'); nav.appendChild(a); });
    document.body.appendChild(nav);
    var links = nav.children, io2 = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) [].forEach.call(links, function (l, k) { l.setAttribute('aria-current', secs[k] === e.target); }); }); }, { rootMargin: '-45% 0px -50% 0px' });
    secs.forEach(function (el) { io2.observe(el); });
  }
  var pb = document.createElement('div'); pb.className = 'rbar'; document.body.appendChild(pb);
  addEventListener('scroll', function () { var h = document.documentElement; pb.style.width = Math.min(100, h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight) * 100) + '%'; }, { passive: true });
  var rv = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window) { var io3 = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io3.unobserve(e.target); } }); }, { threshold: .25 }); [].forEach.call(rv, function (el) { io3.observe(el); }); } else { [].forEach.call(rv, function (el) { el.classList.add('in'); }); }
  /* count-up */
  var n = document.querySelectorAll('[data-count]');
  if (!n.length || rm || !('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) {
    if (!e.isIntersecting) return; io.unobserve(e.target);
    var el = e.target, end = +el.dataset.count, p = el.dataset.pre || '', x = el.dataset.suf || '', st = null;
    (function f(ts) { st = st || ts; var k = Math.min((ts - st) / 1200, 1); el.textContent = p + Math.round(end * k) + x; if (k < 1) requestAnimationFrame(f); })(performance.now());
  }); }, { threshold: .4 });
  [].forEach.call(n, function (el) { io.observe(el); });
})();
