(function () {
  var mb = document.querySelector('.menu'), nav = document.getElementById('nav');
  if (mb && nav) mb.addEventListener('click', function () { mb.setAttribute('aria-expanded', nav.classList.toggle('open')); });
  var y = document.getElementById('yr'); if (y) y.textContent = new Date().getFullYear();

  var f = document.getElementById('f'); if (!f) return;
  var msg = document.getElementById('st'), sb = document.getElementById('sb');
  function setErr(id, t) { document.getElementById(id + '-e').textContent = t; document.getElementById(id).setAttribute('aria-invalid', t ? 'true' : 'false'); }
  function show(c, t) { msg.className = 'status show ' + c; msg.textContent = t; }
  if (/[?&]error=1/.test(location.search)) show('bad', 'Your message could not be sent. Please check the fields and try again.');
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = function (k) { return f.elements[k].value.trim(); }, ok = true;
    if (!v('name')) { setErr('n', 'Enter your name.'); ok = false; } else setErr('n', '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) { setErr('e', 'Enter a valid email address, like name@company.com.'); ok = false; } else setErr('e', '');
    if (v('message').length < 10) { setErr('m', 'Tell us a little more (at least 10 characters).'); ok = false; } else setErr('m', '');
    if (!ok) { show('bad', 'Fix the highlighted fields and send again.'); return; }
    if (f.elements['bot-field'].value) return;
    sb.disabled = true; sb.textContent = 'Sending…';
    fetch('/api/contact-submit', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, body: new URLSearchParams(new FormData(f)).toString() })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (result) { if (!result || !result.ok) throw new Error('Submission failed'); f.reset(); show('good', 'Thank you. Your enquiry has been received. We will reply by email.'); })
      .catch(function () { show('bad', 'Your message could not be sent. Please try again in a moment.'); })
      .then(function () { sb.disabled = false; sb.textContent = 'Send enquiry'; });
  });
})();
