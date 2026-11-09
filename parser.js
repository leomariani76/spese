/*
 * parser.js — Riconoscimento dei pagamenti Nexi e categorizzazione automatica.
 * Funziona sia nel browser (window.SpeseParser) sia in Node (module.exports) per i test.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Categorie
  // ---------------------------------------------------------------------------
  const CATEGORIES = [
    { id: 'spesa',       name: 'Spesa alimentare',  emoji: '🛒', label: 'Spesa alimentare da' },
    { id: 'abbonamenti', name: 'Abbonamenti',       emoji: '🔁', label: 'Abbonamento' },
    { id: 'ristoranti',  name: 'Ristoranti e bar',  emoji: '🍽️', label: 'Bar/ristorante' },
    { id: 'casa',        name: 'Casa e bollette',   emoji: '🏠', label: 'Casa e bollette:' },
    { id: 'auto',        name: 'Auto e carburante', emoji: '⛽', label: 'Auto/carburante' },
    { id: 'trasporti',   name: 'Trasporti',         emoji: '🚆', label: 'Trasporto' },
    { id: 'shopping',    name: 'Shopping',          emoji: '🛍️', label: 'Acquisto da' },
    { id: 'salute',      name: 'Salute',            emoji: '💊', label: 'Salute:' },
    { id: 'cura',        name: 'Cura persona',      emoji: '💇', label: 'Cura persona:' },
    { id: 'svago',       name: 'Svago',             emoji: '🎟️', label: 'Tempo libero:' },
    { id: 'viaggi',      name: 'Viaggi',            emoji: '✈️', label: 'Viaggio:' },
    { id: 'prelievi',    name: 'Prelievi contanti', emoji: '🏧', label: 'Prelievo contanti', excluded: true },
    { id: 'altro',       name: 'Altro',             emoji: '📦', label: 'Pagamento a' },
  ];
  const CAT = {};
  CATEGORIES.forEach(c => { CAT[c.id] = c; });

  // Parole chiave per esercente. "*" finale = prefisso (es. "farmaci*" trova "farmacia").
  // Vince sempre la parola chiave più lunga (più specifica): "amazon prime" batte "amazon".
  const KEYWORDS = {
    spesa: ['esselunga', 'coop', 'ipercoop', 'novacoop', 'unicoop', 'conad', 'carrefour', 'lidl', 'eurospin', 'aldi',
      'pam', 'panorama', 'penny', 'penny market', 'md', 'md discount', 'despar', 'eurospar', 'interspar', 'spar',
      'iper', 'bennet', 'famila', 'tigre', 'simply', 'auchan', 'unes', 'u2 supermercato', 'todis', 'crai', 'sigma',
      'deco', 'il gigante', 'tuodi', 'naturasi', 'natura si', 'ekom', 'prix', 'basko', 'dok', 'iperal', 'emisfero',
      'mercato', 'minimarket', 'market', 'supermercat*', 'ipermercat*', 'alimentar*', 'macelleri*', 'panific*',
      'panetteri*', 'fruttivendol*', 'ortofrutt*', 'pescheri*', 'salumeri*', 'gastronomi*', 'discount',
      'cash and carry', 'cortilia', 'everli', 'esselunga a casa', 'carrefour express', 'coop alleanza'],
    abbonamenti: ['netflix', 'spotify', 'disney', 'disney plus', 'disneyplus', 'amazon prime', 'amzn prime',
      'prime video', 'primevideo', 'amazon music', 'apple com bill', 'apple com', 'itunes', 'icloud', 'apple music',
      'apple tv', 'apple one', 'google one', 'google storage', 'google play', 'youtube', 'youtube premium', 'dazn',
      'now tv', 'nowtv', 'sky', 'sky italia', 'timvision', 'mediaset infinity', 'infinity', 'paramount',
      'crunchyroll', 'chatgpt', 'openai', 'anthropic', 'claude ai', 'midjourney', 'adobe', 'microsoft', 'msft',
      'xbox', 'playstation', 'sony interactive', 'nintendo', 'audible', 'kindle unlimited', 'deezer', 'tidal',
      'patreon', 'linkedin', 'dropbox', 'canva', 'duolingo', 'notion', 'github', 'storytel', 'palestr*', 'gym',
      'mcfit', 'virgin active', 'fitactive', 'anytime fitness', 'fitness', 'abbonament*', 'subscription',
      'membership'],
    ristoranti: ['ristorant*', 'pizzeri*', 'trattori*', 'osteri*', 'bar', 'caffe', 'caffetteri*', 'cafe', 'coffee',
      'pub', 'birreri*', 'enoteca', 'sushi', 'mcdonald*', 'mc donald*', 'burger king', 'kfc', 'old wild west',
      'roadhouse', 'starbucks', 'autogrill', 'chef express', 'just eat', 'justeat', 'deliveroo', 'glovo',
      'uber eats', 'ubereats', 'gelateri*', 'pasticceri*', 'bistrot', 'kebab', 'poke', 'piadineri*', 'rosticceri*',
      'tavola calda', 'self service', 'mensa', 'grill', 'steakhouse', 'spontini', 'rossopomodoro', 'alice pizza',
      'signorvino', 'eataly', 'bakery', 'burger', 'paninoteca', 'tabacchi bar'],
    casa: ['enel', 'enel energia', 'a2a', 'hera', 'iren', 'edison', 'sorgenia', 'eni plenitude', 'plenitude', 'acea',
      'servizio elettrico', 'illumia', 'octopus energy', 'engie', 'e on', 'acquedott*', 'bollett*', 'condomin*',
      'affitto', 'tim', 'telecom', 'vodafone', 'windtre', 'wind tre', 'wind', 'iliad', 'fastweb', 'ho mobile',
      'kena', 'very mobile', 'postemobile', 'poste mobile', 'tiscali', 'ikea', 'leroy merlin', 'brico*', 'obi',
      'ferrament*', 'mondo convenienza', 'casa e', 'kasanova', 'tigota casa'],
    auto: ['eni', 'enilive', 'eni station', 'agip', 'q8', 'q8easy', 'ip', 'ip matic', 'tamoil', 'esso', 'shell',
      'api', 'total', 'totalenergies', 'erg', 'carburant*', 'distributor*', 'benzin*', 'stazione di servizio',
      'telepass', 'autostrad*', 'pedagg*', 'parchegg*', 'easypark', 'saba', 'apcoa', 'autolavaggio', 'meccanic*',
      'officina', 'gommist*', 'pneumatic*', 'bollo auto', 'aci', 'autoricambi', 'unipolmove'],
    trasporti: ['trenitalia', 'italo', 'italo treno', 'ntv', 'atm', 'atm milano', 'atac', 'gtt', 'amt', 'tper',
      'actv', 'anm', 'cotral', 'trenord', 'busitalia', 'flixbus', 'itabus', 'uber', 'free now', 'freenow', 'itaxi',
      'taxi', 'radiotaxi', 'share now', 'sharenow', 'zity', 'lime', 'bird', 'tier', 'bolt', 'bikemi', 'mycicero',
      'metropolitana'],
    shopping: ['amazon', 'amzn', 'amzn mktp', 'amazon marketplace', 'zalando', 'shein', 'temu', 'aliexpress', 'ebay',
      'vinted', 'subito', 'h e m', 'hm', 'zara', 'primark', 'ovs', 'coin', 'rinascente', 'la rinascente', 'decathlon',
      'mediaworld', 'media world', 'unieuro', 'euronics', 'trony', 'apple store', 'apple retail', 'foot locker',
      'footlocker', 'nike', 'adidas', 'uniqlo', 'bershka', 'pull e bear', 'stradivarius', 'mango', 'calzedonia',
      'intimissimi', 'tezenis', 'yamamay', 'benetton', 'kiabi', 'piazza italia', 'terranova', 'feltrinelli',
      'mondadori', 'libreri*', 'giocattol*', 'toys', 'gamestop', 'maisons du monde', 'flying tiger', 'pepco',
      'tedi', 'thun', 'swarovski', 'pandora', 'zooplus', 'arcaplanet', 'isola dei tesori', 'abbigliament*',
      'calzatur*', 'outlet', 'centro commerciale'],
    salute: ['farmaci*', 'parafarmaci*', 'ospedal*', 'clinica', 'poliambulator*', 'medic*', 'dentist*',
      'odontoiatr*', 'studio dentistico', 'ottic*', 'salmoiraghi', 'grandvision', 'laboratorio analisi',
      'analisi cliniche', 'cup', 'asl', 'ats', 'veterinar*', 'sanitari*', 'ortoped*', 'fisioterap*', 'psicolog*'],
    cura: ['parrucchier*', 'barbier*', 'barber*', 'hair', 'estetic*', 'centro estetico', 'beauty', 'sephora',
      'douglas', 'kiko', 'tigota', 'acqua e sapone', 'acqua sapone', 'profumeri*', 'nails', 'unghie', 'tatto*'],
    svago: ['cinema', 'uci', 'uci cinemas', 'the space', 'multisala', 'teatro', 'ticketone', 'ticketmaster',
      'vivaticket', 'eventbrite', 'steam', 'epic games', 'muse*', 'concert*', 'discoteca', 'bowling', 'gardaland',
      'mirabilandia', 'terme', 'centro benessere', 'piscina', 'lottomatica', 'sisal', 'snai', 'giochi', 'stadio',
      'acquario', 'zoo', 'luna park'],
    viaggi: ['booking', 'booking com', 'airbnb', 'expedia', 'hotel*', 'albergo', 'b e b', 'bnb', 'ostello', 'hostel',
      'trivago', 'edreams', 'volagratis', 'lastminute', 'ryanair', 'easyjet', 'wizz', 'wizz air', 'ita airways',
      'alitalia', 'vueling', 'volotea', 'lufthansa', 'aeroporto', 'airport', 'msc crociere', 'costa crociere',
      'grimaldi', 'moby', 'tirrenia', 'traghett*', 'autonoleggio', 'hertz', 'avis', 'europcar', 'sixt',
      'rentalcars', 'resort', 'agriturismo', 'campeggio'],
  };

  // Intermediari di pagamento da togliere dal nome esercente (es. "PAYPAL *NETFLIX").
  const PREFIXES = ['paypal', 'pp', 'sumup', 'sq', 'zettle', 'izettle', 'satispay', 'stripe', 'nexi', 'sp', 'iz',
    'pos', 'mypos', 'axerve', 'worldline'];
  const LEGAL = ['srl', 'spa', 'snc', 'sas', 'srls', 'sapa', 'ltd', 'inc', 'gmbh', 'bv', 'sa', 'ag', 'llc'];

  // ---------------------------------------------------------------------------
  // Utilità di testo
  // ---------------------------------------------------------------------------
  function deaccent(s) {
    return (s == null ? '' : String(s)).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function norm(s) {
    return deaccent(s).toLowerCase()
      .replace(/s\.?\s?r\.?\s?l\.?/g, ' srl ')
      .replace(/s\.\s?p\.\s?a\.?/g, ' spa ')
      .replace(/&/g, ' e ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  const COMPILED = [];
  Object.keys(KEYWORDS).forEach(cat => {
    KEYWORDS[cat].forEach(k => {
      const prefix = k.endsWith('*');
      const kw = norm(prefix ? k.slice(0, -1) : k);
      if (kw) COMPILED.push({ kw, prefix, cat, original: k.replace('*', '') });
    });
  });
  COMPILED.sort((a, b) => b.kw.length - a.kw.length);

  function matchKeyword(normText, kw, prefix) {
    const hay = ' ' + normText + ' ';
    return prefix ? hay.includes(' ' + kw) : hay.includes(' ' + kw + ' ');
  }

  function findBuiltIn(text) {
    const t = norm(text);
    if (!t) return null;
    for (const c of COMPILED) {
      if (matchKeyword(t, c.kw, c.prefix)) return c;
    }
    return null;
  }

  function findRule(text, rules) {
    const t = norm(text);
    if (!t || !rules || !rules.length) return null;
    // Regole personali: vince la parola chiave più lunga
    const sorted = rules.slice().sort((a, b) => norm(b.match).length - norm(a.match).length);
    for (const r of sorted) {
      const kw = norm(r.match);
      if (kw && matchKeyword(t, kw, true) && CAT[r.category]) return r;
    }
    return null;
  }

  function titleCase(s) {
    return s.toLowerCase().replace(/(^|[\s\-\/'(])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase());
  }

  // Ripulisce il nome esercente: toglie intermediari, codici, forme societarie.
  function cleanMerchant(raw) {
    if (!raw) return '';
    let s = String(raw).replace(/\s+/g, ' ').trim();
    // "PAYPAL *NETFLIX" -> "NETFLIX"
    s = s.replace(/^([a-z]{1,10})\s*\*\s*/i, (m, p) => (PREFIXES.includes(p.toLowerCase()) ? '' : m));
    let words = s.split(' ').filter(Boolean);
    while (words.length > 1 && PREFIXES.includes(norm(words[0]))) words.shift();
    words = words.filter(w => {
      const n = norm(w);
      if (!n) return false;
      if (LEGAL.includes(n.replace(/\s/g, ''))) return false;
      if (/^[*#]?\d{4,}$/.test(w)) return false;                       // numeri lunghi
      if (/^(?=.*\d)(?=.*[a-z])[a-z0-9]{6,}$/i.test(w)) return false;  // codici tipo P1A2B3C4
      return true;
    });
    s = words.join(' ').replace(/[*#]+/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/[\s,;:.\-]+$/, '');
    if (s.length > 42) s = s.slice(0, 42).replace(/\s+\S*$/, '');
    // Tutto maiuscolo -> Iniziali maiuscole
    if (s && s === s.toUpperCase()) s = titleCase(s);
    return s;
  }

  // Parola chiave "stabile" per creare regole personali da un esercente.
  const GENERIC_FIRST = ['bar', 'pizzeria', 'ristorante', 'trattoria', 'osteria', 'farmacia', 'supermercato',
    'market', 'caffe', 'cafe', 'hotel', 'il', 'la', 'lo', 'le', 'gli', 'i', 'l', 'the', 'da', 'di', 'al', 'alla',
    'mini', 'super', 'centro', 'studio', 'antica', 'nuovo', 'nuova', 'new', 'gelateria', 'pasticceria', 'pub',
    'tabacchi', 'macelleria', 'panificio', 'officina', 'parrucchiere', 'amazon', 'apple', 'google'];
  function merchantKey(merchant) {
    const words = norm(cleanMerchant(merchant)).split(' ').filter(w => w && !/^\d+$/.test(w));
    if (!words.length) return '';
    if (words.length === 1) return words[0];
    if (words[0].length >= 5 && !GENERIC_FIRST.includes(words[0])) return words[0];
    return words.slice(0, 2).join(' ');
  }

  // ---------------------------------------------------------------------------
  // Numeri e importi
  // ---------------------------------------------------------------------------
  function parseEuroNumber(str) {
    if (str == null) return NaN;
    let s = String(str).replace(/[^\d.,\-+]/g, '');
    let sign = 1;
    if (/^[\-]/.test(s) || /-$/.test(s)) sign = -1;
    s = s.replace(/[+\-]/g, '');
    if (!s || !/\d/.test(s)) return NaN;
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    let intPart, decPart = '';
    if (lastDot >= 0 && lastComma >= 0) {
      const dec = Math.max(lastDot, lastComma);
      intPart = s.slice(0, dec).replace(/[.,]/g, '');
      decPart = s.slice(dec + 1);
    } else if (lastComma >= 0 || lastDot >= 0) {
      const sep = lastComma >= 0 ? ',' : '.';
      const parts = s.split(sep);
      const last = parts[parts.length - 1];
      if (parts.length > 2 || (last.length === 3 && sep === '.')) {
        // separatore delle migliaia (es. 1.234 oppure 1.234.567)
        intPart = parts.join('');
      } else if (last.length === 3 && sep === ',' && parts[0].length <= 3 && parts[0] !== '0') {
        intPart = parts.join(''); // 1,234 -> 1234 (formato inglese)
      } else {
        intPart = parts.slice(0, -1).join('');
        decPart = last;
      }
    } else {
      intPart = s;
    }
    const n = parseFloat((intPart || '0') + (decPart ? '.' + decPart : ''));
    return isNaN(n) ? NaN : sign * Math.round(n * 100) / 100;
  }

  const NUM = "(\\d{1,3}(?:[.\\u00a0\\u202f']\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
  const CUR_EUR = '(?:eur(?:o)?\\b|€)';
  const RE_EUR_BEFORE = new RegExp(CUR_EUR + '\\s*([+\\-]?)\\s*' + NUM, 'gi');
  const RE_EUR_AFTER = new RegExp('([+\\-]?)' + NUM + '\\s*' + CUR_EUR, 'gi');
  const RE_FX_BEFORE = new RegExp('(usd|gbp|chf|\\$|£)\\s*' + NUM, 'gi');
  const RE_FX_AFTER = new RegExp(NUM + '\\s*(usd|gbp|chf|\\$|£)', 'gi');
  const AVOID_CTX = /(disponibil|residu|saldo|plafond|massimal|limite|soglia|spendibil|accumulat)/i;

  function collect(re, text, numGroup, signGroup) {
    const out = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const val = parseEuroNumber(m[numGroup]);
      if (!isNaN(val)) {
        const before = text.slice(Math.max(0, m.index - 32), m.index);
        out.push({ value: Math.abs(val), negative: signGroup && m[signGroup] === '-', index: m.index,
          end: m.index + m[0].length, avoid: AVOID_CTX.test(before), match: m[0] });
      }
    }
    return out;
  }

  function findAmount(text) {
    let cands = collect(RE_EUR_BEFORE, text, 2, 1).concat(collect(RE_EUR_AFTER, text, 2, 1));
    let currency = 'EUR';
    if (!cands.length) {
      cands = collect(RE_FX_BEFORE, text, 2).concat(collect(RE_FX_AFTER, text, 1));
      if (cands.length) currency = 'ESTERA';
    }
    if (!cands.length) {
      const re = /(?:^|[^\d\/.,:])(\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2})(?![\d\/:])/g;
      let m;
      while ((m = re.exec(text))) {
        const v = parseEuroNumber(m[1]);
        if (!isNaN(v)) cands.push({ value: v, index: m.index, end: m.index + m[0].length, avoid: false, match: m[1] });
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => (a.avoid - b.avoid) || (a.index - b.index));
    const best = cands[0];
    return { value: best.value, negative: !!best.negative, currency, index: best.index, end: best.end };
  }

  // ---------------------------------------------------------------------------
  // Date
  // ---------------------------------------------------------------------------
  const MONTHS = { gen: 1, gennaio: 1, feb: 2, febbraio: 2, mar: 3, marzo: 3, apr: 4, aprile: 4, mag: 5, maggio: 5,
    giu: 6, giugno: 6, lug: 7, luglio: 7, ago: 8, agosto: 8, set: 9, sett: 9, settembre: 9, ott: 10, ottobre: 10,
    nov: 11, novembre: 11, dic: 12, dicembre: 12,
    jan: 1, january: 1, february: 2, march: 3, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8,
    august: 8, sep: 9, september: 9, oct: 10, october: 10, november: 11, dec: 12, december: 12 };

  function mkDate(y, mo, d, h, mi) {
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
    const dt = new Date(y, mo - 1, d, h || 0, mi || 0, 0, 0);
    if (dt.getMonth() !== mo - 1) return null;
    return dt;
  }

  function findTime(text) {
    let m = /(?:\bore|\balle|\bh)\s*(\d{1,2})[:.](\d{2})\b/i.exec(text) || /(?:^|[^\d,.])(\d{1,2}):(\d{2})(?::\d{2})?\b/.exec(text);
    if (m) {
      const h = +m[1], mi = +m[2];
      if (h < 24 && mi < 60) return { h, mi };
    }
    return null;
  }

  function fixYear(y, mo, d, now) {
    // Data senza anno: usa l'anno corrente, o il precedente se cadrebbe nel futuro.
    let dt = mkDate(now.getFullYear(), mo, d);
    if (dt && dt.getTime() > now.getTime() + 2 * 86400000) return now.getFullYear() - 1;
    return now.getFullYear();
  }

  function findDate(text, now) {
    now = now || new Date();
    const t = deaccent(text);
    let m, date = null;
    // ISO 8601: 2026-11-09T12:34
    if ((m = /(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/.exec(t))) {
      date = mkDate(+m[1], +m[2], +m[3], m[4] ? +m[4] : null, m[5] ? +m[5] : null);
      if (date && m[4]) return { date, hasTime: true };
    }
    // 09/11/2026, 09-11-26, 9.11.2026
    if (!date && (m = /(?:^|[^\d*])(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)/.exec(t))) {
      let y = +m[3];
      if (y < 100) y += 2000;
      date = mkDate(y, +m[2], +m[1]);
    }
    // 9 novembre 2026 / 9 nov 2026 / 9 nov
    if (!date && (m = /(?:^|[^\d])(\d{1,2})\s+([a-z]{3,9})\.?\s*(\d{4})?/i.exec(t))) {
      const mo = MONTHS[m[2].toLowerCase()];
      if (mo) {
        const y = m[3] ? +m[3] : fixYear(null, mo, +m[1], now);
        date = mkDate(y, mo, +m[1]);
      }
    }
    // 9/11 senza anno
    if (!date && (m = /(?:^|[^\d*,.])(\d{1,2})\/(\d{1,2})(?![\d\/])/.exec(t))) {
      const d = +m[1], mo = +m[2];
      if (d <= 31 && mo <= 12) date = mkDate(fixYear(null, mo, d, now), mo, d);
    }
    const time = findTime(t);
    if (date) {
      if (time) date.setHours(time.h, time.mi);
      return { date, hasTime: !!time };
    }
    // Solo orario o parole relative
    if (/\bieri\b/i.test(t)) {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      if (time) d.setHours(time.h, time.mi); else d.setHours(12, 0);
      return { date: d, hasTime: !!time };
    }
    if (/\boggi\b/i.test(t) || time) {
      const d = new Date(now);
      if (time) d.setHours(time.h, time.mi);
      return { date: d, hasTime: !!time };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Tipo di operazione
  // ---------------------------------------------------------------------------
  const RE_DECLINED = /\b(non\s+autorizzat\w*|negat[ao]|rifiutat[ao]|declinat[ao]|respint[ao]|non\s+(?:e'?|è|é)?\s*andat[ao]\s+a\s+buon\s+fine|declined|fondi\s+insufficienti|tentativo\s+fallito)\b/i;
  const RE_REFUND = /\b(rimbors\w*|storn\w*|riaccredit\w*|accredit\w*|refund\w*|annullat\w*|reso)\b/i;
  const RE_WITHDRAW = /\b(preliev\w*|prelevament\w*|withdrawal|cash\s+advance|anticipo\s+contant\w*)\b/i;
  const RE_RECURRING = /\b(ricorrent\w*|recurring|abbonament\w*|rinnov\w*|addebito\s+periodic\w*|pagamento\s+periodic\w*|subscription)\b/i;

  function findChannel(text) {
    const t = deaccent(text).toLowerCase();
    if (/apple\s*pay/.test(t)) return 'Apple Pay';
    if (/google\s*pay|gpay/.test(t)) return 'Google Pay';
    if (/samsung\s*pay/.test(t)) return 'Samsung Pay';
    if (RE_WITHDRAW.test(t)) return 'Prelievo';
    if (RE_RECURRING.test(t)) return 'Ricorrente';
    if (/\b(online|on-line|e-?commerce|internet|web|a distanza|3d ?secure|3ds)\b/.test(t)) return 'Online';
    if (/contactless|senza contatto|\bcless\b/.test(t)) return 'Contactless';
    if (/\b(pos|in negozio|esercizio commerciale)\b/.test(t)) return 'POS';
    return '';
  }

  // ---------------------------------------------------------------------------
  // Esercente
  // ---------------------------------------------------------------------------
  const STOP = "(?:il|in\\s+data|del|dell|alle|ore|con|carta|per|importo|di|da|autorizzat\\w*|effettuat\\w*|eseguit\\w*|approvat\\w*|tramite|mediante|eur|euro|data|totale|saldo|disponibil\\w*|e'\\s+stat\\w*|è\\s+stat\\w*)";
  const STOP_LOOKAHEAD = '(?=$|\\s+' + STOP + '\\b|\\s*[,;|()\\[\\]€]|\\.\\s|\\.$|\\s-\\s|\\s\\d{1,2}[\\/.\\-]\\d{1,2}|\\s\\d+[.,]\\d{2}|\\s\\*+\\d)';
  const MERCHANT_RES = [
    new RegExp('(?:esercente|merchant|beneficiario|negozio)\\s*[:\\-]\\s*(.+?)' + STOP_LOOKAHEAD, 'i'),
    new RegExp("(?:\\bpresso(?:\\s+l'esercente)?|\\bc\\s?\\/\\s?o|\\bc\\.o\\.|\\bverso|\\ba\\s+favore\\s+di|\\bat)\\s+(.+?)" + STOP_LOOKAHEAD, 'i'),
    new RegExp('\\b(?:su|sul\\s+sito)\\s+(.+?)' + STOP_LOOKAHEAD, 'i'),
    new RegExp('\\bda\\s+(.+?)' + STOP_LOOKAHEAD, 'i'),
  ];
  const BAD_START = /^(la|tua|sua|vostra|carta|conto|parte|questo|questa|oggi|ieri|un|una|\d)/i;
  const BOILER = new Set(['nexi', 'pay', 'apple', 'google', 'samsung', 'pagamento', 'pagamenti', 'autorizzata',
    'autorizzato', 'autorizzazione', 'op', 'operazione', 'carta', 'online', 'contactless', 'di', 'il', 'alle', 'ore',
    'presso', 'con', 'la', 'tua', 'sua', 'effettuato', 'effettuata', 'hai', 'un', 'una', 'eur', 'euro', 'del',
    'importo', 'notifica', 'acquisto', 'transazione', 'gentile', 'cliente', 'avviso', 'alert', 'sms', 'debit',
    'credit', 'prepagata', 'visa', 'mastercard', 'pos', 'ricorrente', 'storno', 'rimborso', 'prelievo', 'atm',
    'nuovo', 'nuova', 'movimento', 'spesa', 'ok', 'esito', 'positivo', 'info', 'servizio', 'per', 'su', 'da', 'e',
    'stata', 'stato', 'utilizzata', 'tua', 'tuo', 'n', 'nr', 'num', 'oggi', 'ieri', 'terminale', 'web']);

  function findMerchant(text, amountInfo) {
    for (const re of MERCHANT_RES) {
      const m = re.exec(text);
      if (m) {
        let cand = m[1].trim().replace(/^["'«]|["'»]$/g, '');
        if (cand && !BAD_START.test(cand) && /[a-z]/i.test(cand) && cand.length >= 2) return cand;
      }
    }
    // Fallback: sequenza di parole in MAIUSCOLO che non siano formule standard
    const tokens = text.replace(/[|]/g, ' ').split(/\s+/);
    let best = '', cur = [];
    const flush = () => {
      const s = cur.join(' ');
      if (s.length > best.length) best = s;
      cur = [];
    };
    for (const tok of tokens) {
      const clean = tok.replace(/[.,;:!?()]+$/g, '').replace(/^[(]+/, '');
      const isUpperWord = /^[A-ZÀ-Ý0-9&'.\-\/*]{2,}$/.test(clean) && /[A-Z]/.test(clean);
      if (isUpperWord && !BOILER.has(norm(clean)) && !/^\*?\d/.test(clean) && !/€/.test(clean)) cur.push(clean);
      else flush();
    }
    flush();
    if (best) return best;
    // Ultimo tentativo: testo dopo l'importo
    if (amountInfo) {
      const after = text.slice(amountInfo.end).replace(/^[\s,.:\-]+/, '');
      const words = after.split(/\s+/).filter(w => !BOILER.has(norm(w)) && /[a-z]/i.test(w)).slice(0, 3);
      if (words.length) return words.join(' ');
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // Categorizzazione con motivazione
  // ---------------------------------------------------------------------------
  function categorize(info, rules) {
    const merchant = info.merchant || '';
    const text = info.text || '';
    const both = merchant + ' ' + text;
    if (info.isWithdrawal) {
      return { category: 'prelievi', reason: 'La notifica indica un prelievo di contanti (non conteggiato nel totale, così le spese in contanti non vengono contate due volte).' };
    }
    const rule = findRule(merchant, rules) || findRule(text, rules);
    if (rule) {
      return { category: rule.category, reason: 'Regola personale: «' + rule.match + '» → ' + CAT[rule.category].name + '.' };
    }
    let hit = merchant ? findBuiltIn(merchant) : null;
    let where = "dall'esercente";
    if (!hit && text) { hit = findBuiltIn(text); where = 'dal testo della notifica'; }
    if (hit) {
      let reason = 'Riconosciuto ' + where + ': «' + hit.original + '» è tra gli esercenti di tipo ' + CAT[hit.cat].name + '.';
      if (info.isRecurring && hit.cat !== 'abbonamenti') reason += ' (La notifica indica anche un pagamento ricorrente.)';
      return { category: hit.cat, reason };
    }
    if (info.isRecurring) {
      return { category: 'abbonamenti', reason: 'La notifica indica un pagamento ricorrente/abbonamento.' };
    }
    void both;
    return { category: 'altro', reason: 'Esercente non riconosciuto: messo in Altro. Se cambi categoria, l\'app se lo ricorderà per i prossimi pagamenti.' };
  }

  function describe(category, merchant, isRefund) {
    const m = merchant || '';
    if (isRefund) return m ? 'Rimborso da ' + m : 'Rimborso';
    const c = CAT[category] || CAT.altro;
    if (!m) return c.id === 'altro' ? 'Pagamento con carta' : c.name;
    if (c.id === 'abbonamenti' && /abbonament/i.test(m)) return m;
    return c.label + ' ' + m;
  }

  // ---------------------------------------------------------------------------
  // Analisi di una singola notifica (testo libero: push, SMS, email)
  // ---------------------------------------------------------------------------
  function parseNotification(raw, opts) {
    opts = opts || {};
    const now = opts.now || new Date();
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    const res = { ok: false, text, amount: null, currency: 'EUR', merchant: '', merchantRaw: '', date: null,
      hasDate: false, hasTime: false, channel: '', isRefund: false, isWithdrawal: false, isRecurring: false,
      isDeclined: false, category: 'altro', reason: '', description: '', warnings: [] };
    if (!text) return res;

    const amt = findAmount(text);
    res.isDeclined = RE_DECLINED.test(text);
    res.isRefund = RE_REFUND.test(text) || !!(amt && amt.negative);
    res.isWithdrawal = RE_WITHDRAW.test(text);
    res.isRecurring = RE_RECURRING.test(text);
    res.channel = findChannel(text);

    if (amt) { res.amount = amt.value; res.currency = amt.currency; }
    if (amt && amt.currency !== 'EUR') res.warnings.push('Importo in valuta estera: controlla il valore in euro.');

    const d = findDate(text, now);
    if (d) { res.date = d.date; res.hasDate = true; res.hasTime = d.hasTime; }

    res.merchantRaw = res.isWithdrawal && !/presso|c\/o/i.test(text) ? '' : findMerchant(text, amt);
    res.merchant = cleanMerchant(res.merchantRaw);

    const cat = categorize({ merchant: res.merchant, text, isWithdrawal: res.isWithdrawal, isRecurring: res.isRecurring }, opts.rules);
    res.category = cat.category;
    res.reason = cat.reason;
    res.description = res.isWithdrawal ? ('Prelievo contanti' + (res.merchant ? ' ' + res.merchant : ''))
      : describe(res.category, res.merchant, res.isRefund);
    res.ok = res.amount != null && res.amount > 0;
    if (!res.ok) res.warnings.push('Importo non trovato nel testo.');
    if (res.isDeclined) res.warnings.push('Sembra un pagamento NEGATO/non autorizzato: di solito non va registrato.');
    return res;
  }

  // ---------------------------------------------------------------------------
  // Voce salvata dai Comandi Rapidi
  //   @@W|data|importo|esercente|carta      (automazione Wallet / Apple Pay)
  //   @@T|data|testo della notifica/SMS     (automazione Messaggi o Email)
  // ---------------------------------------------------------------------------
  function parseEntry(raw, opts) {
    opts = opts || {};
    const now = opts.now || new Date();
    const entry = String(raw || '').trim();
    const parts = entry.split('|').map(s => s.trim());
    const tag = (parts[0] || '').toUpperCase();

    if (tag === 'W' && parts.length >= 3) {
      const d = findDate(parts[1] || '', now);
      const amountStr = parts[2] || '';
      const amount = parseEuroNumber(amountStr);
      const merchantRaw = parts[3] || '';
      const merchant = cleanMerchant(merchantRaw);
      const extra = parts.slice(4).join(' ');
      const isRefund = amount < 0 || RE_REFUND.test(extra);
      const cat = categorize({ merchant, text: '', isWithdrawal: false, isRecurring: false }, opts.rules);
      const res = { ok: !isNaN(amount) && Math.abs(amount) > 0, text: entry, amount: isNaN(amount) ? null : Math.abs(amount),
        currency: /[$£]|usd|gbp|chf/i.test(amountStr) ? 'ESTERA' : 'EUR', merchant, merchantRaw, date: d ? d.date : null,
        hasDate: !!d, hasTime: d ? d.hasTime : false, channel: 'Apple Pay', isRefund, isWithdrawal: false,
        isRecurring: false, isDeclined: false, category: cat.category, reason: cat.reason,
        description: describe(cat.category, merchant, isRefund), warnings: [], source: 'wallet', card: extra };
      if (res.currency !== 'EUR') res.warnings.push('Importo in valuta estera: controlla il valore in euro.');
      if (!res.ok) res.warnings.push('Importo non leggibile: «' + amountStr + '».');
      return res;
    }

    let fallbackDate = null;
    let body = entry;
    if (tag === 'T' || tag === 'S' || tag === 'E' || tag === 'N') {
      const d = findDate(parts[1] || '', now);
      fallbackDate = d;
      body = parts.slice(2).join(' | ');
    }
    const res = parseNotification(body, opts);
    // Se il testo non contiene la data, usa quella registrata dal comando rapido
    if (fallbackDate && (!res.hasDate || (!res.hasTime && fallbackDate.hasTime && sameDay(res.date, fallbackDate.date)))) {
      res.date = fallbackDate.date; res.hasDate = true; res.hasTime = fallbackDate.hasTime;
    } else if (fallbackDate && res.hasDate && !res.hasTime && fallbackDate.hasTime) {
      // data trovata nel testo, ora presa dal comando
    }
    res.source = tag === 'E' ? 'email' : (tag === 'T' || tag === 'S' ? 'sms' : 'testo');
    return res;
  }

  function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // Divide un file/testo in voci singole.
  function splitEntries(content) {
    const text = String(content || '').replace(/\r\n?/g, '\n');
    if (text.includes('@@')) {
      return text.split('@@').map(s => s.replace(/\n+/g, ' ').trim()).filter(Boolean);
    }
    // Senza marcatori: paragrafi separati da riga vuota; se ogni riga ha un importo, una voce per riga.
    const paragraphs = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    const out = [];
    paragraphs.forEach(p => {
      const lines = p.split('\n').map(s => s.trim()).filter(Boolean);
      const withAmount = lines.filter(l => findAmount(l));
      if (lines.length > 1 && withAmount.length === lines.length) out.push(...lines);
      else out.push(lines.join(' '));
    });
    return out;
  }

  // Hash semplice e stabile (FNV-1a) per riconoscere voci già importate.
  function hashKey(s) {
    let h = 0x811c9dc5;
    const str = norm(s) + '#' + String(s).length;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  }

  function parseBatch(content, opts) {
    return splitEntries(content).map(raw => {
      const parsed = parseEntry(raw, opts);
      return { raw, key: hashKey(raw), parsed };
    });
  }

  const api = { CATEGORIES, CAT, KEYWORDS, norm, cleanMerchant, merchantKey, parseEuroNumber, findAmount, findDate,
    findMerchant, findChannel, categorize, describe, parseNotification, parseEntry, splitEntries, parseBatch, hashKey,
    findBuiltIn, findRule };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.SpeseParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
