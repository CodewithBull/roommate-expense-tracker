/* Run with:  node --test tests/settle.test.js
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Settle = require('../js/settle.js');

const members = ['aarav', 'kabir', 'meera', 'rohan'];

function totalTransferred(transfers) {
  return Math.round(transfers.reduce((s, t) => s + t.amount, 0) * 100) / 100;
}

test('equal split: shares sum exactly to the amount, remainder to last member', () => {
  const shares = Settle.equalSplit(100, ['a', 'b', 'c']);
  assert.deepEqual(shares, { a: 33.33, b: 33.33, c: 33.34 });
  const sum = Object.values(shares).reduce((s, v) => s + v, 0);
  assert.equal(Math.round(sum * 100) / 100, 100);
  assert.deepEqual(Settle.equalSplit(1200, members), {
    aarav: 300, kabir: 300, meera: 300, rohan: 300,
  });
});

test('equal split expense: one payer, everyone else owes them', () => {
  const expenses = [{
    amount: 4000, paidBy: 'aarav', splits: Settle.equalSplit(4000, members),
  }];
  const balances = Settle.computeBalances(members, expenses);
  assert.deepEqual(balances, { aarav: 3000, kabir: -1000, meera: -1000, rohan: -1000 });

  const transfers = Settle.settle(members, expenses);
  assert.equal(transfers.length, 3);
  assert.ok(transfers.every((t) => t.to === 'aarav' && t.amount === 1000));
  assert.equal(totalTransferred(transfers), 3000);
});

test('unequal / custom split: validated and settled correctly', () => {
  // Kabir ate out twice, so he takes a bigger share of the mess bill.
  const splits = Settle.customSplit(1000, { aarav: 200, kabir: 500, meera: 300 });
  assert.deepEqual(splits, { aarav: 200, kabir: 500, meera: 300 });
  assert.throws(() => Settle.customSplit(1000, { aarav: 100, kabir: 100 }), /must add up/);
  assert.throws(() => Settle.customSplit(100, { aarav: -5, kabir: 105 }), /cannot be negative/);

  const expenses = [{ amount: 1000, paidBy: 'meera', splits }];
  const balances = Settle.computeBalances(['aarav', 'kabir', 'meera'], expenses);
  assert.deepEqual(balances, { aarav: -200, kabir: -500, meera: 700 });
  const transfers = Settle.settle(['aarav', 'kabir', 'meera'], expenses);
  assert.equal(totalTransferred(transfers), 700);
  assert.ok(transfers.every((t) => t.to === 'meera'));
});

test('minimum transfers: a chain A->B->C collapses to a direct payment', () => {
  // Aarav paid 3000 for all 3; Kabir then paid 1000 for all 3.
  // Net: without simplification you would get 4+ transfers.
  const ids = ['aarav', 'kabir', 'meera'];
  const expenses = [
    { amount: 3000, paidBy: 'aarav', splits: Settle.equalSplit(3000, ids) },
    { amount: 1000, paidBy: 'kabir', splits: Settle.equalSplit(1000, ids) },
  ];
  const balances = Settle.computeBalances(ids, expenses);
  // aarav: +3000-1333.33, kabir: +1000-1333.34 (last in equal split), meera: -1333.33
  const sum = Object.values(balances).reduce((s, v) => s + v, 0);
  assert.equal(Math.round(sum * 100) / 100, 0);

  const transfers = Settle.settle(ids, expenses);
  // At most (people with non-zero balance - 1) transfers.
  const nonZero = Object.values(balances).filter((b) => b !== 0).length;
  assert.ok(transfers.length <= nonZero - 1, `expected <= ${nonZero - 1}, got ${transfers.length}`);

  // Applying the transfers must zero everyone out.
  const after = { ...balances };
  for (const t of transfers) {
    after[t.from] = Math.round((after[t.from] + t.amount) * 100) / 100;
    after[t.to] = Math.round((after[t.to] - t.amount) * 100) / 100;
  }
  for (const id of ids) assert.equal(after[id], 0, `${id} not settled`);
});

test('minimum transfers: 4-person mixed balances settle in at most 3 transfers', () => {
  const transfers = Settle.simplifyDebts({ a: 1500, b: 500, c: -800, d: -1200 });
  assert.ok(transfers.length <= 3);
  assert.equal(totalTransferred(transfers), 2000);
  // Greedy largest-first: biggest debtor (d, 1200) pays biggest creditor (a) first.
  assert.deepEqual(
    transfers.map((t) => [t.from, t.to, t.amount]).sort(),
    [['c', 'a', 300], ['c', 'b', 500], ['d', 'a', 1200]].sort(),
  );
});

test('zero-balance case: nobody owes anything', () => {
  // Everyone paid exactly their own equal share of separate bills.
  const expenses = members.map((id) => ({
    amount: 500, paidBy: id, splits: Settle.equalSplit(500, members),
  }));
  // Each person paid 500 once and owes 125 x 4 = 500 in shares.
  const balances = Settle.computeBalances(members, expenses);
  assert.deepEqual(balances, { aarav: 0, kabir: 0, meera: 0, rohan: 0 });
  assert.deepEqual(Settle.settle(members, expenses), []);
  assert.deepEqual(Settle.simplifyDebts({ a: 0, b: 0 }), []);
  assert.deepEqual(Settle.simplifyDebts({}), []);
});
