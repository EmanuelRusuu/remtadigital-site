(function () {
  'use strict';

  // Footer year
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Mobile menu
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
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
    var state = { type: 'all', cat: 'all' };
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

      var shown = 0, perCat = {};
      list.forEach(function (el) {
        var tags = (el.getAttribute('data-tags') || '').split(' ');
        var ok = (state.type === 'all' || tags.indexOf(state.type) !== -1) && (state.cat === 'all' || el.getAttribute('data-cat') === state.cat);
        el.hidden = !ok;
        if (ok) { shown++; perCat[el.getAttribute('data-cat')] = (perCat[el.getAttribute('data-cat')] || 0) + 1; }
      });

      var grouped = sort.value === 'category';
      var last = null;
      list.forEach(function (el) {
        var c = el.getAttribute('data-cat');
        if (grouped && c !== last && headings[c]) {
          var h = headings[c];
          h.hidden = !perCat[c];
          h.querySelector('span').textContent = perCat[c] ? perCat[c] + (perCat[c] === 1 ? ' project' : ' projects') : '';
          grid.appendChild(h);
          last = c;
        }
        grid.appendChild(el);
      });
      if (!grouped) Object.keys(headings).forEach(function (k) { if (headings[k].parentNode) headings[k].parentNode.removeChild(headings[k]); });

      grid.classList.toggle('show-rank', sort.value === 'popular');
      if (sortNote) sortNote.hidden = sort.value !== 'popular';
      if (noResults) noResults.hidden = shown > 0;
    };

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
    if (q && catSelect && catOrder.indexOf(q) !== -1) { catSelect.value = q; state.cat = q; apply(); }
  }
})();
