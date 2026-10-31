(function () {
  'use strict';

  // Footer year
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Cookie-free counter: a CV download or a click on an email link sends one beacon with the event
  // name. The server keeps only a count per day; nothing about the visitor is sent or stored.
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !navigator.sendBeacon) return;
    var href = a.getAttribute('href');
    var event = /^mailto:/i.test(href) ? 'email' : /emanuel-rusu-cv\.pdf$/.test(href) ? 'cv' : null;
    if (event) navigator.sendBeacon('/api/hit?e=' + event);
  });

  // Header dropdowns (the mobile menu and the section map below 1400px): one open at a time, closed by
  // Escape, a click outside or following one of their links.
  var dropdowns = [];
  var closeDropdowns = function (except) {
    dropdowns.forEach(function (d) {
      if (d.panel === except || !d.panel.classList.contains('open')) return;
      d.panel.classList.remove('open');
      d.button.setAttribute('aria-expanded', 'false');
    });
  };
  var dropdown = function (button, panel, onOpen) {
    dropdowns.push({ button: button, panel: panel });
    button.addEventListener('click', function () {
      closeDropdowns(panel);
      var open = panel.classList.toggle('open');
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && onOpen) onOpen();
    });
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeDropdowns();
    });
  };
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.site-header, .page-map')) closeDropdowns();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    dropdowns.forEach(function (d) { if (d.panel.classList.contains('open')) d.button.focus(); });
    closeDropdowns();
  });

  // Mobile menu
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('nav');
  if (btn && nav) dropdown(btn, nav);

  // Section map for long pages (the homepages): built from the sections marked data-map="Label".
  // It shows which section you are in, underlines the matching header link (data-key) and jumps
  // to any section. Wide screens show it as a rail in the right margin, others as a header dropdown.
  var sections = Array.prototype.slice.call(document.querySelectorAll('main [data-map][id]'));
  var logo = document.querySelector('.site-header .logo');
  if (sections.length >= 3 && logo) {
    var mapTitle = document.documentElement.lang === 'de' ? 'Auf dieser Seite' : 'On this page';
    var map = document.createElement('nav');
    map.className = 'page-map';
    map.id = 'page-map';
    map.setAttribute('aria-label', mapTitle);
    var title = document.createElement('p');
    title.className = 'page-map-title';
    title.textContent = mapTitle;
    var list = document.createElement('ol');
    var links = sections.map(function (s) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + s.id;
      a.textContent = s.getAttribute('data-map');
      li.appendChild(a);
      list.appendChild(li);
      return a;
    });
    map.appendChild(title);
    map.appendChild(list);
    document.body.insertBefore(map, document.getElementById('main'));

    var mapBtn = document.createElement('button');
    mapBtn.type = 'button';
    mapBtn.className = 'map-btn';
    mapBtn.setAttribute('aria-controls', 'page-map');
    mapBtn.setAttribute('aria-expanded', 'false');
    var mapLabel = document.createElement('span');
    mapLabel.textContent = mapTitle;
    mapBtn.appendChild(mapLabel);
    logo.parentNode.insertBefore(mapBtn, logo.nextSibling);
    document.body.classList.add('has-map');
    dropdown(mapBtn, map, function () {
      var x = mapBtn.getBoundingClientRect().left;
      map.style.setProperty('--map-x', Math.max(16, Math.min(x, window.innerWidth - map.offsetWidth - 16)) + 'px');
    });

    // The current section is the last one whose top has passed a line at 30% of the window;
    // at the very bottom it is the last section, which may be too short to reach the line.
    var current = null, ticking = false;
    var spy = function () {
      ticking = false;
      var line = window.innerHeight * 0.3, idx = -1;
      sections.forEach(function (s, i) { if (s.getBoundingClientRect().top <= line) idx = i; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) idx = sections.length - 1;
      if (idx === current) return;
      current = idx;
      links.forEach(function (a, i) { if (i === idx) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
      mapLabel.textContent = idx < 0 ? mapTitle : sections[idx].getAttribute('data-map');
      var key = idx < 0 ? null : sections[idx].getAttribute('data-key');
      if (key) document.body.setAttribute('data-nav', key); else document.body.removeAttribute('data-nav');
    };
    var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(spy); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    spy();
  }

  // Profile photo: open the full portrait in a native <dialog>. Where the browser supports
  // View Transitions, the avatar grows into the portrait and shrinks back on close.
  var photoBtn = document.querySelector('.avatar-btn');
  var photo = document.getElementById('photo-view');
  if (photoBtn && photo && photo.showModal) {
    var morph = function (update) {
      if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(update);
      else update();
    };
    var closePhoto = function () { morph(function () { photo.close(); photoBtn.classList.remove('is-open'); }); };
    photoBtn.addEventListener('click', function () { morph(function () { photoBtn.classList.add('is-open'); photo.showModal(); }); });
    photo.querySelector('.photo-close').addEventListener('click', closePhoto);
    photo.addEventListener('click', function (e) { if (e.target === photo) closePhoto(); });
    photo.addEventListener('cancel', function (e) { e.preventDefault(); closePhoto(); });
  }

  // Projects: work-type chips, category dropdown and sort/group dropdown, applied together.
  // "Category" in the sort dropdown groups the cards under a heading per category.
  var grid = document.querySelector('.work-grid');
  var sort = document.getElementById('sort');
  var catSelect = document.getElementById('cat');
  var sortNote = document.getElementById('sort-note');
  var noResults = document.getElementById('no-results');
  var chips = document.querySelectorAll('.filters .chip');
  if (grid && sort) {
    var original = Array.prototype.slice.call(grid.querySelectorAll('.work'));
    var catOrder = catSelect ? Array.prototype.slice.call(catSelect.options).map(function (o) { return o.value; }).filter(function (v) { return v !== 'all'; }) : [];
    var catName = function (slug) {
      var opt = catSelect && catSelect.querySelector('option[value="' + slug + '"]');
      return opt ? opt.textContent.replace(/\s*\(\d+\)$/, '') : slug;
    };
    // Only the first LIMIT matching cards show until "Show all" is pressed; without JavaScript all of them do.
    var LIMIT = 6;
    var more = document.getElementById('work-more');
    var count = document.getElementById('work-count');
    var toggle = document.getElementById('work-toggle');
    var state = { type: 'all', cat: 'all', expanded: false };
    var rank = function (el) { var r = parseInt(el.getAttribute('data-pop'), 10); return isNaN(r) ? Infinity : r; };
    var name = function (el) { return el.getAttribute('data-title') || ''; };
    var catIndex = function (el) { var i = catOrder.indexOf(el.getAttribute('data-cat')); return i < 0 ? 999 : i; };
    var headings = {};
    catOrder.forEach(function (slug) {
      var h = document.createElement('h3');
      h.className = 'work-group';
      h.hidden = true;
      h.innerHTML = '<a href="industries/' + slug + '/">' + catName(slug) + '</a> <span></span>';
      headings[slug] = h;
    });

    var apply = function () {
      var list = original.slice();
      if (sort.value === 'popular') list.sort(function (a, b) { return (rank(a) - rank(b)) || name(a).localeCompare(name(b)); });
      else if (sort.value === 'az') list.sort(function (a, b) { return name(a).localeCompare(name(b)); });
      else if (sort.value === 'category') list.sort(function (a, b) { return (catIndex(a) - catIndex(b)) || (original.indexOf(a) - original.indexOf(b)); });

      var matched = 0, shown = 0, perCat = {}, visibleCat = {};
      list.forEach(function (el) {
        var tags = (el.getAttribute('data-tags') || '').split(' ');
        var c = el.getAttribute('data-cat');
        var ok = (state.type === 'all' || tags.indexOf(state.type) !== -1) && (state.cat === 'all' || c === state.cat);
        if (ok) { matched++; perCat[c] = (perCat[c] || 0) + 1; }
        var show = ok && (state.expanded || matched <= LIMIT);
        el.hidden = !show;
        if (show) { shown++; visibleCat[c] = true; }
      });

      var grouped = sort.value === 'category';
      var last = null;
      list.forEach(function (el) {
        var c = el.getAttribute('data-cat');
        if (grouped && c !== last && headings[c]) {
          var h = headings[c];
          h.hidden = !visibleCat[c];
          h.querySelector('span').textContent = perCat[c] ? perCat[c] + (perCat[c] === 1 ? ' project' : ' projects') : '';
          grid.appendChild(h);
          last = c;
        }
        grid.appendChild(el);
      });
      if (!grouped) Object.keys(headings).forEach(function (k) { if (headings[k].parentNode) headings[k].parentNode.removeChild(headings[k]); });

      grid.classList.toggle('show-rank', sort.value === 'popular');
      if (sortNote) sortNote.hidden = sort.value !== 'popular';
      if (noResults) noResults.hidden = matched > 0;
      if (more && count && toggle) {
        more.hidden = matched <= LIMIT;
        count.textContent = shown < matched ? 'Showing ' + shown + ' of ' + matched + ' projects' : 'Showing all ' + matched + ' projects';
        toggle.textContent = state.expanded ? 'Show fewer' : 'Show all ' + matched + ' projects';
        toggle.setAttribute('aria-expanded', state.expanded ? 'true' : 'false');
      }
    };

    if (toggle) toggle.addEventListener('click', function () {
      state.expanded = !state.expanded;
      apply();
      if (state.expanded) {
        // Carry on where the list was cut: focus the first card that just appeared.
        var next = grid.querySelectorAll('.work:not([hidden])')[LIMIT];
        var link = next && next.querySelector('h3 a');
        if (link) link.focus({ preventScroll: true });
      } else {
        toggle.scrollIntoView({ block: 'center' });
      }
    });

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        state.type = chip.getAttribute('data-filter');
        chips.forEach(function (c) {
          var on = c === chip;
          c.classList.toggle('active', on);
          c.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        apply();
      });
    });
    sort.addEventListener('change', apply);
    if (catSelect) catSelect.addEventListener('change', function () { state.cat = catSelect.value; apply(); });
    var reset = document.getElementById('reset-filters');
    if (reset) reset.addEventListener('click', function () {
      state.type = 'all'; state.cat = 'all';
      if (catSelect) catSelect.value = 'all';
      chips.forEach(function (c) { var on = c.getAttribute('data-filter') === 'all'; c.classList.toggle('active', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      apply();
    });

    // Deep link: /?category=sports-clubs#work opens the list filtered.
    var q = new URLSearchParams(location.search).get('category');
    if (q && catSelect && catOrder.indexOf(q) !== -1) { catSelect.value = q; state.cat = q; }
    // A browser that restores form state on Back may have kept another sort or category.
    if (catSelect && !q) state.cat = catSelect.value;
    apply();
  }

  // Contact form: sent with fetch so the answer shows in place (the texts are on the form's data-*
  // attributes, in the page's language). Without JavaScript the browser posts it and the Worker
  // redirects to a thank-you page.
  Array.prototype.forEach.call(document.querySelectorAll('.contact-form'), function (form) {
    var status = form.querySelector('.form-status');
    var send = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      if (!window.fetch || !window.FormData) return;
      e.preventDefault();
      form.classList.remove('is-sent', 'is-error');
      status.textContent = form.getAttribute('data-sending');
      send.disabled = true;
      var done = function (ok, error) {
        form.classList.add(ok ? 'is-sent' : 'is-error');
        status.textContent = form.getAttribute(ok ? 'data-sent' : error === 'invalid' ? 'data-invalid' : 'data-unavailable');
        send.disabled = false;
        if (ok) form.reset();
      };
      fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (res) { done(!!res.ok, res.error); }, function () { done(false, 'unavailable'); });
    });
  });

  // The button on the agency note fills in the start of the message.
  document.addEventListener('click', function (e) {
    var link = e.target.closest ? e.target.closest('[data-enquiry]') : null;
    var message = document.querySelector('.contact-form textarea[name="message"]');
    if (link && message && !message.value.trim()) message.value = link.getAttribute('data-enquiry') + '\n\n';
  });
})();
