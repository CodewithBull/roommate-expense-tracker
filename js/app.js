/* hostel-hisab app — plain JS, localStorage only. Settlement maths lives in
 * js/settle.js (window.Settle) so it can be tested separately in Node. */
(function () {
  'use strict';

  var STORAGE_KEY = 'hostel-hisab-v1';
  var CATEGORIES = ['Rent', 'Bijli / Electricity', 'Doodh / Milk', 'Khana / Mess', 'Safai', 'Other'];

  var state = load() || { members: [], expenses: [] };
  var $ = function (id) { return document.getElementById(id); };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function memberById(id) { return state.members.find(function (m) { return m.id === id; }); }
  function fmt(n) {
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function monthOf(dateStr) { return (dateStr || '').slice(0, 7); }
  function currentMonth() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function selectedMonth() { return $('month-filter').value || currentMonth(); }
  function monthExpenses() {
    var m = selectedMonth();
    return state.expenses.filter(function (e) { return monthOf(e.date) === m; });
  }
  function upiLink(member, amount) {
    if (!member || !member.upi) return '';
    return 'upi://pay?pa=' + encodeURIComponent(member.upi) +
      '&pn=' + encodeURIComponent(member.name) +
      '&am=' + Number(amount).toFixed(2) + '&cu=INR';
  }

  /* ---------------- rendering ---------------- */

  function renderMembers() {
    var list = $('member-list');
    list.innerHTML = '';
    $('member-empty').style.display = state.members.length ? 'none' : 'block';
    state.members.forEach(function (m) {
      var li = document.createElement('li');
      li.className = 'member';
      var who = document.createElement('span'); who.className = 'who'; who.textContent = m.name;
      var upi = document.createElement('span'); upi.className = 'upi'; upi.textContent = m.upi || 'no UPI ID';
      var spacer = document.createElement('span'); spacer.className = 'spacer';
      var del = document.createElement('button');
      del.className = 'delete'; del.type = 'button'; del.textContent = '✕';
      del.setAttribute('aria-label', 'Remove ' + m.name);
      del.addEventListener('click', function () {
        if (!confirm('Remove ' + m.name + '? Their past expenses stay, but they will no longer be listed.')) return;
        state.members = state.members.filter(function (x) { return x.id !== m.id; });
        save(); render();
      });
      li.append(who, upi, spacer, del);
      list.appendChild(li);
    });

    var payer = $('exp-payer');
    payer.innerHTML = '';
    state.members.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m.id; opt.textContent = m.name;
      payer.appendChild(opt);
    });
    renderSplitList();
  }

  function renderSplitList() {
    var wrap = $('split-list');
    var previous = {};
    wrap.querySelectorAll('.split-row').forEach(function (row) {
      var box = row.querySelector('.split-check');
      if (box) previous[box.value] = {
        checked: box.checked,
        share: row.querySelector('.split-share').value
      };
    });
    wrap.innerHTML = '';
    var custom = $('split-mode').value === 'custom';
    state.members.forEach(function (m) {
      var label = document.createElement('label');
      label.className = 'check split-row' + (custom ? ' custom' : '');
      var box = document.createElement('input');
      box.type = 'checkbox'; box.className = 'split-check'; box.value = m.id;
      box.checked = previous[m.id] ? previous[m.id].checked : true;
      box.setAttribute('aria-label', 'Include ' + m.name + ' in the split');
      var name = document.createElement('span'); name.textContent = m.name;
      var share = document.createElement('input');
      share.type = 'number'; share.className = 'split-share'; share.min = '0'; share.step = '0.01';
      share.placeholder = '₹ share'; share.value = previous[m.id] ? previous[m.id].share : '';
      share.setAttribute('aria-label', 'Share amount for ' + m.name);
      label.append(box, name, share);
      wrap.appendChild(label);
    });
  }

  function renderExpenses() {
    var expenses = monthExpenses().slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    var list = $('expense-list');
    list.innerHTML = '';
    $('expense-empty').style.display = expenses.length ? 'none' : 'block';
    var total = 0;
    expenses.forEach(function (e) {
      total += e.amount;
      var payer = memberById(e.paidBy);
      var sharedBy = Object.keys(e.splits).map(function (id) {
        var m = memberById(id); return m ? m.name : 'former member';
      }).join(', ');
      var li = document.createElement('li');
      li.className = 'expense';
      var title = document.createElement('span'); title.textContent = e.title;
      var badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = e.category;
      var amt = document.createElement('span'); amt.className = 'amount'; amt.textContent = fmt(e.amount);
      var spacer = document.createElement('span'); spacer.className = 'spacer';
      var del = document.createElement('button');
      del.className = 'delete'; del.type = 'button'; del.textContent = '✕';
      del.setAttribute('aria-label', 'Delete expense ' + e.title);
      del.addEventListener('click', function () {
        state.expenses = state.expenses.filter(function (x) { return x.id !== e.id; });
        save(); render();
      });
      var meta = document.createElement('span'); meta.className = 'meta';
      meta.textContent = e.date + ' · paid by ' + (payer ? payer.name : 'former member') + ' · split: ' + sharedBy;
      li.append(title, badge, spacer, amt, del, meta);
      list.appendChild(li);
    });
    $('month-total').textContent = fmt(total);
    var m = selectedMonth();
    $('month-label').textContent = 'Total for ' + m;
  }

  function renderSettlement() {
    var ids = state.members.map(function (m) { return m.id; });
    var expenses = monthExpenses();
    var balances = Settle.computeBalances(ids, expenses);
    // Include anyone who appears in this month's expenses but was removed.
    Object.keys(balances).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });

    var bl = $('balance-list');
    bl.innerHTML = '';
    ids.forEach(function (id) {
      var m = memberById(id);
      var name = m ? m.name : 'Former member';
      var b = balances[id] || 0;
      var li = document.createElement('li');
      li.className = 'balance-row';
      var who = document.createElement('span'); who.className = 'who'; who.textContent = name;
      var spacer = document.createElement('span'); spacer.className = 'spacer';
      var amt = document.createElement('span');
      amt.className = 'amount ' + (b > 0 ? 'get' : b < 0 ? 'give' : '');
      amt.textContent = b > 0 ? 'gets back ' + fmt(b) : b < 0 ? 'owes ' + fmt(-b) : 'settled ✓';
      li.append(who, spacer, amt);
      bl.appendChild(li);
    });
    if (!ids.length) bl.innerHTML = '<li class="empty">Add roommates to see balances.</li>';

    var transfers = Settle.simplifyDebts(balances);
    var sl = $('settle-list');
    sl.innerHTML = '';
    $('settle-empty').style.display = transfers.length ? 'none' : 'block';
    transfers.forEach(function (t) {
      var from = memberById(t.from), to = memberById(t.to);
      var li = document.createElement('li');
      li.className = 'settle-row';
      var text = document.createElement('span');
      text.textContent = (from ? from.name : 'Former member') + ' pays ' + (to ? to.name : 'former member') + ' ';
      var amt = document.createElement('span'); amt.className = 'amount'; amt.textContent = fmt(t.amount);
      li.appendChild(text); li.appendChild(amt);
      var link = upiLink(to, t.amount);
      if (link) {
        var spacer = document.createElement('span'); spacer.className = 'spacer';
        var a = document.createElement('a');
        a.className = 'btn small'; a.href = link; a.textContent = 'Pay via UPI';
        a.setAttribute('aria-label', 'Pay ' + (to ? to.name : '') + ' ' + fmt(t.amount) + ' via UPI');
        li.append(spacer, a);
      }
      sl.appendChild(li);
    });

    $('wa-message').value = buildWhatsAppMessage(transfers, balances);
    $('wa-open').href = 'https://wa.me/?text=' + encodeURIComponent($('wa-message').value);
  }

  function buildWhatsAppMessage(transfers, balances) {
    var month = selectedMonth();
    if (!transfers.length) {
      return '🧾 Hostel Hisab — ' + month + '\nSab hisab barabar hai, nobody owes anything this month. 🎉';
    }
    var lines = ['🧾 *Hostel Hisab — ' + month + '*', 'Settle up in ' + transfers.length + ' payment(s):', ''];
    transfers.forEach(function (t) {
      var from = memberById(t.from), to = memberById(t.to);
      var line = '• ' + (from ? from.name : 'Former member') + ' → ' + (to ? to.name : 'former member') + ': ' + fmt(t.amount);
      var link = upiLink(to, t.amount);
      if (link) line += '\n  Pay: ' + link;
      lines.push(line);
    });
    var total = monthExpenses().reduce(function (s, e) { return s + e.amount; }, 0);
    lines.push('', 'Total kharcha this month: ' + fmt(total) + ' · Generated with Hostel Hisab');
    return lines.join('\n');
  }

  function render() { renderMembers(); renderExpenses(); renderSettlement(); }

  /* ---------------- events ---------------- */

  $('member-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var name = $('member-name').value.trim();
    if (!name) return;
    state.members.push({ id: uid(), name: name, upi: $('member-upi').value.trim() || undefined });
    $('member-name').value = ''; $('member-upi').value = '';
    save(); render();
  });

  $('split-mode').addEventListener('change', renderSplitList);

  $('expense-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var status = $('expense-status');
    status.textContent = '';
    var amount = parseFloat($('exp-amount').value);
    if (!(amount > 0)) { status.textContent = 'Enter an amount above zero.'; return; }
    var rows = Array.prototype.slice.call(document.querySelectorAll('.split-row'));
    var selected = rows.filter(function (r) { return r.querySelector('.split-check').checked; })
      .map(function (r) { return r.querySelector('.split-check').value; });
    if (!selected.length) { status.textContent = 'Tick at least one person to split with.'; return; }

    var splits;
    try {
      if ($('split-mode').value === 'custom') {
        var shares = {};
        rows.forEach(function (r) {
          var box = r.querySelector('.split-check');
          if (box.checked) shares[box.value] = parseFloat(r.querySelector('.split-share').value) || 0;
        });
        splits = Settle.customSplit(amount, shares);
      } else {
        splits = Settle.equalSplit(amount, selected);
      }
    } catch (err) { status.textContent = err.message; return; }

    state.expenses.push({
      id: uid(),
      title: $('exp-title').value.trim(),
      amount: Settle.round2(amount),
      paidBy: $('exp-payer').value,
      category: $('exp-category').value,
      date: $('exp-date').value,
      splits: splits
    });
    $('exp-title').value = ''; $('exp-amount').value = '';
    status.textContent = 'Added ✓';
    save(); render();
  });

  $('month-filter').addEventListener('change', function () { renderExpenses(); renderSettlement(); });

  $('copy-message').addEventListener('click', function () {
    var done = function () { $('copy-status').textContent = 'Copied — paste it in your room WhatsApp group ✓'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText($('wa-message').value).then(done, function () {
        $('wa-message').select(); document.execCommand('copy'); done();
      });
    } else { $('wa-message').select(); document.execCommand('copy'); done(); }
  });

  $('export-btn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hostel-hisab-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
    $('data-status').textContent = 'Backup downloaded ✓';
  });

  $('import-file').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data.members) || !Array.isArray(data.expenses)) throw new Error('bad file');
        state = data; save(); render();
        $('data-status').textContent = 'Backup imported ✓';
      } catch (e) { $('data-status').textContent = 'That file does not look like a Hostel Hisab backup.'; }
    };
    reader.readAsText(file);
    this.value = '';
  });

  $('clear-btn').addEventListener('click', function () {
    if (!confirm('Clear all roommates and expenses from this browser? Export a backup first if unsure.')) return;
    state = { members: [], expenses: [] };
    save(); render();
    $('data-status').textContent = 'Cleared.';
  });

  $('seed-demo').addEventListener('click', function () {
    if (state.expenses.length && !confirm('Replace current data with the demo? Export a backup first if you need it.')) return;
    state = demoData();
    $('month-filter').value = currentMonth();
    save(); render();
    $('data-status').textContent = 'Demo loaded — 4 roommates, one month of PG kharcha ✓';
  });

  /* ---------------- demo data ---------------- */

  function demoData() {
    var month = currentMonth();
    var names = [
      { name: 'Aarav', upi: 'aarav@okhdfcbank' },
      { name: 'Kabir', upi: 'kabir@okaxis' },
      { name: 'Meera', upi: 'meera@okicici' },
      { name: 'Rohan', upi: '' }
    ];
    var members = names.map(function (n, i) {
      return { id: 'demo-' + (i + 1), name: n.name, upi: n.upi || undefined };
    });
    var ids = members.map(function (m) { return m.id; });
    function d(day) { return month + '-' + String(day).padStart(2, '0'); }
    function exp(title, amount, paidBy, category, day, splitIds, custom) {
      return {
        id: uid() + day, title: title, amount: amount, paidBy: paidBy, category: category,
        date: d(day), splits: custom ? Settle.customSplit(amount, custom) : Settle.equalSplit(amount, splitIds || ids)
      };
    }
    var expenses = [
      exp('Room rent (shared PG)', 12000, ids[0], 'Rent', 1),
      exp('Bijli bill — UPPCL', 1846, ids[1], 'Bijli / Electricity', 9),
      exp('Doodh — doodhwala, full month', 1560, ids[2], 'Doodh / Milk', 28),
      exp('Mess / tiffin service', 8000, ids[3], 'Khana / Mess', 5),
      exp('Sunday biryani treat (Kabir ate double)', 900, ids[0], 'Khana / Mess', 13, ids,
        { 'demo-1': 225, 'demo-2': 450, 'demo-3': 225, 'demo-4': 0 }),
      exp('Safai wali didi — deep clean', 600, ids[2], 'Safai', 19),
      exp('Wi-Fi recharge', 999, ids[1], 'Other', 3)
    ];
    // Biryani custom split above sums to 900 with Rohan at 0 (customSplit drops zeros).
    return { members: members, expenses: expenses };
  }

  /* ---------------- init ---------------- */
  $('month-filter').value = currentMonth();
  $('exp-date').value = new Date().toISOString().slice(0, 10);
  render();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('service-worker.js').catch(function () { /* offline shell is a bonus */ });
  }
})();
