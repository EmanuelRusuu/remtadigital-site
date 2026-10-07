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

  // Project filters
  var chips = document.querySelectorAll('.filters .chip');
  var items = document.querySelectorAll('.work');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var f = chip.getAttribute('data-filter');
      chips.forEach(function (c) {
        var on = c === chip;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      items.forEach(function (item) {
        var tags = (item.getAttribute('data-tags') || '').split(' ');
        item.hidden = !(f === 'all' || tags.indexOf(f) !== -1);
      });
    });
  });

  // Project sorting: featured (original order), most visited site (Tranco rank), name
  var grid = document.querySelector('.work-grid');
  var sort = document.getElementById('sort');
  var sortNote = document.getElementById('sort-note');
  if (grid && sort) {
    var original = Array.prototype.slice.call(grid.querySelectorAll('.work'));
    var rank = function (el) { var r = parseInt(el.getAttribute('data-rank'), 10); return isNaN(r) ? Infinity : r; };
    var name = function (el) { return el.getAttribute('data-title') || ''; };
    sort.addEventListener('change', function () {
      var list = original.slice();
      if (sort.value === 'popular') {
        list.sort(function (a, b) { return (rank(a) - rank(b)) || name(a).localeCompare(name(b)); });
      } else if (sort.value === 'az') {
        list.sort(function (a, b) { return name(a).localeCompare(name(b)); });
      }
      list.forEach(function (el) { grid.appendChild(el); });
      grid.classList.toggle('show-rank', sort.value === 'popular');
      if (sortNote) sortNote.hidden = sort.value !== 'popular';
    });
  }
})();
