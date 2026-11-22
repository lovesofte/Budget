/*
 * calc.js — Moteur de calcul de l'application Budget.
 * Fonctions pures : aucune lecture du DOM, aucun stockage.
 * Tous les montants sont stockés en CENTIMES (entiers) pour éviter les
 * erreurs d'arrondi des nombres à virgule.
 */
(function (root) {
  'use strict';

  /* ---------- Référentiels ---------- */

  const DEFAULT_CATEGORIES = [
    { id: 'courses', name: 'Courses alimentaires', color: '#6B9A78' },
    { id: 'restaurants', name: 'Restaurants', color: '#C7915E' },
    { id: 'transport', name: 'Transport / carburant', color: '#6A8FB8' },
    { id: 'abonnements', name: 'Abonnements', color: '#9585BE' },
    { id: 'credit', name: 'Crédit', color: '#B86B6B' },
    { id: 'shopping', name: 'Shopping', color: '#C483A6' },
    { id: 'loisirs', name: 'Activités / loisirs', color: '#5FA3A6' },
    { id: 'sante', name: 'Santé', color: '#8FB06A' },
    { id: 'logement', name: 'Logement', color: '#8C7A66' },
    { id: 'factures', name: 'Factures', color: '#B8A05A' },
    { id: 'autres', name: 'Autres', color: '#8E8E93' }
  ];

  const CATEGORY_COLORS = ['#6B9A78', '#C7915E', '#6A8FB8', '#9585BE', '#B86B6B', '#C483A6',
    '#5FA3A6', '#8FB06A', '#8C7A66', '#B8A05A', '#7C8BA1', '#A3876A', '#8E8E93'];

  const INCOME_SOURCES = [
    { id: 'salaire', name: 'Salaire' },
    { id: 'alternance', name: 'Salaire d’alternance' },
    { id: 'aides', name: 'Aides' },
    { id: 'complementaires', name: 'Revenus complémentaires' },
    { id: 'autres', name: 'Autres' }
  ];

  const PAYMENT_METHODS = [
    { id: 'applepay', name: 'Apple Pay' },
    { id: 'cb', name: 'Carte bancaire' },
    { id: 'prelevement', name: 'Prélèvement' },
    { id: 'virement', name: 'Virement' },
    { id: 'especes', name: 'Espèces' },
    { id: 'cheque', name: 'Chèque' },
    { id: 'autre', name: 'Autre' }
  ];

  const SAVINGS_KINDS = [
    { id: 'livretA', name: 'Livret A' },
    { id: 'ldds', name: 'LDDS' },
    { id: 'lep', name: 'LEP' },
    { id: 'autreLivret', name: 'Autre livret' },
    { id: 'perso', name: 'Épargne personnelle' },
    { id: 'assuranceVie', name: 'Assurance vie' },
    { id: 'pea', name: 'PEA' },
    { id: 'projet', name: 'Projet / objectif' },
    { id: 'autre', name: 'Autre placement' }
  ];

  const MAX_AMOUNT = 1000000000; // 10 000 000,00 € en centimes

  /* ---------- Montants ---------- */

  /** Convertit une saisie ("12,50", "1 234.5", "12") en centimes. Renvoie null si invalide ou négatif. */
  function parseAmount(input) {
    if (typeof input === 'number') {
      return Number.isFinite(input) && input >= 0 ? Math.round(input * 100) : null;
    }
    if (typeof input !== 'string') return null;
    let s = input.trim().replace(/[\s  €]/g, '');
    if (!s) return null;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lastComma > -1) {
      s = s.replace(',', '.');
    }
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const parts = s.split('.');
    const cents = parseInt(parts[0], 10) * 100 + parseInt(((parts[1] || '') + '00').slice(0, 2), 10);
    return cents > MAX_AMOUNT ? null : cents;
  }

  /** Comme parseAmount mais accepte un signe moins (solde de compte à découvert). */
  function parseSignedAmount(input) {
    if (typeof input !== 'string') return parseAmount(input);
    const s = input.trim();
    if (/^[-−]/.test(s)) {
      const v = parseAmount(s.slice(1));
      return v === null ? null : -v;
    }
    return parseAmount(s);
  }

  const currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

  function formatAmount(cents) {
    return currencyFormatter.format((Number(cents) || 0) / 100);
  }

  /** Centimes → texte modifiable dans un champ ("12,50"). */
  function centsToInput(cents) {
    if (cents === null || cents === undefined || cents === '') return '';
    const neg = cents < 0;
    const abs = Math.abs(Math.round(cents));
    const str = Math.floor(abs / 100) + ',' + String(abs % 100).padStart(2, '0');
    return (neg ? '-' : '') + str;
  }

  /* ---------- Dates (format AAAA-MM-JJ, heure locale) ---------- */

  const pad = (n) => String(n).padStart(2, '0');

  function toISODate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function isValidISODate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  const monthOf = (iso) => iso.slice(0, 7);

  function daysInMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }

  function addMonths(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }

  /** Date du jour `day` dans le mois `ym`, ramenée au dernier jour si le mois est plus court. */
  function dateInMonth(ym, day) {
    return ym + '-' + pad(Math.max(1, Math.min(day, daysInMonth(ym))));
  }

  const lastDayOfMonth = (ym) => dateInMonth(ym, 31);

  /** Date suivante d'un paiement périodique. anchorDay évite la dérive (31 → 28 → 28…). */
  function addPeriod(iso, frequency, anchorDay) {
    const [y, m, d] = iso.split('-').map(Number);
    const day = anchorDay || d;
    const ym = frequency === 'yearly' ? (y + 1) + '-' + pad(m) : addMonths(y + '-' + pad(m), 1);
    return dateInMonth(ym, day);
  }

  function monthLabel(ym, short) {
    const [y, m] = ym.split('-').map(Number);
    const s = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function dateLabel(iso, withYear) {
    const [y, m, d] = iso.split('-').map(Number);
    const opts = { day: 'numeric', month: 'short' };
    if (withYear) opts.year = 'numeric';
    return new Date(y, m - 1, d).toLocaleDateString('fr-FR', opts);
  }

  /* ---------- Identifiants ---------- */

  function uid() {
    if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- État par défaut & validation ---------- */

  function createDefaultState() {
    return {
      version: 1,
      settings: { theme: 'auto', openingBalance: 0, onboarded: false, lastExport: null, createdAt: new Date().toISOString() },
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, builtin: true })),
      transactions: [],
      recurringIncomes: [],
      credits: [],
      subscriptions: [],
      savingsAccounts: [],
      skips: {},
      budgets: {},
      merchantRules: {},
      importedKeys: {}
    };
  }

  const isInt = (v) => Number.isInteger(v);
  const str = (v, max) => (typeof v === 'string' ? v : '').slice(0, max || 200);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const clampDay = (v) => Math.max(1, Math.min(31, parseInt(v, 10) || 1));

  /**
   * Nettoie et valide un état (chargé ou importé).
   * Lève une erreur si la structure n'est pas reconnaissable.
   */
  function normalizeState(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.transactions)) {
      throw new Error('Ce fichier n’est pas une sauvegarde valide de l’application.');
    }
    const base = createDefaultState();
    const s = obj.settings || {};
    base.settings = {
      theme: ['auto', 'light', 'dark'].includes(s.theme) ? s.theme : 'auto',
      openingBalance: isInt(s.openingBalance) ? s.openingBalance : 0,
      onboarded: s.onboarded !== false,
      lastExport: typeof s.lastExport === 'string' ? s.lastExport : null,
      lastWalletImport: typeof s.lastWalletImport === 'string' ? s.lastWalletImport : null,
      createdAt: typeof s.createdAt === 'string' ? s.createdAt : base.settings.createdAt
    };

    // Catégories : on garde celles de l'utilisateur et on rajoute les catégories de base manquantes.
    const seen = new Set();
    const cats = [];
    for (const c of arr(obj.categories)) {
      if (!c || typeof c.id !== 'string' || seen.has(c.id) || !str(c.name).trim()) continue;
      seen.add(c.id);
      cats.push({ id: c.id, name: str(c.name, 60).trim(), color: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : '#8E8E93', builtin: DEFAULT_CATEGORIES.some((d) => d.id === c.id) });
    }
    for (const d of DEFAULT_CATEGORIES) if (!seen.has(d.id)) cats.push({ ...d, builtin: true });
    base.categories = cats;
    const catIds = new Set(cats.map((c) => c.id));

    base.savingsAccounts = arr(obj.savingsAccounts).filter((a) => a && typeof a.id === 'string' && str(a.name).trim()).map((a) => ({
      id: a.id, name: str(a.name, 60).trim(),
      kind: SAVINGS_KINDS.some((k) => k.id === a.kind) ? a.kind : 'autre',
      initialBalance: isInt(a.initialBalance) ? a.initialBalance : 0,
      goal: isInt(a.goal) && a.goal > 0 ? a.goal : null,
      targetDate: isValidISODate(a.targetDate) ? a.targetDate : null
    }));
    const accIds = new Set(base.savingsAccounts.map((a) => a.id));

    base.credits = arr(obj.credits).filter((c) => c && typeof c.id === 'string' && str(c.name).trim()).map((c) => ({
      id: c.id, name: str(c.name, 60).trim(),
      initial: isInt(c.initial) && c.initial >= 0 ? c.initial : 0,
      remainingStart: isInt(c.remainingStart) && c.remainingStart >= 0 ? c.remainingStart : 0,
      monthly: isInt(c.monthly) && c.monthly >= 0 ? c.monthly : 0,
      day: clampDay(c.day),
      endDate: isValidISODate(c.endDate) ? c.endDate : null
    }));

    base.subscriptions = arr(obj.subscriptions).filter((x) => x && typeof x.id === 'string' && str(x.name).trim()).map((x) => {
      const nextDate = isValidISODate(x.nextDate) ? x.nextDate : toISODate(new Date());
      return {
        id: x.id, name: str(x.name, 60).trim(),
        price: isInt(x.price) && x.price >= 0 ? x.price : 0,
        frequency: x.frequency === 'yearly' ? 'yearly' : 'monthly',
        nextDate,
        anchorDay: clampDay(x.anchorDay || Number(nextDate.slice(8, 10))),
        categoryId: catIds.has(x.categoryId) ? x.categoryId : 'abonnements',
        active: x.active !== false
      };
    });

    base.recurringIncomes = arr(obj.recurringIncomes).filter((r) => r && typeof r.id === 'string' && str(r.name).trim()).map((r) => ({
      id: r.id, name: str(r.name, 60).trim(),
      source: INCOME_SOURCES.some((x) => x.id === r.source) ? r.source : 'autres',
      amount: isInt(r.amount) && r.amount >= 0 ? r.amount : 0,
      day: clampDay(r.day),
      active: r.active !== false
    }));

    const txIds = new Set();
    base.transactions = arr(obj.transactions).filter((t) => {
      if (!t || typeof t.id !== 'string' || txIds.has(t.id)) return false;
      if (!['expense', 'income', 'saving'].includes(t.type)) return false;
      if (!isInt(t.amount) || t.amount <= 0 || !isValidISODate(t.date)) return false;
      if (t.type === 'saving' && !accIds.has(t.accountId)) return false;
      txIds.add(t.id);
      return true;
    }).map((t) => {
      const o = { id: t.id, type: t.type, amount: t.amount, date: t.date, note: str(t.note, 120), createdAt: Number(t.createdAt) || 0 };
      if (t.type === 'expense') {
        o.categoryId = catIds.has(t.categoryId) ? t.categoryId : 'autres';
        o.payment = PAYMENT_METHODS.some((p) => p.id === t.payment) ? t.payment : '';
        if (typeof t.creditId === 'string') o.creditId = t.creditId;
        if (typeof t.subscriptionId === 'string') o.subscriptionId = t.subscriptionId;
        if (typeof t.merchant === 'string' && t.merchant.trim()) o.merchant = str(t.merchant, 120);
        if (t.imported === true) o.imported = true;
      } else if (t.type === 'income') {
        o.source = INCOME_SOURCES.some((x) => x.id === t.source) ? t.source : 'autres';
        if (typeof t.recurringId === 'string') o.recurringId = t.recurringId;
      } else {
        o.accountId = t.accountId;
        o.direction = ['in', 'out', 'interest'].includes(t.direction) ? t.direction : 'in';
      }
      return o;
    });

    base.skips = {};
    if (obj.skips && typeof obj.skips === 'object') {
      for (const k of Object.keys(obj.skips)) if (obj.skips[k] === true) base.skips[k] = true;
    }
    base.budgets = {};
    if (obj.budgets && typeof obj.budgets === 'object') {
      for (const k of Object.keys(obj.budgets)) if (catIds.has(k) && isInt(obj.budgets[k]) && obj.budgets[k] > 0) base.budgets[k] = obj.budgets[k];
    }
    base.merchantRules = {};
    if (obj.merchantRules && typeof obj.merchantRules === 'object') {
      for (const k of Object.keys(obj.merchantRules)) if (k && catIds.has(obj.merchantRules[k])) base.merchantRules[k] = obj.merchantRules[k];
    }
    base.importedKeys = {};
    if (obj.importedKeys && typeof obj.importedKeys === 'object') {
      for (const k of Object.keys(obj.importedKeys)) if (obj.importedKeys[k] === true) base.importedKeys[k] = true;
    }
    return base;
  }

  /* ---------- Soldes ---------- */

  const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);
  const inMonth = (t, ym) => t.date.startsWith(ym + '-');

  /** Effet d'une opération sur le compte courant. Les versements d'épargne sortent du compte
   *  courant mais ne sont PAS des dépenses ; les intérêts n'y touchent pas. */
  function currentAccountEffect(t) {
    if (t.type === 'income') return t.amount;
    if (t.type === 'expense') return -t.amount;
    if (t.type === 'saving') {
      if (t.direction === 'in') return -t.amount;
      if (t.direction === 'out') return t.amount;
    }
    return 0;
  }

  /** Solde disponible du compte courant (optionnellement jusqu'à une date incluse). */
  function accountBalance(state, uptoISO) {
    let b = state.settings.openingBalance || 0;
    for (const t of state.transactions) {
      if (uptoISO && t.date > uptoISO) continue;
      b += currentAccountEffect(t);
    }
    return b;
  }

  function savingsMovementNet(state, accountId, uptoISO, excludeTxId) {
    let n = 0;
    for (const t of state.transactions) {
      if (t.type !== 'saving' || t.accountId !== accountId || t.id === excludeTxId) continue;
      if (uptoISO && t.date > uptoISO) continue;
      n += t.direction === 'out' ? -t.amount : t.amount;
    }
    return n;
  }

  function savingsBalance(state, accountId, uptoISO, excludeTxId) {
    const acc = state.savingsAccounts.find((a) => a.id === accountId);
    if (!acc) return 0;
    return acc.initialBalance + savingsMovementNet(state, accountId, uptoISO, excludeTxId);
  }

  function totalSavings(state, uptoISO) {
    return sum(state.savingsAccounts, (a) => savingsBalance(state, a.id, uptoISO));
  }

  function goalProgress(balance, goal) {
    if (!goal || goal <= 0) return null;
    return Math.max(0, Math.min(1, balance / goal));
  }

  /* ---------- Crédits ---------- */

  function creditPaid(state, creditId, excludeTxId) {
    return sum(state.transactions.filter((t) => t.type === 'expense' && t.creditId === creditId && t.id !== excludeTxId), (t) => t.amount);
  }

  function creditRemaining(state, credit, excludeTxId) {
    return Math.max(0, credit.remainingStart - creditPaid(state, credit.id, excludeTxId));
  }

  function creditProgress(credit, remaining) {
    if (!credit.initial) return remaining === 0 ? 1 : 0;
    return Math.max(0, Math.min(1, (credit.initial - remaining) / credit.initial));
  }

  function creditPaidInMonth(state, creditId, ym) {
    return state.transactions.some((t) => t.type === 'expense' && t.creditId === creditId && inMonth(t, ym));
  }

  /** Date estimée de la dernière mensualité, d'après le restant dû et la mensualité. */
  function creditEstimatedEnd(state, credit, todayISO) {
    const remaining = creditRemaining(state, credit);
    if (remaining <= 0 || credit.monthly <= 0) return null;
    const months = Math.ceil(remaining / credit.monthly);
    const ym = monthOf(todayISO);
    const firstMonth = creditPaidInMonth(state, credit.id, ym) ? addMonths(ym, 1) : ym;
    return dateInMonth(addMonths(firstMonth, months - 1), credit.day);
  }

  function totalCreditsRemaining(state) {
    return sum(state.credits, (c) => creditRemaining(state, c));
  }

  /* ---------- Abonnements ---------- */

  function subscriptionTotals(state) {
    const active = state.subscriptions.filter((s) => s.active);
    const monthlySubs = sum(active.filter((s) => s.frequency === 'monthly'), (s) => s.price);
    const yearlySubs = sum(active.filter((s) => s.frequency === 'yearly'), (s) => s.price);
    return { perMonth: Math.round(monthlySubs + yearlySubs / 12), perYear: monthlySubs * 12 + yearlySubs, count: active.length };
  }

  /* ---------- Échéances du mois ---------- */

  const skipKey = (kind, id, ym) => kind + ':' + id + ':' + ym;

  /**
   * Revenus attendus et prélèvements prévus pour le mois en cours qui n'ont pas encore été enregistrés.
   */
  function dueItems(state, todayISO) {
    const ym = monthOf(todayISO);
    const end = lastDayOfMonth(ym);
    const skips = state.skips || {};
    const items = [];
    for (const r of state.recurringIncomes) {
      if (!r.active || skips[skipKey('income', r.id, ym)]) continue;
      const received = state.transactions.some((t) => t.type === 'income' && t.recurringId === r.id && inMonth(t, ym));
      if (!received) items.push({ kind: 'income', id: r.id, name: r.name, amount: r.amount, date: dateInMonth(ym, r.day) });
    }
    for (const c of state.credits) {
      const remaining = creditRemaining(state, c);
      if (remaining <= 0 || c.monthly <= 0 || skips[skipKey('credit', c.id, ym)]) continue;
      if (!creditPaidInMonth(state, c.id, ym)) {
        items.push({ kind: 'credit', id: c.id, name: c.name, amount: Math.min(c.monthly, remaining), date: dateInMonth(ym, c.day) });
      }
    }
    for (const s of state.subscriptions) {
      if (!s.active || s.nextDate > end) continue;
      items.push({ kind: 'subscription', id: s.id, name: s.name, amount: s.price, date: s.nextDate, overdue: s.nextDate < ym + '-01' });
    }
    for (const it of items) if (!it.overdue && it.date < todayISO && it.kind !== 'income') it.late = true;
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return items;
  }

  function pendingTotals(items) {
    return {
      income: sum(items.filter((i) => i.kind === 'income'), (i) => i.amount),
      charges: sum(items.filter((i) => i.kind !== 'income'), (i) => i.amount)
    };
  }

  /** Reste à vivre jusqu'à la fin du mois = solde + revenus attendus − prélèvements à venir. */
  function remainingToLive(state, todayISO) {
    const p = pendingTotals(dueItems(state, todayISO));
    return accountBalance(state) + p.income - p.charges;
  }

  /* ---------- Objectifs d'épargne ---------- */

  function monthDiff(fromYM, toYM) {
    const [a, b] = fromYM.split('-').map(Number);
    const [c, d] = toYM.split('-').map(Number);
    return (c - a) * 12 + (d - b);
  }

  /** Mouvement net d'un compte d'épargne sur un mois (versements + intérêts − retraits). */
  function savingsNetInMonth(state, accountId, ym) {
    let n = 0;
    for (const t of state.transactions) {
      if (t.type !== 'saving' || t.accountId !== accountId || !inMonth(t, ym)) continue;
      n += t.direction === 'out' ? -t.amount : t.amount;
    }
    return n;
  }

  /**
   * Plan d'un objectif : progression, montant restant, et versement mensuel nécessaire
   * pour atteindre l'objectif à la date visée (le mois en cours compte comme un mois de versement).
   */
  function goalPlan(state, acc, todayISO) {
    if (!acc || !acc.goal) return null;
    const balance = savingsBalance(state, acc.id);
    const remaining = Math.max(0, acc.goal - balance);
    const ym = monthOf(todayISO);
    const thisMonth = savingsNetInMonth(state, acc.id, ym);
    const plan = { balance, goal: acc.goal, remaining, progress: goalProgress(balance, acc.goal), reached: remaining === 0, thisMonth, perMonth: null, thisMonthLeft: null, months: null, late: false };
    if (acc.targetDate && !plan.reached) {
      if (acc.targetDate < todayISO) {
        plan.late = true;
      } else {
        plan.months = monthDiff(ym, monthOf(acc.targetDate)) + 1;
        const atMonthStart = remaining + Math.max(0, thisMonth);
        plan.perMonth = Math.ceil(atMonthStart / plan.months);
        plan.thisMonthLeft = Math.max(0, Math.min(remaining, plan.perMonth - Math.max(0, thisMonth)));
      }
    }
    return plan;
  }

  /* ---------- Budgets par catégorie ---------- */

  function budgetStatus(ratio) {
    return ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok';
  }

  function categoryBudgets(state, ym) {
    const spent = new Map(expensesByCategory(state, ym).map((c) => [c.categoryId, c.total]));
    const out = [];
    for (const categoryId of Object.keys(state.budgets || {})) {
      const limit = state.budgets[categoryId];
      if (!(limit > 0) || !state.categories.some((c) => c.id === categoryId)) continue;
      const s = spent.get(categoryId) || 0;
      const ratio = s / limit;
      out.push({ categoryId, limit, spent: s, ratio, left: limit - s, status: budgetStatus(ratio) });
    }
    return out.sort((a, b) => b.ratio - a.ratio);
  }

  /* ---------- Paiements Apple Pay (fichier alimenté par un raccourci iPhone) ---------- */

  const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

  function normMerchant(s) {
    return stripAccents(String(s || '').toLowerCase()).replace(/[^a-z0-9&.' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Ordre important : « uber eats » avant « uber », « amazon prime » avant « amazon »,
  // « boulangerie » avant « boulanger », « fnac spectacles » avant « fnac ».
  const MERCHANT_RULES = [
    ['abonnements', ['netflix', 'spotify', 'deezer', 'disney', 'canal+', 'canal plus', 'mycanal', 'apple.com', 'itunes', 'icloud', 'apple music', 'apple tv', 'amazon prime', 'prime video', 'youtube', 'google one', 'google storage', 'playstation plus', 'ps plus', 'game pass', 'xbox live', 'crunchyroll', 'molotov', 'paramount', 'max ', 'dazn', 'audible', 'kindle unlimited', 'chatgpt', 'openai', 'claude.ai', 'anthropic', 'nintendo online']],
    ['restaurants', ['uber eats', 'ubereats', 'deliveroo', 'just eat', 'mcdonald', 'mc donald', 'mcdo', 'burger king', 'kfc', 'quick', 'subway', 'domino', 'pizza', 'sushi', 'kebab', 'tacos', "o'tacos", 'otacos', 'five guys', 'restaurant', 'resto', 'brasserie', 'bistro', 'cafe', 'starbucks', 'columbus', 'paul', 'brioche doree', 'la mie caline', 'pret a manger', 'poke', 'snack', 'crous', 'cantine', 'self']],
    ['courses', ['carrefour', 'leclerc', 'lidl', 'aldi', 'auchan', 'intermarche', 'super u', 'hyper u', 'u express', 'systeme u', 'casino', 'monoprix', 'monop', 'franprix', 'netto', 'leader price', 'grand frais', 'picard', 'biocoop', 'spar', 'cora', 'colruyt', 'naturalia', 'la vie claire', 'boulangerie', 'patisserie', 'boucherie', 'primeur', 'epicerie', 'supermarche', 'hypermarche', 'drive', 'g20', 'proxi', 'vival', 'thiriet']],
    ['transport', ['totalenergies', 'total access', 'total', 'esso', 'shell', 'bp', 'avia', 'agip', 'station', 'carburant', 'sncf', 'ouigo', 'tgv', 'ter ', 'ratp', 'navigo', 'tcl', 'tisseo', 'rtm', 'tbm', 'star ', 'transdev', 'keolis', 'uber', 'bolt', 'heetch', 'free now', 'taxi', 'g7', 'blablacar', 'flixbus', 'peage', 'autoroute', 'vinci', 'sanef', 'aprr', 'asf', 'parking', 'indigo', 'effia', 'saemes', 'lime', 'dott', 'tier', 'velib', 'norauto', 'feu vert', 'speedy', 'midas', 'point s', 'controle technique']],
    ['factures', ['edf', 'engie', 'veolia', 'suez', 'saur', 'free mobile', 'free', 'orange', 'sosh', 'sfr', 'red by sfr', 'bouygues', 'b&you', 'la poste mobile', 'syma', 'prixtel', 'youprice', 'eau ', 'gaz', 'electricite', 'ekwateur', 'mint energie', 'ohm energie', 'axa', 'maif', 'macif', 'matmut', 'groupama', 'allianz', 'assurance']],
    ['sante', ['pharmacie', 'pharma', 'parapharmacie', 'doctolib', 'medecin', 'docteur', 'dr ', 'dentiste', 'kine', 'osteo', 'opticien', 'optique', 'krys', 'afflelou', 'optic 2000', 'general d optique', 'laboratoire', 'labo', 'biologie', 'hopital', 'clinique', 'mutuelle']],
    ['loisirs', ['fnac spectacles', 'ticketmaster', 'cinema', 'pathe', 'ugc', 'cgr', 'mk2', 'gaumont', 'kinepolis', 'megarama', 'steam', 'playstation', 'nintendo', 'xbox', 'epic games', 'riot', 'blizzard', 'bowling', 'karting', 'laser', 'escape', 'basic fit', 'basic-fit', 'fitness', 'keep cool', 'on air', 'salle de sport', 'piscine', 'musee', 'concert', 'festival', 'parc', 'bar', 'pub', 'club', 'billetterie', 'vapiano']],
    ['shopping', ['amazon', 'amzn', 'cdiscount', 'zalando', 'shein', 'temu', 'aliexpress', 'vinted', 'ebay', 'zara', 'h&m', 'hm ', 'primark', 'kiabi', 'uniqlo', 'celio', 'jules', 'bershka', 'pull and bear', 'pull&bear', 'stradivarius', 'mango', 'jd sports', 'foot locker', 'courir', 'nike', 'adidas', 'decathlon', 'intersport', 'go sport', 'fnac', 'darty', 'boulanger', 'apple store', 'micromania', 'ikea', 'leroy merlin', 'castorama', 'brico', 'action', 'gifi', 'la foir', 'sephora', 'nocibe', 'marionnaud', 'yves rocher', 'normal', 'hema', 'maisons du monde', 'but ', 'conforama', 'cultura', 'joue club', 'king jouet']],
    ['logement', ['loyer', 'foncia', 'nexity', 'citya', 'orpi', 'century 21', 'syndic', 'crous loyer']]
  ];

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ruleCache = new Map();
  function keywordMatch(norm, kw) {
    let re = ruleCache.get(kw);
    if (!re) {
      const k = kw.trim();
      // mots courts : mot entier ; mots longs : début de mot
      re = new RegExp('(^|[^a-z0-9])' + escapeRe(k) + (k.length <= 3 ? '([^a-z0-9]|$)' : ''));
      ruleCache.set(kw, re);
    }
    return re.test(norm);
  }

  /** Catégorie proposée pour un commerçant : règle apprise, puis mots-clés, sinon « Autres ». */
  function categorizeMerchant(state, merchant) {
    const n = normMerchant(merchant);
    const exists = (id) => state.categories.some((c) => c.id === id);
    if (!n) return 'autres';
    const learned = (state.merchantRules || {})[n];
    if (learned && exists(learned)) return learned;
    for (const [cat, kws] of MERCHANT_RULES) {
      if (kws.some((k) => keywordMatch(n, k))) return exists(cat) ? cat : 'autres';
    }
    return 'autres';
  }

  function parseWalletDate(s) {
    const t = String(s || '').trim();
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      const iso = m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
      return isValidISODate(iso) ? iso : null;
    }
    m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) {
      let y = +m[3];
      if (y < 100) y += 2000;
      const iso = y + '-' + pad(+m[2]) + '-' + pad(+m[1]);
      return isValidISODate(iso) ? iso : null;
    }
    return null;
  }

  function parseWalletAmount(s) {
    const t = String(s || '').replace(/[^\d,.]/g, '');
    return t ? parseAmount(t) : null;
  }

  /**
   * Lit le fichier des paiements (une ligne par paiement : « date;montant;commerçant »).
   * Chaque ligne reçoit une clé stable pour ne jamais importer deux fois le même paiement.
   */
  function parseWalletText(text) {
    const items = [];
    const counts = {};
    let invalid = 0;
    for (const line of String(text || '').replace(/^﻿/, '').split(/\r?\n|\r/)) {
      const raw = line.trim();
      if (!raw) continue;
      const parts = raw.split(';');
      const date = parseWalletDate(parts[0]);
      const amount = parts.length >= 2 ? parseWalletAmount(parts[1]) : null;
      if (!date || !amount) { invalid++; continue; }
      const merchant = parts.slice(2).join(';').trim();
      const base = date + '|' + amount + '|' + normMerchant(merchant);
      counts[base] = (counts[base] || 0) + 1;
      items.push({ key: base + '|' + counts[base], date, amount, merchant: merchant || 'Paiement Apple Pay' });
    }
    return { items, invalid };
  }

  /** Prépare l'import : nouveaux paiements seulement, catégorie proposée, doublons possibles signalés. */
  function prepareWalletImport(state, text) {
    const { items, invalid } = parseWalletText(text);
    const known = state.importedKeys || {};
    const fresh = items.filter((it) => !known[it.key]);
    const prepared = fresh.map((it) => {
      const categoryId = categorizeMerchant(state, it.merchant);
      const n = normMerchant(it.merchant);
      const possibleDuplicate = state.transactions.some((t) => t.type === 'expense' && t.amount === it.amount && t.date === it.date);
      const sub = state.subscriptions.find((x) => {
        if (!x.active) return false;
        const sn = normMerchant(x.name);
        if (!sn || !(n.includes(sn) || sn.includes(n))) return false;
        const diff = Math.abs(new Date(x.nextDate) - new Date(it.date)) / 864e5;
        return diff <= 7;
      });
      return { ...it, categoryId: sub ? sub.categoryId : categoryId, possibleDuplicate, subscriptionId: sub ? sub.id : null, selected: !possibleDuplicate };
    });
    return { items: prepared, invalid, alreadyImported: items.length - fresh.length };
  }

  /* ---------- Statistiques ---------- */

  function monthSummary(state, ym) {
    const txs = state.transactions.filter((t) => inMonth(t, ym));
    const income = sum(txs.filter((t) => t.type === 'income'), (t) => t.amount);
    const expenses = sum(txs.filter((t) => t.type === 'expense'), (t) => t.amount);
    const savingsIn = sum(txs.filter((t) => t.type === 'saving' && t.direction === 'in'), (t) => t.amount);
    const savingsOut = sum(txs.filter((t) => t.type === 'saving' && t.direction === 'out'), (t) => t.amount);
    return { ym, income, expenses, savingsIn, savingsOut, savingsNet: savingsIn - savingsOut, net: income - expenses, count: txs.length };
  }

  function expensesByCategory(state, ym) {
    const map = new Map();
    for (const t of state.transactions) {
      if (t.type !== 'expense' || (ym && !inMonth(t, ym))) continue;
      map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
    }
    return [...map.entries()].map(([categoryId, total]) => ({ categoryId, total })).sort((a, b) => b.total - a.total);
  }

  function monthlySeries(state, endYM, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const ym = addMonths(endYM, -i);
      out.push({ ...monthSummary(state, ym), savingsTotal: totalSavings(state, lastDayOfMonth(ym)) });
    }
    return out;
  }

  function percentChange(current, previous) {
    if (!previous) return null;
    return Math.round(((current - previous) / previous) * 100);
  }

  /* ---------- Opérations ---------- */

  function sortTransactions(list) {
    return [...list].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : (b.createdAt || 0) - (a.createdAt || 0)));
  }

  function filterTransactions(list, f) {
    const q = (f.query || '').trim().toLowerCase();
    return list.filter((t) => {
      if (f.type && f.type !== 'all' && t.type !== f.type) return false;
      if (f.categoryId && (t.type !== 'expense' || t.categoryId !== f.categoryId)) return false;
      if (f.month && !inMonth(t, f.month)) return false;
      if (f.from && t.date < f.from) return false;
      if (f.to && t.date > f.to) return false;
      if (q && !(f.labelOf ? f.labelOf(t) : t.note || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  /** Cherche une opération identique déjà enregistrée (même type, montant, date et rattachement). */
  function findDuplicate(state, tx) {
    return state.transactions.find((t) => t.id !== tx.id && t.type === tx.type && t.amount === tx.amount && t.date === tx.date &&
      (t.categoryId || '') === (tx.categoryId || '') && (t.accountId || '') === (tx.accountId || '') &&
      (t.direction || '') === (tx.direction || '') && (t.source || '') === (tx.source || '') &&
      (t.note || '').trim().toLowerCase() === (tx.note || '').trim().toLowerCase()) || null;
  }

  function firstMonth(state, fallbackYM) {
    let min = fallbackYM;
    for (const t of state.transactions) if (monthOf(t.date) < min) min = monthOf(t.date);
    return min;
  }

  /** Export CSV (séparateur « ; », compatible Excel français). */
  function toCSV(state) {
    const catName = (id) => (state.categories.find((c) => c.id === id) || {}).name || '';
    const accName = (id) => (state.savingsAccounts.find((a) => a.id === id) || {}).name || '';
    const srcName = (id) => (INCOME_SOURCES.find((x) => x.id === id) || {}).name || '';
    const payName = (id) => (PAYMENT_METHODS.find((x) => x.id === id) || {}).name || '';
    const typeName = { expense: 'Dépense', income: 'Revenu', saving: 'Épargne' };
    const dirName = { in: 'Versement', out: 'Retrait', interest: 'Intérêts' };
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const rows = [['Date', 'Type', 'Catégorie / source / compte', 'Description', 'Moyen de paiement', 'Montant'].map(q).join(';')];
    for (const t of sortTransactions(state.transactions)) {
      const signed = t.type === 'saving' ? (t.direction === 'out' ? -t.amount : t.amount) : (t.type === 'expense' ? -t.amount : t.amount);
      const label = t.type === 'expense' ? catName(t.categoryId) : t.type === 'income' ? srcName(t.source) : dirName[t.direction] + ' ' + accName(t.accountId);
      rows.push([t.date, typeName[t.type], label, t.note || '', payName(t.payment), centsToInput(signed)].map(q).join(';'));
    }
    return '﻿' + rows.join('\r\n');
  }

  const api = {
    DEFAULT_CATEGORIES, CATEGORY_COLORS, INCOME_SOURCES, PAYMENT_METHODS, SAVINGS_KINDS, MAX_AMOUNT,
    parseAmount, parseSignedAmount, formatAmount, centsToInput,
    toISODate, isValidISODate, monthOf, daysInMonth, addMonths, dateInMonth, lastDayOfMonth, addPeriod, monthLabel, dateLabel,
    uid, createDefaultState, normalizeState,
    currentAccountEffect, accountBalance, savingsMovementNet, savingsBalance, totalSavings, goalProgress,
    creditPaid, creditRemaining, creditProgress, creditPaidInMonth, creditEstimatedEnd, totalCreditsRemaining,
    subscriptionTotals, skipKey, dueItems, pendingTotals, remainingToLive,
    monthSummary, expensesByCategory, monthlySeries, percentChange,
    sortTransactions, filterTransactions, findDuplicate, firstMonth, toCSV,
    monthDiff, savingsNetInMonth, goalPlan, budgetStatus, categoryBudgets,
    normMerchant, categorizeMerchant, parseWalletDate, parseWalletAmount, parseWalletText, prepareWalletImport
  };

  root.BudgetCalc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
