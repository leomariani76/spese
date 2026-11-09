// Test del parser: node test/parser.test.js
const P = require('../parser.js');
const assert = require('assert');

const NOW = new Date(2026, 10, 9, 18, 0); // 9 novembre 2026
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  KO  ' + name + '\n      ' + e.message); }
}
const ymd = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : null;

console.log('Numeri');
t('23,40', () => assert.strictEqual(P.parseEuroNumber('23,40'), 23.4));
t('1.234,56 €', () => assert.strictEqual(P.parseEuroNumber('1.234,56 €'), 1234.56));
t('€1,234.56', () => assert.strictEqual(P.parseEuroNumber('€1,234.56'), 1234.56));
t('12.99', () => assert.strictEqual(P.parseEuroNumber('12.99'), 12.99));
t('-30,00 €', () => assert.strictEqual(P.parseEuroNumber('-30,00 €'), -30));
t('1.200', () => assert.strictEqual(P.parseEuroNumber('1.200'), 1200));
t('€ 5', () => assert.strictEqual(P.parseEuroNumber('€ 5'), 5));

console.log('Notifiche testuali');
const cases = [
  { txt: 'Nexi: pagamento di 23,40 EUR presso ESSELUNGA MILANO con carta *1234 il 09/11/2026 alle 12:34',
    amount: 23.4, merchant: 'Esselunga Milano', cat: 'spesa', date: '2026-11-09 12:34' },
  { txt: 'Hai effettuato un pagamento online di € 12,99 su NETFLIX.COM con la tua carta Nexi ****5678',
    amount: 12.99, merchant: 'Netflix.com', cat: 'abbonamenti', channel: 'Online' },
  { txt: 'Operazione con carta ***1234 di EUR 50,00 del 08/11/26 ore 19:05 c/o ENI STATION ROMA autorizzata',
    amount: 50, merchant: 'Eni Station Roma', cat: 'auto', date: '2026-11-08 19:05' },
  { txt: 'Prelievo di 100,00 EUR presso ATM INTESA SANPAOLO il 07/11/2026', amount: 100, cat: 'prelievi', channel: 'Prelievo' },
  { txt: 'Pagamento ricorrente di 9,99 EUR presso SPOTIFY P1A2B3C4 il 01/11/2026', amount: 9.99, merchant: 'Spotify', cat: 'abbonamenti', channel: 'Ricorrente' },
  { txt: 'Storno di 30,00 EUR da ZALANDO SE', amount: 30, cat: 'shopping', refund: true },
  { txt: "Gentile Cliente, la Sua carta Nexi *1234 e' stata utilizzata il 05/11/2026 alle ore 08:15 per EUR 1,50 presso BAR CENTRALE",
    amount: 1.5, merchant: 'Bar Centrale', cat: 'ristoranti', date: '2026-11-05 08:15' },
  { txt: 'Autorizzata op. Apple Pay 4,20€ PAM PANORAMA 3/11 18:22', amount: 4.2, merchant: 'Pam Panorama', cat: 'spesa', channel: 'Apple Pay', date: '2026-11-03 18:22' },
  { txt: 'Transazione negata di 15,00 EUR presso XYZ SHOP', amount: 15, declined: true },
  { txt: 'Pagamento di 45,00 EUR presso PAYPAL *AMAZON PRIME il 02/11/2026. Disponibilità residua 1.255,00 EUR', amount: 45, cat: 'abbonamenti' },
  { txt: 'Pagamento contactless di 3,80 € presso FARMACIA SAN MARCO', amount: 3.8, cat: 'salute', channel: 'Contactless' },
  { txt: 'Acquisto di 89,90 EUR presso IKEA ITALIA RETAIL SRL', amount: 89.9, merchant: 'Ikea Italia Retail', cat: 'casa' },
  { txt: 'Pagamento di 72,15 EUR presso ENEL ENERGIA SPA', amount: 72.15, cat: 'casa' },
  { txt: 'Pagamento di 12,00 EUR presso UBER *EATS PENDING', amount: 12, cat: 'ristoranti' },
  { txt: 'Pagamento di 9,40 EUR presso UBER *TRIP', amount: 9.4, cat: 'trasporti' },
  { txt: 'Pagamento di 22,00 USD presso STEAMGAMES.COM pari a 20,31 EUR', amount: 20.31 },
  { txt: 'Hai speso 1.234,56 € da MEDIAWORLD il 4 novembre 2026', amount: 1234.56, cat: 'shopping', date: '2026-11-04 00:00' },
];
cases.forEach(c => {
  t(c.txt.slice(0, 60), () => {
    const r = P.parseNotification(c.txt, { now: NOW });
    if (c.amount != null) assert.strictEqual(r.amount, c.amount, 'importo ' + r.amount);
    if (c.merchant) assert.strictEqual(r.merchant, c.merchant, 'esercente "' + r.merchant + '"');
    if (c.cat) assert.strictEqual(r.category, c.cat, 'categoria ' + r.category + ' (' + r.merchant + ') ' + r.reason);
    if (c.channel) assert.strictEqual(r.channel, c.channel, 'canale ' + r.channel);
    if (c.date) assert.strictEqual(ymd(r.date), c.date, 'data ' + ymd(r.date));
    if (c.refund) assert.ok(r.isRefund, 'rimborso');
    if (c.declined) assert.ok(r.isDeclined, 'negato');
    if (!c.declined) assert.ok(!r.isDeclined, 'non dovrebbe essere negato');
  });
});

console.log('Voci dei Comandi Rapidi');
t('Wallet ISO', () => {
  const r = P.parseEntry('W|2026-11-09T12:34:56+01:00|23,40 €|Esselunga|Nexi Debit', { now: NOW });
  assert.strictEqual(r.amount, 23.4); assert.strictEqual(r.category, 'spesa');
  assert.strictEqual(ymd(r.date), '2026-11-09 12:34'); assert.strictEqual(r.channel, 'Apple Pay');
});
t('Wallet data italiana', () => {
  const r = P.parseEntry('W|9 nov 2026 alle ore 08:05|€1,50|BAR SPORT', { now: NOW });
  assert.strictEqual(r.amount, 1.5); assert.strictEqual(r.category, 'ristoranti');
  assert.strictEqual(ymd(r.date), '2026-11-09 08:05');
});
t('Wallet data 09/11/26, 13:10', () => {
  const r = P.parseEntry('W|09/11/26, 13:10|€ 61,30|Q8 Easy', { now: NOW });
  assert.strictEqual(ymd(r.date), '2026-11-09 13:10'); assert.strictEqual(r.category, 'auto');
});
t('SMS con data del comando', () => {
  const r = P.parseEntry('T|2026-11-08T20:15:00+01:00|Nexi: pagamento di 18,00 EUR presso PIZZERIA DA MARIO', { now: NOW });
  assert.strictEqual(r.amount, 18); assert.strictEqual(r.category, 'ristoranti');
  assert.strictEqual(ymd(r.date), '2026-11-08 20:15'); assert.strictEqual(r.source, 'sms');
});
t('File con più voci e a capo', () => {
  const file = '@@W|2026-11-01T10:00:00+01:00|5,00 €|Lidl\n@@T|2026-11-02T11:00:00+01:00|Pagamento di 7,99 EUR\npresso NETFLIX\n@@W|2026-11-03T09:00:00+01:00|2,00 €|Bar Roma\n';
  const b = P.parseBatch(file, { now: NOW });
  assert.strictEqual(b.length, 3);
  assert.deepStrictEqual(b.map(x => x.parsed.category), ['spesa', 'abbonamenti', 'ristoranti']);
  assert.notStrictEqual(b[0].key, b[2].key);
});
t('Testo incollato con più righe', () => {
  const b = P.parseBatch('Pagamento di 5,00 EUR presso LIDL\nPagamento di 8,00 EUR presso CONAD', { now: NOW });
  assert.strictEqual(b.length, 2);
});
t('Regola personale ha la precedenza', () => {
  const r = P.parseNotification('Pagamento di 10,00 EUR presso BAR CENTRALE', { now: NOW, rules: [{ match: 'bar centrale', category: 'svago' }] });
  assert.strictEqual(r.category, 'svago'); assert.ok(/Regola personale/.test(r.reason));
});
t('merchantKey', () => {
  assert.strictEqual(P.merchantKey('Esselunga Milano'), 'esselunga');
  assert.strictEqual(P.merchantKey('Bar Centrale'), 'bar centrale');
  assert.strictEqual(P.merchantKey('PAYPAL *NETFLIX'), 'netflix');
});
t('Categoria da descrizione manuale', () => {
  assert.strictEqual(P.categorize({ merchant: 'spesa conad' }).category, 'spesa');
  assert.strictEqual(P.categorize({ merchant: 'benzina' }).category, 'auto');
  assert.strictEqual(P.categorize({ merchant: 'caffè' }).category, 'ristoranti');
});

console.log(`\n${pass} superati, ${fail} falliti`);
process.exit(fail ? 1 : 0);
