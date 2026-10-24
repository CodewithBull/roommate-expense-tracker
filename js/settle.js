/* settle.js — pure settlement logic for hostel-hisab.
 * No DOM, no storage, no dependencies. Works in the browser (window.Settle)
 * and in Node (require('../js/settle.js')) so it can be unit-tested.
 *
 * Money is handled in rupees with 2-decimal (paise) precision.
 */
(function (root) {
  'use strict';

  function round2(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  /**
   * Split `amount` equally among `memberIds`.
   * The rounding remainder (a few paise) is given to the first member so the
   * shares always sum exactly to `amount`.
   * Returns an object { memberId: shareAmount }.
   */
  function equalSplit(amount, memberIds) {
    var total = round2(amount);
    var ids = (memberIds || []).slice();
    var out = {};
    if (!ids.length) return out;
    var base = Math.floor((total / ids.length) * 100) / 100;
    var assigned = 0;
    ids.forEach(function (id, i) {
      if (i === ids.length - 1) {
        out[id] = round2(total - assigned);
      } else {
        out[id] = base;
        assigned = round2(assigned + base);
      }
    });
    return out;
  }

  /**
   * Validate / normalise a custom (unequal) split.
   * `shares` is { memberId: amount }. Throws if a share is negative or the
   * shares do not sum (within 1 paise) to `amount`.
   */
  function customSplit(amount, shares) {
    var total = round2(amount);
    var out = {};
    var sum = 0;
    Object.keys(shares || {}).forEach(function (id) {
      var v = round2(shares[id]);
      if (!(v >= 0)) throw new Error('Split share for ' + id + ' cannot be negative');
      if (v > 0) { out[id] = v; sum = round2(sum + v); }
    });
    if (Math.abs(sum - total) > 0.01) {
      throw new Error('Split shares (' + sum + ') must add up to the expense amount (' + total + ')');
    }
    return out;
  }

  /**
   * Compute each member's net balance from a list of expenses.
   * Expense shape: { amount, paidBy, splits: { memberId: shareAmount } }
   * Balance > 0  -> the group owes this member (they paid more than their share)
   * Balance < 0  -> this member owes the group
   * Returns { memberId: balance } including zero balances for known members.
   */
  function computeBalances(memberIds, expenses) {
    var balances = {};
    (memberIds || []).forEach(function (id) { balances[id] = 0; });
    (expenses || []).forEach(function (exp) {
      var amount = round2(exp.amount);
      if (!(amount > 0)) return;
      if (!(exp.paidBy in balances)) balances[exp.paidBy] = 0;
      balances[exp.paidBy] = round2(balances[exp.paidBy] + amount);
      var splits = exp.splits || {};
      Object.keys(splits).forEach(function (id) {
        if (!(id in balances)) balances[id] = 0;
        balances[id] = round2(balances[id] - round2(splits[id]));
      });
    });
    // Kill floating-point dust: anything under half a paise is zero.
    Object.keys(balances).forEach(function (id) {
      if (Math.abs(balances[id]) < 0.005) balances[id] = 0;
    });
    return balances;
  }

  /**
   * Greedy debt simplification.
   * Input:  { memberId: balance }  (positive = should receive, negative = owes)
   * Output: [{ from, to, amount }] with the fewest transfers this greedy
   * largest-first matching produces — at most (people with a balance - 1)
   * transfers, because every transfer fully settles at least one side.
   */
  function simplifyDebts(balances) {
    var creditors = []; // should receive
    var debtors = [];   // should pay
    Object.keys(balances || {}).forEach(function (id) {
      var b = round2(balances[id]);
      if (b > 0.004) creditors.push({ id: id, amount: b });
      else if (b < -0.004) debtors.push({ id: id, amount: -b });
    });
    creditors.sort(function (a, b) { return b.amount - a.amount; });
    debtors.sort(function (a, b) { return b.amount - a.amount; });

    var transfers = [];
    var i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      var pay = Math.min(debtors[i].amount, creditors[j].amount);
      pay = round2(pay);
      if (pay > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
      debtors[i].amount = round2(debtors[i].amount - pay);
      creditors[j].amount = round2(creditors[j].amount - pay);
      if (debtors[i].amount <= 0.004) i++;
      if (creditors[j].amount <= 0.004) j++;
    }
    return transfers;
  }

  /** Convenience: expenses -> minimum settlements. */
  function settle(memberIds, expenses) {
    return simplifyDebts(computeBalances(memberIds, expenses));
  }

  var api = {
    round2: round2,
    equalSplit: equalSplit,
    customSplit: customSplit,
    computeBalances: computeBalances,
    simplifyDebts: simplifyDebts,
    settle: settle
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Settle = api;
})(typeof window !== 'undefined' ? window : globalThis);
