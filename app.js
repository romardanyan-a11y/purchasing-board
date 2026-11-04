'use strict';
/* The page only formats and sorts. Every business number comes from data/, built by engine/site.py. */

const THIN = ' ', NBSP = ' ', MINUS = '−', NONE = 'нет данных', DASH = '–';
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_DAY = MONTHS.map((m) => (m === 'май' ? 'мая' : m));
const MONTHS_TO = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTHS_FROM = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const TABS = ['orders', 'calendar', 'risks', 'how'];
const TAB_NAMES = { orders: 'Заказы', calendar: 'Календарь', risks: 'Риски', how: 'Как считали' };
const ICON_WARN = '<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 15.2 14H.8L8 1.5Zm-.8 5v4h1.6v-4H7.2Zm0 5.2v1.5h1.6v-1.5H7.2Z"/></svg>';
const ICON_ARROW = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 1.5 9 6l-5 4.5V1.5Z"/></svg>';

const state = {
  history: [], asOf: null, summary: null, timeline: null, skus: null, skusPromise: null,
  tab: null, rendered: null, changesRun: null, cache: {}, opener: null, nextCat: '', jump: null,
};
const isPhone = () => window.matchMedia('(max-width: 720px)').matches;

/* ---- formats ---- */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const esc = (v) => String(v === null || v === undefined ? NONE : v).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function group(whole) { return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, THIN); }
function num(v, digits) {
  if (!isNum(v)) return NONE;
  const d = digits || 0;
  const fixed = Math.abs(v).toFixed(d);
  const parts = fixed.split('.');
  const zero = Number(fixed) === 0;
  return (v < 0 && !zero ? MINUS : '') + group(parts[0]) + (d ? ',' + parts[1] : '');
}
const units = (v) => (isNum(v) ? num(v) + NBSP + 'шт.' : NONE);
const signed = (v, digits) => (isNum(v) ? (v > 0 ? '+' : '') + num(v, digits) : NONE);
const signedUnits = (v) => (isNum(v) ? signed(v) + NBSP + 'шт.' : NONE);
const pct = (share, digits) => (isNum(share) ? num(share * 100, digits === undefined ? 1 : digits) + '%' : NONE);
const pctPlain = (v, digits) => (isNum(v) ? num(v, digits === undefined ? 1 : digits) + '%' : NONE);
const days = (v) => (isNum(v) ? num(v) + NBSP + 'дн.' : NONE);
function date(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? Number(m[3]) + NBSP + MONTHS_DAY[Number(m[2]) - 1] + NBSP + m[1] : NONE;
}
const dateOr = (iso) => (iso ? date(iso) : DASH);
function month(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || '');
  return m ? MONTHS[Number(m[2]) - 1] + NBSP + m[1] : NONE;
}
function checkedAt(text) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(text || '');
  if (!m) return null;
  const zone = /(?:Z|\+00:?00)$/.test(text) ? NBSP + 'UTC' : '';
  return date(m[1]) + (m[2] ? ', ' + m[2] + zone : '');
}
function plural(n, one, few, many) {
  const t = Math.abs(n) % 100;
  if (t >= 11 && t <= 14) return many;
  const l = t % 10;
  return l === 1 ? one : l >= 2 && l <= 4 ? few : many;
}
const suppliersIn = (n) => (isNum(n) ? num(n) + NBSP + plural(n, 'поставщика', 'поставщиков', 'поставщиков') : NONE);
const lines = (n) => (isNum(n) ? num(n) + NBSP + plural(n, 'строка', 'строки', 'строк') : NONE);
const lowerFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');
const gloss = (group_, key) => {
  const g = state.summary && state.summary.meta && state.summary.meta.glossary;
  return (g && g[group_] && g[group_][key]) || NONE;
};
const catName = (key) => gloss('categories', key);
const skuLink = (id) => (id ? `<a class="sku" href="#sku/${esc(id)}">${esc(id)}</a>` : NONE);
const code = (v) => (v ? `<span class="nowrap">${esc(v)}</span>` : NONE);
const warnMark = (text) => `<span class="warn-mark">${ICON_WARN}<span>${esc(text)}</span></span>`;
const byDesc = (key) => (a, b) => (isNum(b[key]) ? b[key] : -Infinity) - (isNum(a[key]) ? a[key] : -Infinity);

/* A sentence that ends on an abbreviation keeps one full stop. */
const tidy = (html) => html.replace(/(шт|дн|мес)\.\./g, '$1.').replace(/(^|[\s>(«])(у|с|по|до|к|в|на|от|за) (?=[^\s<])/g, `$1$2${NBSP}`);
/* Engine texts carry bare numbers. Separate the thousands, leave codes and dates alone. */
const groupText = (text) => String(text).replace(/(^|[^\w-])(\d{4,})(?![\w-])/g, (all, before, digits) => before + group(digits));
const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/* ---- table helper ---- */
function table(cols, rows, opts) {
  const o = opts || {};
  const limit = o.limit && rows.length > o.limit ? o.limit : null;
  const head = cols.map((c) => `<th scope="col"${c.num ? ' class="num"' : ''}>${esc(c.h)}</th>`).join('');
  const body = rows.map((r, i) => {
    const more = limit && i >= limit ? ' class="more"' : '';
    const cells = cols.map((c) => {
      const html = c.cell(r);
      const cls = [c.num ? 'num' : '', c.prose ? 'prose' : '', html === '' ? 'is-empty' : ''].filter(Boolean).join(' ');
      return `<td${cls ? ` class="${cls}"` : ''} data-label="${esc(c.h)}"><div>${html}</div></td>`;
    }).join('');
    return `<tr${more}>${cells}</tr>`;
  }).join('');
  const t = `<table class="t${o.stack === false ? '' : ' stack'}${o.cls ? ' ' + o.cls : ''}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  const btn = limit ? `<button type="button" class="btn btn-plain more-btn" data-more="${rows.length}">Показать все: ${num(rows.length)}</button>` : '';
  return `<div class="lst">${t}${btn}</div>`;
}
const emptyRow = (text) => `<p class="muted">${esc(text)}</p>`;

/* ---- first screen ---- */
function digestHtml(s) {
  const d = s.digest;
  if (!d || !Array.isArray(d.paragraphs) || !d.paragraphs.length) return '';
  const mark = d.source === 'model'
    ? `Текст написала модель, с расчётом сверено значений: ${num(d.numbers_checked)}.`
    : 'Текст собран по шаблону из расчёта.';
  return `<details class="digest"><summary>Текст на день. ${esc(mark)}</summary>${d.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</details>`;
}

function groupLine(g) {
  const parts = [];
  if (isNum(g.above_largest_batch_units) && g.above_largest_batch_units) parts.push(`${units(g.above_largest_batch_units)} больше самой крупной партии SKU`);
  if (isNum(g.above_lifetime_units) && g.above_lifetime_units) parts.push(`${units(g.above_lifetime_units)} больше всех продаж SKU за всё время`);
  if (isNum(g.lead_low_units) && g.lead_low_units) parts.push(`у ${units(g.lead_low_units)} срок поставки известен неточно`);
  return parts.join(', ');
}
function trustHtml(s) {
  const t = (s.site || {}).trust || {};
  if (!isNum(t.category_wape)) return '';
  return `<p class="decide-note">Насколько верить: итог по категории расходится с продажами на ${esc(pctPlain(t.category_wape))}, строка SKU на новом ассортименте на ${esc(pctPlain(t.recent_wape))}. ${esc(units(t.thin_units))} сегодняшнего заказа (${esc(pct(t.thin_share, 0))}) стоит на истории короче ${esc(num(t.thin_months))} мес. <a href="#how" data-jump="accuracy">Точность</a></p>`;
}
function riskLineHtml(s) {
  const r = (s.site || {}).risk_line || {};
  if (!isNum(r.deficit_skus) || !isNum(r.excess_skus)) return '';
  const deficit = r.deficit_skus ? `дефицит ${num(r.deficit_skus)} SKU, потеряем ${units(r.deficit_units)}, если новый заказ уйдёт в срок` : 'дефицита нет';
  const excess = r.excess_skus ? `избыток ${num(r.excess_skus)} SKU, лишних ${units(r.excess_units)}` : 'избытка нет';
  const incoming = r.unproven_incoming_skus ? `; едет без доказанного спроса <a href="#risks" data-jump="unproven-title">${esc(skuCount(r.unproven_incoming_skus))}</a>` : '';
  return `<p class="decide-note" id="risk-line">Под риском: ${esc(deficit)}; ${esc(excess)}${incoming}. <a href="#risks">Риски</a></p>`;
}
function decisionHtml(s) {
  const h = s.headline || {};
  const p = h.placeable || {};
  const c = h.after_check || {};
  const groups = ((s.site || {}).draft_checks || {}).groups || {};
  const pLine = groupLine(groups.placeable || {});
  const cLine = groupLine(groups.after_check || {});
  const all = `downloads/${esc(state.asOf)}/placeable.csv`;
  return `<section class="decide" aria-label="Решение на сегодня">
    <div class="decide-pair">
      <div><p><a class="jump" href="#orders" data-jump="drafts-title">Можно размещать ${esc(units(p.units))} у ${esc(suppliersIn(p.suppliers))}.</a></p>
        <p class="decide-sub">${esc(lines(p.lines))}. Сверка поставщика не требуется${pLine ? `, но перед отправкой посмотрите: ${esc(pLine)}` : ''}.</p>
        <a class="btn btn-primary decide-btn" href="${all}" download>Скачать все эти заказы, CSV</a></div>
      <div><p><a class="jump" href="#orders" data-jump="check-title">Только после сверки ${esc(units(c.units))} у ${esc(suppliersIn(c.suppliers))}.</a></p>
        <p class="decide-sub">${esc(lines(c.lines))}. Сначала сверить, что уже едет${cLine ? `. В этой части ${esc(cLine)}` : ''}.</p></div>
    </div>
    <p class="decide-note">Всего заказ ${esc(units(h.units))}, ${esc(lines(h.lines))}. План на 12 месяцев ${esc(units(h.plan_12m_units))}: это ${esc(num(h.plan_ratio_to_l12m_orderable, 2))} к продажам за прошлые 12 месяцев на тех же SKU (${esc(units(h.l12m_units_orderable))}).</p>
    ${trustHtml(s)}
    ${riskLineHtml(s)}
    ${digestHtml(s)}
  </section>`;
}

function timelineHtml(t) {
  if (!t || !t.rows || !t.rows.length) return '';
  const months = t.months.map((m, i) => {
    const name = MONTHS[Number(m.slice(5, 7)) - 1];
    const year = i === 0 || m.endsWith('-01') ? `<br>${m.slice(0, 4)}` : '';
    return `<th scope="col" abbr="${esc(month(m))}">${name}${year}</th>`;
  }).join('');
  let first = true;
  const rows = t.rows.map((row) => {
    const cells = row.cells.map((c) => {
      const cls = `tl-cell b${c.bucket}${c.shelf_empty ? ' empty' : ''}${c.in_season ? ' season' : ''}`;
      const pin = c.arrivals_units ? `<span class="tl-pin">+${esc(num(c.arrivals_units))}</span>` : '';
      const focus = first ? '0' : '-1';
      first = false;
      return `<td class="${cls}" tabindex="${focus}" data-tip="${esc(c.tip)}" aria-label="${esc(c.tip)}"><span class="tl-n">${esc(num(c.demand))}</span>${pin}</td>`;
    }).join('');
    return `<tr><th scope="row" class="tl-cat"><a class="tl-name" href="#calendar" data-nextcat="${esc(row.category)}">${esc(row.name)}</a><span class="tl-sum">${esc(row.order_text)}</span></th>${cells}</tr>`;
  }).join('');
  const ramp = t.legend.map((l) => `<i style="background:var(--ramp-${l.bucket})" title="${esc(l.label)}"></i>`).join('');
  const low = t.legend[0] ? t.legend[0].label : '';
  const high = t.legend.length ? t.legend[t.legend.length - 1].label : '';
  const summaries = t.rows.map((r) => `<li><b class="tl-name">${esc(r.name)}</b>${esc(r.summary)}</li>`).join('');
  return `<section class="tl" aria-labelledby="tl-title">
    <div class="tl-head">
      <h2 id="tl-title">Спрос по месяцам и когда приедет сегодняшний заказ</h2>
      <div class="legend">
        <span class="legend-item">шт. в месяц: ${esc(low)}<span class="legend-ramp">${ramp}</span>${esc(high)}</span>
        <span class="legend-item"><i class="swatch-hatch"></i>полка пуста без заказа</span>
        <span class="legend-item"><span class="pin-mini">+100</span>приедет</span>
        <span class="legend-item"><i class="swatch-season"></i>сезон</span>
      </div>
    </div>
    <div class="tl-scroll" tabindex="-1">
      <table class="tl-table" id="tl-table"><thead><tr><th scope="col">Категория</th>${months}</tr></thead><tbody>${rows}</tbody></table>
    </div>
    <ul class="tl-summaries">${summaries}</ul>
    <div class="tl-caption">${t.message ? `<p>${esc(t.message)}</p>` : ''}<p class="tl-reading">${esc(t.reading)}</p></div>
  </section>`;
}

/* ---- check first ---- */
function poQuantityOpen(r, detail) {
  return Boolean(detail.eta_fixed_by_buyer) && (r.confirmed_units || 0) < r.units;
}
function poSettled(r, s) {
  const detail = ((s.site || {}).po_details || {})[r.po_id] || {};
  return Boolean(detail.eta_fixed_by_buyer) && !poQuantityOpen(r, detail);
}
function poCard(r, s) {
  const cats = (r.categories || []).map(catName).join(', ');
  const supplier = (r.suppliers || []).join(', ');
  const newcomer = r.supplier_new_for_category ? ` ${supplier} раньше не возил эту категорию.` : '';
  const detail = ((s.site || {}).po_details || {})[r.po_id] || {};
  const rows = detail.skus || [];
  const eta = (r.etas || [])[0];
  const fixed = detail.eta_fixed_by_buyer;
  /* The buyer names a date, and the export still counts its own confirmed units: these are two different facts. */
  const quantityOpen = poQuantityOpen(r, detail);
  const title = fixed ? `срок закреплён закупщиком на ${date(eta)}${quantityOpen ? ', сверьте количество' : ''}` : lowerFirst(r.action);
  const inErp = r.confirmed_units
    ? `в выгрузке подтверждено ${units(r.confirmed_units)}${quantityOpen ? ` из ${units(r.units)}: остальное осталось сверить с поставщиком` : ''}`
    : `подтверждённого количества в выгрузке нет${quantityOpen ? ': его осталось сверить с поставщиком' : ''}`;
  /* A date before as_of takes the order out of the future arrivals, and a share above 100% would mean nothing. */
  const share = !fixed || r.share_of_future <= 1 ? `Это ${pct(r.share_of_future)} всех будущих приходов` : '';
  const standing = fixed
    ? `${share ? `${share}. ` : ''}Срок назвал закупщик, ${inErp}${r.confirmed_units && !quantityOpen ? '' : '.'}`
    : `${share}, подтверждено ${units(r.confirmed_units)}`;
  const list = rows.length ? `<details class="po-skus"><summary>Какие ${esc(num(rows.length))} SKU в заказе и когда они закончатся</summary>${table([
    { h: 'SKU', cell: (l) => skuLink(l.sku_id) },
    { h: 'В этом заказе', num: true, cell: (l) => esc(units(l.qty)) },
    { h: 'Ноль только на запасе', cell: (l) => esc(l.zero_without_po ? `с ${date(l.zero_without_po)}` : 'до нуля не доходит') },
    { h: 'Ноль с заказами в пути', cell: (l) => esc(l.zero_with_po ? `с ${date(l.zero_with_po)}` : 'до нуля не доходит') },
    { h: 'Статус', cell: (l) => esc(l.status_name) },
  ], rows)}</details>` : '';
  const late = fixed ? '' : `<div><b>${esc(units(r.lost_units_if_late))}</b>потеряем до этой же даты, если придёт только ${esc(date(r.eta_late_max))}</div>`;
  return `<div class="po-card">
    <div class="po-title">${!fixed || quantityOpen ? ICON_WARN : ''}<div class="po-body">
      <h3>${esc(r.po_id)}: ${esc(title)}</h3>
      <p>${esc(units(r.units))} на ${esc(num(r.skus))} SKU, ${esc(cats)}, поставщик ${code(supplier)}. ${esc(standing)}${esc(newcomer)}</p>
      <div class="delay">
        <div><b>${esc(units(r.lost_units_on_time))}</b>${fixed ? 'потеряем по этим SKU при этой дате' : `потеряем до ${esc(date(r.eta_late_max))}, если придёт в срок, ${esc(date(eta))}`}</div>
        ${late}
      </div>
      ${list}
    </div></div>
  </div>`;
}

function supplierWhy(r) {
  const last = [];
  if (r.last_po_date) last.push(`Последний заказ в выгрузке ${date(r.last_po_date)}`);
  if (r.last_receipt_date) last.push(`последний приход ${date(r.last_receipt_date)}`);
  const tail = last.length ? last.join(', ') + '.' : '';
  if (r.reason === 'receipts_without_po') {
    return `За год пришло ${units(r.receipts_units)}, из них ${units(r.receipts_no_po_units)} на ${num(r.skus_no_po)} SKU без единой строки заказа. ${tail}`;
  }
  if (r.reason === 'no_po_at_all') {
    const got = r.receipts_units ? `За год пришло ${units(r.receipts_units)}, а заказов в выгрузке нет.` : 'Заказов в выгрузке нет.';
    return `${got} ${r.last_receipt_date ? `Последний приход ${date(r.last_receipt_date)}.` : ''}`;
  }
  return tail || NONE;
}

function moreChecksHtml(s) {
  const site = s.site || {};
  const usual = (site.draft_checks || {}).above_usual || [];
  const held = (s.risk_rows || {}).unproven_excess || [];
  if (!usual.length && !held.length) return '';
  const head = [];
  if (usual.length) head.push(`${num(usual.length)} ${plural(usual.length, 'черновик', 'черновика', 'черновиков')} намного больше обычной партии`);
  if (held.length) head.push(`${num(held.length)} SKU, где запаса и заказов больше, чем продаётся`);
  const usualTable = usual.length ? `<h3>Черновик намного больше обычной партии</h3>${table([
    { h: 'Поставщик', cell: (r) => code(r.supplier_id) },
    { h: 'Черновик', num: true, cell: (r) => esc(units(r.units)) },
    { h: 'Обычная партия', num: true, cell: (r) => esc(units(r.usual_units)) },
    { h: 'Во сколько раз больше', num: true, cell: (r) => esc(num(r.ratio, 1)) },
    { h: 'Размещение', cell: (r) => esc(gloss('drafts', r.placement)) },
  ], usual)}` : '';
  const heldTable = held.length ? `<h3>Запаса и заказов больше, чем продаётся</h3>${unprovenTable(held, 5)}` : '';
  return `<details class="more-checks"><summary>Ещё проверить: ${esc(head.join(' и '))}</summary><div class="panel">${usualTable}${heldTable}</div></details>`;
}
function checkFirstHtml(s) {
  const rows = s.check_first || [];
  if (!rows.length) return '';
  const orders = rows.filter((r) => r.kind === 'po_eta');
  const pos = orders.filter((r) => !poSettled(r, s)).map((r) => poCard(r, s)).join('');
  const settled = orders.filter((r) => poSettled(r, s)).map((r) => poCard(r, s)).join('');
  const suppliers = rows.filter((r) => r.kind !== 'po_eta');
  const tbl = suppliers.length ? `<div class="panel">${table([
    { h: 'Поставщик', cell: (r) => code(r.supplier_id) },
    { h: 'Что сделать', prose: true, cell: (r) => esc(r.action) },
    { h: 'Почему', prose: true, cell: (r) => esc(supplierWhy(r)) },
    { h: 'Заказ сегодня', num: true, cell: (r) => esc(units(r.order_now_units)) },
  ], suppliers.slice().sort(byDesc('order_now_units')))}</div>` : '';
  return `<section class="section section-near" aria-labelledby="check-title"><h2 id="check-title">Сначала проверьте</h2>${pos}${tbl}${moreChecksHtml(s)}${settled ? `<h3>Срок и количество подтверждены, проверять нечего</h3>${settled}` : ''}</section>`;
}

/* ---- drafts ---- */
function leadText(l) {
  if (!l) return NONE;
  const sources = { own: 'свои поставки', pool: 'общий срок', override: 'задан вручную' };
  return `${days(l.p50)}, ${sources[l.source] || NONE}`;
}
function batchCell(d) {
  const b = d.usual_batch;
  const usual = b ? `обычно ${units(b.median_po_units)}` : 'прошлых заказов нет';
  let mark = '';
  if (d.above_usual_batch) mark = `<br>${warnMark('вдвое больше обычной или ещё больше')}`;
  else if (d.below_usual_batch) mark = `<br><span class="muted">${esc(gloss('drafts', 'below_usual_batch'))}</span>`;
  return esc(usual) + mark;
}
function choiceText(d) {
  const wave = (d.choice || {}).join_wave;
  if (!wave) return '';
  const lead = d.placement === 'after_check' ? 'После сверки можно присоединить к волне' : 'Можно присоединить к волне';
  return `${lead} ${date(wave.date)}: ждать ${days(wave.wait_days)}, заказ вырастет до ${units(wave.units)}, ожидание стоит ещё ${units(wave.extra_lost_units)} потерянных продаж.`;
}
function lineWarnings(line) {
  const w = line.warnings || [];
  return w.length ? `<span class="line-warn">${ICON_WARN}${esc(w.join(', '))}</span>` : '';
}
const NOT_COUNTED = 'не рассчитано';
function zeroWithOrders(l) {
  const c = l.with_orders || {};
  if (c.state === 'zero') return date(c.zero_date);
  return c.state === 'beyond' ? 'до нуля не доходит' : NOT_COUNTED;
}
function daysWithOrders(l) {
  const c = l.with_orders || {};
  if (c.state === 'zero') return num(c.days);
  return c.state === 'beyond' ? `больше ${num(((state.summary || {}).site || {}).horizon_days)}` : NOT_COUNTED;
}
function linesTable(d) {
  const rows = (d.lines || []).slice().sort(byDesc('qty'));
  return table([
    { h: 'SKU', cell: (l) => skuLink(l.sku_id) },
    { h: 'Категория', cell: (l) => esc(l.category_name || catName(l.category)) },
    { h: 'Количество', num: true, cell: (l) => esc(units(l.qty)) },
    { h: 'Заказать до', cell: (l) => esc(date(l.order_by)) },
    { h: 'Приход', cell: (l) => esc(date(l.arrival)) },
    { h: 'Покрытие до', cell: (l) => esc(date(l.cover_until)) },
    { h: 'Ноль с заказами в пути', cell: (l) => esc(zeroWithOrders(l)) },
    { h: 'Дней до нуля', num: true, cell: (l) => esc(daysWithOrders(l)) },
    { h: 'На что смотреть', cell: lineWarnings },
  ], rows);
}
function draftRows(d, s) {
  const id = esc(d.supplier_id || 'no_supplier');
  const after = d.placement === 'after_check';
  const label = after ? 'Скачать черновик' : 'Скачать заказ';
  const cls = after ? 'btn btn-plain' : 'btn btn-tint';
  const href = `downloads/${esc(state.asOf)}/orders/${id}.csv`;
  const check = (s.check_first || []).find((r) => r.supplier_id === d.supplier_id);
  const first = after ? `<span class="warn-mark">${ICON_WARN}<span>Сначала: ${esc(lowerFirst((check && check.action) || 'сверить, что уже едет'))}.</span></span> ` : '';
  const choice = choiceText(d);
  const note = first || choice ? `<tr><td class="note" colspan="7" data-label="">${first}${choice ? `<span>${esc(choice)}</span>` : ''}</td></tr>` : '';
  const day = (((s.site || {}).draft_order_days || {})[d.supplier_id] || {}).earliest_order_day;
  return `<tr>
      <td data-label="Поставщик"><button type="button" class="toggle" data-toggle="d-${id}" aria-expanded="false" aria-controls="d-${id}">${ICON_ARROW}${esc(d.supplier_id || NONE)}</button></td>
      <td class="num" data-label="Количество">${esc(units(d.units))}</td>
      <td class="num" data-label="Строк">${esc(num(d.sku_count))}</td>
      <td data-label="Срок заказа наступил">${esc(dateOr(day))}</td>
      <td data-label="Срок поставки">${esc(leadText(d.lead))}</td>
      <td data-label="Обычная партия"><div>${batchCell(d)}</div></td>
      <td class="act" data-label=""><a class="${cls}" href="${href}" download aria-label="${label}, ${id}">${label}</a></td>
    </tr>
    ${note}
    <tr class="detail" id="d-${id}" hidden><td colspan="7" data-label="">${linesTable(d)}</td></tr>`;
}
function draftsHtml(s) {
  const drafts = s.drafts || [];
  const group_ = (placement, title) => {
    const rows = drafts.filter((d) => d.placement === placement).sort(byDesc('units'));
    if (!rows.length) return '';
    return `<tbody><tr class="group"><th colspan="7" scope="colgroup">${esc(title)}: ${esc(num(rows.length))}</th></tr>${rows.map((d) => draftRows(d, s)).join('')}</tbody>`;
  };
  const csv = `downloads/${esc(state.asOf)}/recommendations.csv`;
  return `<section class="section" aria-labelledby="drafts-title">
    <div class="sec-head"><h2 id="drafts-title">Черновики по поставщикам</h2>
      <div class="tools"><a class="btn btn-tint" href="${csv}" download>Все рекомендации, CSV</a></div></div>
    <p class="lede">Срок заказа наступил: самая ранняя дата, когда по расчёту надо было заказать строку этого поставщика. Раскройте поставщика, чтобы увидеть строки. Ноль с заказами в пути: когда запас закончится с уже размещёнными заказами, без сегодняшнего. Покрытие до: докуда хватит с сегодняшним.</p>
    <div class="panel"><table class="t stack drafts">
      <thead><tr><th scope="col">Поставщик</th><th scope="col" class="num">Количество</th><th scope="col" class="num">Строк</th><th scope="col">Срок заказа наступил</th><th scope="col">Срок поставки</th><th scope="col">Обычная партия</th><th scope="col"><span class="sr">Скачать</span></th></tr></thead>
      ${group_('placeable', gloss('drafts', 'placeable').replace(/^./, (c) => c.toUpperCase()))}
      ${group_('after_check', gloss('drafts', 'after_check').replace(/^./, (c) => c.toUpperCase()))}
    </table></div>
  </section>`;
}

/* ---- changes and history ---- */
function changesBody(s, asOf) {
  const c = s && s.changes;
  if (!c) return emptyRow('Первый запуск в серии, сравнивать пока не с чем.');
  const d = c.headline_delta || {};
  const nd = c.new_data || {};
  const from = date(c.from_as_of) + (c.from_label ? `, ${c.from_label}` : '');
  const items = [
    ['Заказ', signedUnits(d.units)], ['Можно размещать', signedUnits(d.placeable_units)],
    ['После сверки', signedUnits(d.after_check_units)], ['План на 12 месяцев', signedUnits(d.plan_12m_units)],
    ['Запас', signedUnits(nd.position_delta)], ['Приходы за это время', units((c.arrivals || {}).units)],
  ].map((x) => `<li>${esc(x[0])}: ${esc(x[1])}</li>`).join('');
  const place = (c.placement_changes || []).length
    ? `<h3>Сменили размещение</h3><div class="panel">${table([
      { h: 'Поставщик', cell: (r) => code(r.supplier_id) },
      { h: 'Было', cell: (r) => esc(gloss('drafts', r.from)) },
      { h: 'Стало', cell: (r) => esc(gloss('drafts', r.to)) },
      { h: 'Количество', num: true, cell: (r) => esc(units(r.units)) },
    ], c.placement_changes)}</div>`
    : '<p class="muted small">Ни один поставщик не сменил размещение.</p>';
  const sp = c.split;
  const splitLine = sp ? `<p class="lede">Откуда разница: вошли в окно заказа ${esc(num(sp.moved_in_skus))} SKU на ${esc(units(sp.moved_in_units))}, и на них уже стоял заказ на более позднюю дату, ${esc(units(sp.moved_in_planned_units))}. Вышли из заказа ${esc(num(sp.moved_out_skus))} SKU на ${esc(units(sp.moved_out_units))}. На остальных ${esc(num(sp.stayed_skus))} SKU разница ${esc(signedUnits(sp.stayed_delta_units))}.</p>` : '';
  const wasText = (r) => {
    if (r.from) return units(r.from);
    return r.planned_before ? `0 шт. сегодня, ${units(r.planned_before.qty)} до ${date(r.planned_before.order_by)}` : units(r.from);
  };
  const nowText = (r) => {
    if (r.to) return units(r.to);
    return r.planned_after ? `0 шт. сегодня, ${units(r.planned_after.qty)} до ${date(r.planned_after.order_by)}` : units(r.to);
  };
  const whyText = (r) => {
    const causes = (r.causes || []).join('; ');
    if (r.timing) return `Дата заказа ${date(r.planned_before.order_by)} сдвинулась на ${date(r.order_day)} и вошла в окно ${num(r.window_days)} дней${causes ? `; ${causes}` : ''}`;
    return causes || NONE;
  };
  const statusRows = ((c.status_changes || {}).rows || []);
  const qtyRows = ((c.quantity_changes || {}).rows || []).slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const statusName = (code) => (code ? gloss('statuses', code) : 'нет в выгрузке');
  const statusTbl = statusRows.length ? `<h3>Сменили статус <span class="count">${esc(num(c.status_changes.count))}</span></h3><div class="panel">${table([
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Было', cell: (r) => esc(statusName(r.from)) },
    { h: 'Стало', cell: (r) => esc(statusName(r.to)) },
    { h: 'Причина', prose: true, cell: (r) => esc((r.causes || []).join('; ') || NONE) },
  ], statusRows, { limit: 6 })}</div>` : '';
  const qtyTbl = qtyRows.length ? `<h3>Изменилось количество <span class="count">${esc(num(c.quantity_changes.count))}</span></h3><div class="panel">${table([
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Было', cell: (r) => esc(wasText(r)) },
    { h: 'Стало', cell: (r) => esc(nowText(r)) },
    { h: 'Разница сегодня', num: true, cell: (r) => esc(signedUnits(r.delta)) },
    { h: 'Главное слагаемое', cell: (r) => esc(r.main_term_name || DASH) },
    { h: 'Причина', prose: true, cell: (r) => esc(whyText(r)) },
  ], qtyRows, { limit: 6 })}</div>` : '';
  const note = asOf !== state.asOf ? '<p class="muted small">Карточка SKU открывает последний расчёт.</p>' : '';
  return `<p class="lede">Расчёт на ${esc(date(c.to_as_of))} против расчёта на ${esc(from)}.</p><ul class="delta-list">${items}</ul>${splitLine}${place}${statusTbl}${qtyTbl}${note}`;
}

function historyRowStatus(e) {
  if (e.status === 'failed') {
    const what = e.error_source === 'override' ? 'Ручная правка не прошла проверку.' : e.error_source === 'tests' ? 'Автотесты не прошли.' : 'Выгрузка не прошла проверку.';
    return warnMark(`${what} ${upperFirst(e.error || NONE)}.`);
  }
  if (e.status === 'unchanged') return esc(upperFirst(e.message || 'проверено, новых данных нет'));
  const text = e.text ? (e.text.source === 'model' ? `, текст написала модель, сверено значений: ${num(e.text.numbers_checked)}` : ', текст по шаблону') : '';
  return esc(`Рассчитан${text}`);
}
/* Quiet days repeat one row: the page shows the latest of them with how many there were. */
function collapseQuiet(rows) {
  const out = [];
  rows.forEach((e) => {
    const last = out[out.length - 1];
    if (last && e.status === 'unchanged' && last.status === 'unchanged' && last.as_of === e.as_of) last.times = (last.times || 1) + 1;
    else out.push({ ...e });
  });
  return out;
}
function historyHtml() {
  const rows = collapseQuiet(state.history.slice().reverse());
  const selected = state.changesRun;
  const seen = {};
  const body = rows.map((e) => {
    const h = e.headline || {};
    const key = e.has_data && !seen[e.as_of];
    if (key) seen[e.as_of] = true;
    const quiet = e.status === 'unchanged' ? 'как в прошлом запуске' : DASH;
    const label = e.label ? ` <span class="tag">${esc(e.label)}</span>` : '';
    const pick = key ? `<button type="button" class="sel-run" data-run="${esc(e.as_of)}">Показать изменения</button>` : '';
    const times = e.times ? ` <span class="muted">(проверок: ${esc(num(e.times))})</span>` : '';
    return `<tr${key && e.as_of === selected ? ' class="selected"' : ''}>
      <td data-label="Данные на"><div>${esc(date(e.as_of))}${label}</div></td>
      <td class="prose" data-label="Итог"><div>${historyRowStatus(e)}${times}</div></td>
      <td data-label="Проверено"><div>${esc(checkedAt(e.checked_at) || 'запуск вручную')}</div></td>
      <td class="num" data-label="Заказ"><div>${esc(isNum(h.order_now_units) ? units(h.order_now_units) : quiet)}</div></td>
      <td class="num" data-label="План на 12 месяцев"><div>${esc(isNum(h.plan_12m_units) ? units(h.plan_12m_units) : quiet)}</div></td>
      <td class="${pick ? '' : 'is-empty'}" data-label=""><div>${pick}</div></td></tr>`;
  }).join('');
  return `<h3>История запусков</h3><div class="panel"><table class="t stack"><thead><tr><th scope="col">Данные на</th><th scope="col">Итог</th><th scope="col">Проверено</th><th scope="col" class="num">Заказ</th><th scope="col" class="num">План на 12 месяцев</th><th scope="col"><span class="sr">Выбор</span></th></tr></thead><tbody>${body}</tbody></table></div>`;
}
function changesHtml() {
  const run = state.changesRun || state.asOf;
  const s = run === state.asOf ? state.summary : state.cache[run];
  return `<div class="sec-head"><h2 id="changes-title">Что изменилось</h2></div>${s ? changesBody(s, run) : '<p class="muted">Загружаю расчёт.</p>'}${historyHtml()}`;
}
function ordersHtml() {
  const s = state.summary;
  return `${decisionHtml(s)}${checkFirstHtml(s)}${draftsHtml(s)}${timelineHtml(state.timeline)}
    <section class="section" id="changes" aria-labelledby="changes-title">${changesHtml()}</section>`;
}

/* ---- calendar ---- */
function niceTicks(max) {
  if (!isNum(max) || max <= 0) return [0];
  const raw = max / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((k) => k * pow).find((k) => k >= raw);
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  return ticks;
}
function reviewsChart(reviews) {
  const phone = isPhone();
  const W = phone ? 360 : 1000, H = phone ? 190 : 210, L = phone ? 50 : 64, R = phone ? 4 : 8, T = 22, B = 24;
  const max = Math.max(...reviews.map((r) => r.units || 0));
  const ticks = niceTicks(max);
  const top = Math.max(max, ticks[ticks.length - 1]);
  const y = (v) => T + (H - T - B) * (1 - v / (top || 1));
  const slot = (W - L - R) / reviews.length;
  const bw = Math.min(40, slot - 8);
  const rest = reviews.slice(1).reduce((best, r, i) => ((r.units || 0) > (reviews[best + 1].units || 0) ? i : best), 0) + 1;
  const grid = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--rule)"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${esc(num(t))}</text>`).join('');
  const bars = reviews.map((r, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    const v = r.units || 0;
    const h = Math.max(v > 0 ? 2 : 0, y(0) - y(v));
    const tip = `${date(r.date)}: ${units(r.units)}, ${lines(r.lines)}. Можно размещать ${units(r.placeable_units)}, после сверки ${units(r.after_check_units)}.`;
    const label = i === 0 || i === rest ? `<text class="v" x="${x + bw / 2}" y="${y(v) - 6}" text-anchor="middle">${esc(num(v))}</text>` : '';
    const name = /^\d{4}-(\d{2})/.exec(r.date);
    return `<g><rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${H - T - B}" data-tip="${esc(tip)}"/><rect class="bar" x="${x}" y="${y(0) - h}" width="${bw}" height="${h}" rx="3" pointer-events="none"/>${label}<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${name ? MONTHS[Number(name[1]) - 1] : ''}</text></g>`;
  }).join('');
  return `<svg class="chart bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Заказы по месячным обзорам, штук. Те же числа в таблице ниже.">${grid}${bars}</svg>`;
}
function waveText(w) {
  if (isNum(w.today_units) && w.pulled_units) return `${date(w.date)}: ${units(w.today_units)} сегодня, ещё ${units(w.pulled_units)} можно присоединить`;
  return `${date(w.date)}: ${units(w.units)}`;
}
function nextOrdersTable() {
  const rows = ((state.summary.site || {}).next_orders || []).filter((r) => !state.nextCat || r.category === state.nextCat);
  if (!rows.length) return emptyRow('В этой категории заказов на потом нет.');
  return table([
    { h: 'Заказать до', cell: (r) => esc(date(r.order_by)) },
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Категория', cell: (r) => esc(catName(r.category)) },
    { h: 'Поставщик', cell: (r) => code(r.supplier_id) },
    { h: 'Количество', num: true, cell: (r) => esc(units(r.qty)) },
    { h: 'Приход', cell: (r) => esc(date(r.arrival)) },
  ], rows, { limit: 10 });
}
function nextOrdersHtml() {
  const rows = (state.summary.site || {}).next_orders || [];
  const cats = [];
  rows.forEach((r) => { if (!cats.includes(r.category)) cats.push(r.category); });
  const options = cats.map((c) => ({ c, name: catName(c) })).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map((o) => `<option value="${esc(o.c)}"${o.c === state.nextCat ? ' selected' : ''}>${esc(o.name)}</option>`).join('');
  return `<section class="section" id="next-orders"><div class="sec-head"><h2>Следующие заказы <span class="count">${esc(num(rows.length))} SKU</span></h2>
      <label class="filter"><span class="sr">Категория</span><select id="next-cat"><option value="">Все категории</option>${options}</select></label></div>
    <p class="lede">Строки со статусом «${esc(gloss('statuses', 'order_later'))}»: сегодня их заказывать не нужно, в черновиках их нет.</p>
    <div class="panel" id="next-table">${nextOrdersTable()}</div></section>`;
}
function calendarHtml() {
  const s = state.summary;
  const cal = s.calendar || {};
  const reviews = cal.reviews || [];
  const cats = Object.keys(cal.by_category || {}).sort((a, b) => (cal.by_category[b] || 0) - (cal.by_category[a] || 0));
  const reviewCols = [
    { h: 'Обзор', cell: (r) => esc(date(r.date)) },
    { h: 'Всего', num: true, cell: (r) => esc(num(r.units)) },
    { h: 'Строк', num: true, cell: (r) => esc(num(r.lines)) },
    { h: 'Можно размещать', num: true, cell: (r) => esc(num(r.placeable_units)) },
    { h: 'После сверки', num: true, cell: (r) => esc(num(r.after_check_units)) },
  ].concat(cats.map((c) => ({ h: catName(c), num: true, cell: (r) => esc(isNum((r.by_category || {})[c]) ? num(r.by_category[c]) : '0') })));
  const reviewTable = table(reviewCols, reviews, { stack: false, cls: 'pin' });
  const site = s.site || {};
  const waves = site.supplier_waves || cal.supplier_waves || {};
  const totals = cal.by_supplier || {};
  const supplierRows = Object.keys(waves).map((id) => ({ id, total: totals[id], waves: waves[id] })).sort(byDesc('total'));
  const supplierTable = table([
    { h: 'Поставщик', cell: (r) => code(r.id) },
    { h: 'Всего за год', num: true, cell: (r) => esc(units(r.total)) },
    { h: 'Партии', prose: true, cell: (r) => esc(r.waves.map(waveText).join('; ')) },
  ], supplierRows, { limit: 8 });

  const stateNames = { now: 'сейчас', passed: 'срок прошёл', later: 'позже' };
  const leads = [];
  Object.values(s.deadlines || {}).forEach((items) => items.forEach((i) => i.orders.forEach((o) => { if (!leads.includes(o.lead_days)) leads.push(o.lead_days); })));
  leads.sort((a, b) => a - b);
  const deadlineRows = [];
  Object.keys(s.deadlines || {}).forEach((c) => s.deadlines[c].forEach((i) => deadlineRows.push({ c, i })));
  deadlineRows.sort((a, b) => a.i.arrive_by.localeCompare(b.i.arrive_by));
  const deadlineTable = table([
    { h: 'Категория', cell: (r) => esc(catName(r.c)) },
    { h: 'Должно прийти к', cell: (r) => esc(date(r.i.arrive_by)) },
  ].concat(leads.map((l) => ({
    h: `Заказать при сроке ${l} дн.`,
    cell: (r) => {
      const o = r.i.orders.find((x) => x.lead_days === l);
      return o ? `${esc(date(o.order_by))}, <span class="state-${esc(o.state)}">${esc(stateNames[o.state] || NONE)}</span>` : NONE;
    },
  }))), deadlineRows);

  const flagNote = s.site && isNum(s.site.flag_ratio) ? pct(s.site.flag_ratio, 0) : NONE;
  const deadlineNote = site.deadline_note ? ` ${site.deadline_note}` : '';
  const scope = site.plan_scope || {};
  const checkTable = table([
    { h: 'Категория', cell: (r) => esc(r.name) },
    { h: 'План на 12 месяцев', num: true, cell: (r) => esc(units(r.plan_units)) },
    { h: 'Продажи за 12 месяцев на тех же SKU', num: true, cell: (r) => esc(units(r.l12m_orderable_units)) },
    { h: 'План к продажам', num: true, cell: (r) => esc(num(r.plan_ratio, 2)) },
    { h: 'Прогноз к продажам', num: true, cell: (r) => esc(num(r.forecast_orderable_ratio, 2)) },
    { h: 'Пометка', cell: (r) => (r.plan_flag ? warnMark(`расхождение больше ${flagNote}`) : '<span class="muted">в пределах нормы</span>') },
  ], (s.category_check || []).slice().sort(byDesc('plan_units')));

  const sc = s.scenarios || {};
  const specText = (sp) => {
    if (!sp) return NONE;
    const parts = [sp.lead === 'p90' ? 'срок по 90-му процентилю' : 'срок по медиане'];
    parts.push(sp.eta === 'eta_late_max' ? 'заказы в пути приходят поздно' : 'заказы в пути приходят как обещано');
    if (isNum(sp.cover_days)) parts.push(`покрытие ${sp.cover_days} дн., сезон короче`);
    return parts.join(', ');
  };
  const scenarioTable = table([
    { h: 'Сценарий', cell: (r) => esc(r.name) },
    { h: 'Условия', prose: true, cell: (r) => esc(specText(r.spec)) },
    { h: 'Заказ сегодня', num: true, cell: (r) => esc(units((r.order_now || {}).units)) },
    { h: 'План на 12 месяцев', num: true, cell: (r) => esc(units(r.plan_12m_units)) },
    { h: 'Потеряем до следующего прихода', num: true, cell: (r) => esc(units(r.lost_units)) },
  ], ['base', 'supplier_late', 'other_cover'].map((k) => sc[k]).filter(Boolean));

  const outlook = table([
    { h: 'Категория', cell: (r) => esc(catName(r.category)) },
    { h: 'Запас сегодня, SKU в плане', num: true, cell: (r) => esc(units(r.stock_today)) },
    { h: 'Запас через год', num: true, cell: (r) => esc(units(r.stock_end)) },
    { h: 'Ещё в пути', num: true, cell: (r) => esc(units(r.on_the_way_end)) },
    { h: 'Спрос следующего года', num: true, cell: (r) => esc(units(r.next_year_demand)) },
    { h: 'Потеряем за год с приходами плана', num: true, cell: (r) => esc(units(r.lost_units)) },
  ], (s.stock_outlook || []).slice().sort(byDesc('next_year_demand')));

  return `<section class="section"><h2>12 месячных обзоров</h2>
      <p class="lede">Всего по плану ${esc(units(cal.total_units))}. Первый обзор равен заказу на сегодня, поэтому он самый большой: дальше только то, что подходит по сроку.</p>
      <div class="panel">${reviewsChart(reviews)}<p class="scroll-hint">Таблица шире экрана, категории правее.</p><div class="scroll" tabindex="0" role="region" aria-label="Таблица обзоров">${reviewTable}</div></div>
    </section>
    ${nextOrdersHtml()}
    <section class="section"><h2>Сборка месячных обзоров по партиям</h2>
      <p class="lede">Месячные обзоры поставщика, собранные до его самого маленького прошлого заказа. Суммы за год те же, строки только сдвигаются раньше. Поэтому партия на сегодня может быть больше черновика на вкладке «Заказы»: в черновике только то, что подошло по сроку. Лишнее названо отдельно.</p>
      <div class="panel">${supplierTable}</div></section>
    <section class="section"><h2>Крайние даты</h2>
      <p class="lede">Когда заказывать, чтобы товар пришёл к началу сезона, при двух сроках поставки.${esc(deadlineNote)}</p>
      <div class="panel">${deadlineTable}</div></section>
    <section class="section"><h2>Сверка с прошлым годом</h2>
      <p class="lede">Сравнение на тех же SKU. Пометка количество не меняет: это повод посмотреть на категорию глазами.</p>
      <div class="panel">${checkTable}</div></section>
    <section class="section"><h2>Сценарии</h2><div class="panel">${scenarioTable}</div></section>
    <section class="section"><h2>Запас через год</h2>
      <p class="lede">С учётом всех приходов плана. Запас сегодня здесь только по SKU в плане: ${esc(units(scope.in_plan_units))} из ${esc(units(scope.total_units))}. Ещё ${esc(units(scope.outside_units))} лежит на SKU со статусами «${esc(gloss('statuses', 'dead'))}» и «${esc(gloss('statuses', 'decision'))}».</p><div class="panel">${outlook}</div></section>`;
}

/* ---- risks ---- */
function riskSection(title, count, lede, body) {
  return `<section class="section"><h2>${esc(title)} <span class="count">${esc(count)}</span></h2>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}${body}</section>`;
}
const skuCount = (n) => `${num(n)} SKU`;
function unprovenTable(rows, limit) {
  const why = { on_order_only: 'excess_on_order_only', thin_history: 'excess_thin_history' };
  return table([
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Категория', cell: (r) => esc(catName(r.category)) },
    { h: 'Запас', num: true, cell: (r) => esc(units(r.position)) },
    { h: 'В пути', num: true, cell: (r) => esc(units(r.in_transit)) },
    { h: 'Спрос на год', num: true, cell: (r) => esc(units(r.demand_365)) },
    { h: 'Продано за 12 месяцев', num: true, cell: (r) => esc(units(r.l12m_units)) },
    { h: 'Почему не в избытке', prose: true, cell: (r) => esc(gloss('flags', why[r.reason])) },
    { h: 'Статус', cell: (r) => esc(r.status_name) },
  ], rows, { limit });
}
function unprovenSection(s) {
  const rows = (s.risk_rows || {}).unproven_excess || [];
  if (!rows.length) return '';
  const incoming = rows.filter((r) => r.in_transit > 0);
  const rest = rows.length - incoming.length;
  const onWay = incoming.length ? `Едут ${skuCount(incoming.length)}: ${incoming.map((r) => r.sku_id).join(', ')}. Сначала выясните, зачем это едет.` : '';
  const shelf = !rest ? '' : incoming.length ? `У остальных ${skuCount(rest)} заказов в пути нет, это запас на складе.` : 'Заказов в пути по ним нет, это запас на складе.';
  return `<h3 id="unproven-title">Запаса и заказов больше, чем продаётся <span class="count">${esc(skuCount(rows.length))}</span></h3>
    <p class="lede">Запас и заказы в пути больше спроса на год, но избыток не доказан: на полке пусто или истории мало. ${esc([onWay, shelf].filter(Boolean).join(' '))}</p>
    <div class="panel">${unprovenTable(rows, 10)}</div>`;
}
function risksHtml() {
  const s = state.summary;
  const out = [];
  const deficit = (s.deficit || []).slice().sort(byDesc('lost_units'));
  out.push(riskSection('Дефицит', skuCount(deficit.length), 'Товар закончится раньше следующего прихода. «Потеряем» считает штуки до этого прихода при условии, что новый заказ уйдёт в срок. Сверху строки с наибольшими потерями.', `<div class="panel">${table([
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Категория', cell: (r) => esc(catName(r.category)) },
    { h: 'Ноль с', cell: (r) => esc(date(r.zero_from)) },
    { h: 'Приход по открытому заказу', cell: (r) => (r.po_arrival ? `${esc(date(r.po_arrival))}, ${code(r.po_id)}` : DASH) },
    { h: 'Приход нового заказа по плану', cell: (r) => esc(dateOr(r.new_order_arrival)) },
    { h: 'Потеряем', num: true, cell: (r) => esc(units(r.lost_units)) },
    { h: 'Статус', cell: (r) => esc(gloss('statuses', r.status)) },
  ], deficit, { limit: 10 })}</div>`));

  const late = (s.late_for_season || []).slice().sort(byDesc('gap_units'));
  out.push(riskSection('Поздно на сезон', skuCount(late.length), 'Заказ сегодня приедет к концу сезона, поэтому смотрим на следующий.', `<div class="panel">${late.length ? table([
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Категория', cell: (r) => esc(catName(r.category)) },
    { h: 'Приход при заказе сегодня', cell: (r) => esc(date(r.arrival_if_ordered_now)) },
    { h: 'Конец сезона', cell: (r) => esc(date(r.season_end)) },
    { h: 'Разрыв', num: true, cell: (r) => esc(units(r.gap_units)) },
    { h: 'Следующий заказ', cell: (r) => esc(`до ${date(r.next_order_by)}, ${units(r.next_order_qty)}`) },
  ], late) : emptyRow('Таких SKU нет.')}</div>`));

  const excess = (s.excess || []).slice().sort(byDesc('excess_units'));
  const excessReason = (r) => {
    const base = `Запас и заказы в пути ${units(r.held_units)} при спросе за год ${units(r.demand_365)}.`;
    const batch = isNum(r.batch_cover_months) ? ` Обычная партия ${units(r.median_batch)} это ${num(r.batch_cover_months)} мес. спроса.` : '';
    return base + batch;
  };
  out.push(riskSection('Избыток', skuCount(excess.length), 'Запас и заказы в пути больше спроса на год. Сверху строки с наибольшим излишком.', `<div class="panel">${table([
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Категория', cell: (r) => esc(catName(r.category)) },
    { h: 'Лишние штуки', num: true, cell: (r) => esc(units(r.excess_units)) },
    { h: 'Запас к спросу', num: true, cell: (r) => esc(num(r.ratio, 2)) },
    { h: 'Статус', cell: (r) => esc(gloss('statuses', r.status)) },
    { h: 'Следующий заказ по плану', cell: (r) => esc(dateOr(r.next_plan_order)) },
    { h: 'Причина', prose: true, cell: (r) => esc(excessReason(r)) },
  ], excess, { limit: 10 })}</div>${unprovenSection(s)}`));

  const oos = s.out_of_stock || {};
  const bucketNames = { order: 'Заказать', delist: 'Кандидат на снятие', buyer: 'Решает закупщик', has_po: 'Заказ уже едет' };
  const buckets = Object.keys(oos.buckets || {}).map((k) => ({ k, skus: oos.buckets[k].skus, units: oos.buckets[k].l12m_units })).sort(byDesc('units'));
  const oosRec = (r) => {
    if (r.recommendation && r.recommendation.text) return esc(groupText(r.recommendation.text));
    return esc(r.status ? gloss('statuses', r.status) : NONE);
  };
  out.push(riskSection(`${num(oos.skus)} SKU без товара`, `заказ едет только у ${num(oos.with_open_po)}`, `Продавались за 12 месяцев (${units(oos.l12m_units)}), на полке пусто.`, `<div class="panel">${table([
    { h: 'Что делаем', cell: (r) => esc(bucketNames[r.k] || NONE) },
    { h: 'SKU', num: true, cell: (r) => esc(num(r.skus)) },
    { h: 'Продано за 12 месяцев', num: true, cell: (r) => esc(units(r.units)) },
  ], buckets)}</div><h3>Все строки</h3><div class="panel">${table([
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Категория', cell: (r) => esc(catName(r.category)) },
    { h: 'Продано за 12 месяцев', num: true, cell: (r) => esc(units(r.l12m_units)) },
    { h: 'Группа', cell: (r) => esc(bucketNames[r.bucket] || NONE) },
    { h: 'Рекомендация', prose: true, cell: oosRec },
  ], (oos.rows || []).slice().sort(byDesc('l12m_units')), { limit: 10 })}</div>`));

  const queue = (s.queue || []).slice().sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'review' ? -1 : 1;
    return (b.shadow_qty || 0) - (a.shadow_qty || 0) || (b.l12m_units || 0) - (a.l12m_units || 0);
  });
  const qs = (s.headline || {}).queue_summary || {};
  const shadowText = (r) => {
    if (!isNum(r.shadow_qty) || !r.shadow_qty) return '0';
    return (r.shadow_kind === 'late' || r.shadow_kind === 'later') && r.shadow_order_by
      ? `${units(r.shadow_qty)}, до ${date(r.shadow_order_by)}` : units(r.shadow_qty);
  };
  out.push(riskSection('Очередь решений', skuCount(qs.skus), `Посмотреть обязательно: ${num(qs.review_skus)} SKU. Можно принять ответ по умолчанию: ${num(qs.default_ok_skus)} SKU на ${units(qs.default_ok_l12m_units)} продаж за 12 месяцев. Теневое количество в заказ не входит.`, `<div class="panel">${table([
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Категория', cell: (r) => esc(catName(r.category)) },
    { h: 'Приоритет', cell: (r) => (r.priority === 'review' ? 'посмотреть' : '<span class="muted">по умолчанию</span>') },
    { h: 'Почему в очереди', prose: true, cell: (r) => esc((r.reasons || []).map((x) => gloss('reasons', x)).join(', ') || NONE) },
    { h: 'Рекомендация', prose: true, cell: (r) => esc(groupText((r.recommendation || {}).text || NONE)) },
    { h: 'Теневое количество', num: true, cell: (r) => esc(shadowText(r)) },
  ], queue, { limit: 10 })}</div>`));

  const checks = (s.headline || {}).order_checks || {};
  const thin = (s.risk_rows || {}).thin_history || [];
  out.push(riskSection('Большие заказы на короткой истории', `${lines(thin.length)}, ${units((checks.thin_history || {}).units)}`, `История меньше ${num((checks.thin_history || {}).months)} месяцев. Ещё ${lines((checks.above_largest_batch || {}).lines)} на ${units((checks.above_largest_batch || {}).units)} больше самой крупной партии SKU, ${lines((checks.above_lifetime_sales || {}).lines)} на ${units((checks.above_lifetime_sales || {}).units)} больше всех продаж SKU за всё время. Количества эти пометки не меняют.`, `<div class="panel">${table([
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Категория', cell: (r) => esc(catName(r.category)) },
    { h: 'Поставщик', cell: (r) => code(r.supplier_id) },
    { h: 'Заказ', num: true, cell: (r) => esc(units(r.qty)) },
    { h: 'Продано за всё время', num: true, cell: (r) => esc(units(r.lifetime_sales)) },
    { h: 'История', num: true, cell: (r) => esc(`${num(r.history_months)}${NBSP}мес.`) },
  ], thin, { limit: 10 })}</div>`));

  const returns = (s.risk_rows || {}).high_returns || [];
  out.push(riskSection('Возвраты', skuCount(returns.length), `${gloss('flags', 'high_returns')}. Из спроса они уже вычтены. Доля в прогнозе считается за последние 12 месяцев с товаром в наличии, поэтому она может отличаться от доли за календарные 12 месяцев.`, `<div class="panel">${table([
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Категория', cell: (r) => esc(catName(r.category)) },
    { h: 'Вернули за 12 месяцев', num: true, cell: (r) => esc(units(r.returned_12m)) },
    { h: 'Продано за те же месяцы', num: true, cell: (r) => esc(units(r.l12m_units)) },
    { h: 'Доля за эти месяцы', num: true, cell: (r) => (isNum(r.window_share) ? esc(pct(r.window_share, 0)) : DASH) },
    { h: 'Доля в прогнозе', num: true, cell: (r) => esc(pct(r.return_rate, 0)) },
    { h: 'Статус', cell: (r) => esc(r.status_name) },
  ], returns, { limit: 10 })}</div>`));

  const markup = (s.risk_rows || {}).low_markup || [];
  out.push(riskSection('Низкая наценка', skuCount(markup.length), 'Наценка ниже порога: такие SKU идут в очередь решений, а не в заказ.', `<div class="panel">${table([
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Категория', cell: (r) => esc(catName(r.category)) },
    { h: 'Наценка', num: true, cell: (r) => esc(pctPlain(r.markup, 0)) },
    { h: 'За последние месяцы', num: true, cell: (r) => esc(pctPlain(r.recent_markup, 0)) },
    { h: 'Продано за 12 месяцев', num: true, cell: (r) => esc(units(r.l12m_units)) },
    { h: 'Рекомендация', prose: true, cell: (r) => esc(groupText(r.recommendation || NONE)) },
  ], markup, { limit: 10 })}</div>`));
  return out.join('');
}

/* ---- how ---- */
function caseHappened(c, s) {
  const a = c.actual, m = c.system;
  const sold = `С расчётной даты прихода метода, ${date(m.arrival)}, по ${date(a.scored_until)} продано ${units(a.sold_arrival_to_end)} Товара не было ${num(a.cover_months_out)} из ${num(a.cover_months)} мес. этого периода.`;
  const stock = `С ${date(m.as_of)} пришло ${units(a.receipts_from_cut_to_end)}, на ${date(a.scored_until)} на складе ${units(a.stock_at_end)}`;
  if (a.order_lines) return `${sold} ${stock}`;
  const window_ = ((s.site || {}).hindsight_order_window_days);
  const noOrders = a.receipts_from_cut_to_end
    ? `За ${num(window_)} дней после этой даты строк заказа в выгрузке нет, а товар пришёл, поэтому решения закупщика здесь не видно.`
    : `За ${num(window_)} дней после этой даты строк заказа в выгрузке нет.`;
  const flagged = (s.check_first || []).find((r) => r.supplier_id === m.supplier_id && r.reason === 'receipts_without_po');
  const supplier = a.receipts_from_cut_to_end && flagged ? ` Поставщик ${m.supplier_id} в списке «Сначала проверьте»: в выгрузке нет заказов на его приходы.` : '';
  return `${sold} ${stock} ${noOrders}${supplier}`;
}
function caseVerdict(c) {
  const a = c.actual, m = c.system, state_ = (c.compare || {}).state;
  if (state_ === 'no_stock') {
    return `Сравнить нельзя: товара не было ${num(a.cover_months_out)} из ${num(a.cover_months)} мес. этого периода. Это либо потерянный спрос, либо SKU сняли и заменили, а карты замен нет. Такую строку закупщик должен подтвердить до заказа.`;
  }
  if (state_ === 'too_early') return `Сравнивать рано: прогноз считан до ${date(m.cover_end)}, а продажи известны до ${date(a.scored_until)}.`;
  if (state_ === 'no_sales') return 'Продаж за этот период нет.';
  if (state_ !== 'compared') return c.verdict || NONE;
  const gap = c.compare.gap_pct;
  const side = gap < 0 ? 'ниже' : 'выше';
  const later = m.arrivals_in_cover ? `, минус приходы в этом периоде ${units(m.arrivals_in_cover)}` : '';
  return `Прогноз на этот период ${units(m.demand_in_cover)}, продано ${units(a.sold_arrival_to_end)}: прогноз ${side} продаж на ${pctPlain(Math.abs(gap))}. Заказ метода ${units(m.order_qty)}: прогноз, плюс страховка ${units(m.safety)}, минус запас на дату прихода ${units(m.stock_at_arrival)}${later}`;
}
function casesHtml(s) {
  const cases = (s.accuracy || {}).decision_cases || [];
  if (!cases.length) return '';
  const window_ = ((s.site || {}).hindsight_order_window_days);
  const rows = cases.map((c) => (c.sku_id ? c : { ...c, verdict: 'В этой категории на эту дату не нашлось SKU с продажами.' }));
  return `<h3 id="cases-title">Что метод заказал бы в прошлом: реконструкция по дате заказа</h3>
    <p class="lede">Настоящих запусков в эти дни не было, снимков заказов в учётной системе тоже нет. Расчёт повторён на прошлую дату: всё, что случилось позже, убрано. Заказ закупщика взят по дате заказа в выгрузке, за ${esc(num(window_))} дней после этой даты. Заказ метода посчитан упрощённо, только для этих примеров. Дата и категория заданы в настройках, SKU выбран без знания будущего: самый продаваемый в категории на эту дату. Показаны все примеры, в том числе не в пользу метода.</p>
    <ul class="plain-list cases-notes">
      <li>Дата прихода метода расчётная: прошлая дата плюс срок поставки, известный в тот день. Это не настоящая поставка. На ранних датах срок занижен, потому что долгие поставки ещё не успели прийти, и настоящий приход мог быть намного позже.</li>
      <li>«Нет строк заказа» значит только, что в выгрузке их нет. Считать это решением закупщика не заказывать нельзя: в выгрузке есть приходы без заказов.</li>
    </ul>
    <div class="panel">${table([
    { h: 'Дата и SKU', cell: (c) => `${esc(date((c.system || {}).as_of || `${c.cut}-01`))}<br>${c.sku_id ? skuLink(c.sku_id) : ''}${c.category_name ? `<br><span class="muted">${esc(c.category_name)}</span>` : ''}` },
    { h: 'Метод заказал бы', num: true, cell: (c) => (c.system ? `${esc(units(c.system.order_qty))}<br><span class="muted">срок ${esc(days(c.system.lead_p50_days))} на ту дату</span>` : DASH) },
    { h: 'Заказ закупщика в выгрузке', num: true, cell: (c) => (!c.actual ? DASH : c.actual.order_lines ? esc(units(c.actual.orders_placed_units)) : 'нет строк заказа') },
    { h: 'Что было на деле', prose: true, cell: (c) => (c.actual ? esc(caseHappened(c, s)) : DASH) },
    { h: 'Вывод расчёта', prose: true, cell: (c) => esc(caseVerdict(c)) },
  ], rows)}</div>`;
}
function accuracyHtml(s) {
  const a = s.accuracy || {};
  const main = a.main || {};
  const period = a.by_period || {};
  const recent = period.recent_cuts || {};
  const older = period.older_cuts || {};
  const totals = a.category_totals || {};
  const boot = (a.bootstrap || {}).recent_ly_literal_minus_prod || {};
  const info = (s.site || {}).accuracy_periods || {};
  const ci = boot.ci95 || [];
  const pair = (r) => (r ? `${pctPlain(r.wape)}, смещение ${signed(r.bias, 1)}` : NONE);
  const wapeOnly = (r) => (r ? pctPlain(r.wape) : NONE);
  const rows = [
    { name: `Все срезы, ${num(info.cuts)} шт.`, prod: pair(main.prod), ly: pair(main.ly_literal), flat: pair(main.flat_6m) },
    { name: `Срезы до ${month(info.recent_start)}`, prod: pair(older.prod), ly: pair(older.ly_literal), flat: pair(older.flat_6m) },
    { name: `Срезы с ${month(info.recent_start)}, новый ассортимент`, prod: pair(recent.prod), ly: pair(recent.ly_literal), flat: pair(recent.flat_6m) },
    { name: 'Итог по категории', prod: wapeOnly(totals.prod), ly: wapeOnly(totals.ly_literal), flat: wapeOnly(totals.flat_6m) },
  ];
  const cats = Object.keys(a.by_category || {}).map((k) => ({
    name: catName(k), prod: pair(a.by_category[k].prod), ly: pair(a.by_category[k].ly_literal), flat: pair(a.by_category[k].flat_6m),
  }));
  const cols = [
    { h: 'Срез', cell: (r) => esc(r.name) },
    { h: 'Наш метод', cell: (r) => esc(r.prod) },
    { h: 'Прошлый год', cell: (r) => esc(r.ly) },
    { h: 'Среднее за 6 месяцев', cell: (r) => esc(r.flat) },
  ];
  return `<section class="section" id="accuracy"><h2>Точность</h2>
    <div class="reading">
      <p>На новом ассортименте метод не доказал, что он лучше прошлого года: ${esc(wapeOnly(recent.prod))} против ${esc(wapeOnly(recent.ly_literal))}, разница ${esc(num(boot.delta, 1))} пункта, а 95% интервал от ${esc(signed(ci[0], 1))} до ${esc(signed(ci[1], 1))} включает ноль.</p>
      <p>Объём надёжнее смотреть по категории: итог по категории расходится с продажами на ${esc(wapeOnly(totals.prod))}. Строка SKU это раскладка объёма, а не точный прогноз: ${esc(wapeOnly(main.prod))} на всех срезах, ${esc(wapeOnly(recent.prod))} на новом ассортименте.</p>
    </div>
    <p class="lede">Ошибка это сумма отклонений, делённая на сумму продаж (WAPE). Смещение: плюс значит прогноз выше продаж. Месяцы без товара в сравнение не входят.</p>
    <div class="panel">${table(cols, rows)}</div>
    <h3>По категориям, все срезы</h3>
    <div class="panel">${table(cols, cats)}</div>
    ${casesHtml(s)}</section>`;
}
function qualityHtml(s) {
  const st = (s.supply || {}).totals || {};
  const dq = s.data_quality || {};
  const site = s.site || {};
  const pos = s.position || {};
  const fields = site.fields || {};
  const phantom = site.phantom_rows || [];
  const verification = Object.values(s.verification || {});
  const reasonNames = { receipts_without_po: 'приходы без строк заказа', no_po_at_all: 'нет заказов в выгрузке', dormant: 'больше года нет ни заказов, ни приходов' };
  const counts = {};
  verification.forEach((v) => { counts[v.reason] = (counts[v.reason] || []).concat(v.supplier_id); });
  return `<section class="section"><h2>Качество данных</h2>
    <ul class="plain-list">
      <li>Запас на дату данных: ${esc(units(pos.units))} на ${esc(num(pos.skus_with_stock))} SKU.</li>
      <li>В учётной системе в пути ${esc(units(st.erp_on_order))}, реально едет ${esc(units(st.real))}: будущих ${esc(units(st.real_future))} и просроченных ${esc(units(st.real_overdue))}. Уже приехали ${esc(units(st.phantom))}: твёрдо ${esc(units(st.phantom_firm))}, вероятно ${esc(units(st.phantom_likely))}.</li>
      <li>На закрытых строках заказов в поле ожидания висит ${esc(units((site.erp || {}).pending_on_closed_lines))}. Считаем как ноль.</li>
      <li>Скачков остатка: ${esc(num(dq.stock_jumps))}. Продаж без остатка и прихода: ${esc(num(dq.sales_without_stock))} строк на ${esc(units(dq.sales_without_stock_units))}. Продано больше остатка: ${esc(num(dq.negative_position))} SKU.</li>
      <li>Вес указан у ${esc(num(fields.weight_known))} SKU из ${esc(num(fields.skus))}, целевое покрытие заполнено у ${esc(num(fields.target_cover_days_set))}.</li>
    </ul>
    <h3>Закрыть в учётной системе <span class="count">${esc(lines(phantom.length))}</span></h3>
    <div class="panel">${table([
    { h: 'Заказ', cell: (r) => code(r.po_id) },
    { h: 'SKU', cell: (r) => skuLink(r.sku_id) },
    { h: 'Поставщик', cell: (r) => code(r.supplier_id) },
    { h: 'Количество', num: true, cell: (r) => esc(units(r.qty)) },
    { h: 'Уверенность', cell: (r) => esc(r.label) },
    { h: 'Основание', prose: true, cell: (r) => esc(r.evidence) },
  ], phantom)}</div>
    <h3>Поставщики, чьи заказы в файле проверить нельзя <span class="count">${esc(num(verification.length))}</span></h3>
    <div class="panel">${table([
    { h: 'Причина', cell: (r) => esc(reasonNames[r.k] || NONE) },
    { h: 'Поставщики', cell: (r) => esc(r.ids.slice().sort().join(', ')) },
  ], Object.keys(counts).map((k) => ({ k, ids: counts[k] })))}</div></section>`;
}
function howHtml() {
  const s = state.summary;
  const site = s.site || {};
  const j = s.journal || {};
  const seasons = site.seasons || {};
  const statusHelp = {
    dead: 'За 12 месяцев и в текущем месяце продаж нет, ничего не едет, либо заменён или снят закупщиком.',
    decision: 'Простой без заказа, прогноз выше продаж без поставок, низкая наценка, нет себестоимости или поставщика.',
    late_for_season: 'Заказ нужен сейчас, но приедет так поздно, что от сезона почти ничего не останется.',
    order_now: 'Заказывать в ближайшие дни, иначе товар не успеет.',
    order_later: 'Заказ нужен позже, в пределах года.',
    covered: 'Запаса и заказов в пути хватает.',
    excess: 'Запаса больше, чем продастся за год.',
  };
  const seasonText = (k) => {
    const v = seasons[k];
    if (!v) return 'Без выраженного сезона в расчёте покрытия.';
    return `Сезон с ${MONTHS_FROM[Number(v.start_month) - 1]} по ${MONTHS_TO[Number(v.end_month) - 1]}.`;
  };
  const glossary = (s.meta || {}).glossary || {};
  const cats = Object.keys(glossary.categories || {}).map((k) => `<dt>${esc(glossary.categories[k])}</dt><dd>${esc(seasonText(k))}</dd>`).join('');
  const statuses = Object.keys(statusHelp).map((k) => `<dt>${esc(gloss('statuses', k))}</dt><dd>${esc(statusHelp[k])}</dd>`).join('');
  const warnings = (j.warnings || []).map((w) => `<li>${esc(w)}</li>`).join('');
  const model = site.model || {};
  const words = [
    ['Теневое количество', 'Сколько заказать, если закупщик решит заказывать SKU из очереди решений. В итог заказа не входит.'],
    ['Волна', 'Дата, к которой можно присоединить строки того же поставщика, чтобы отправить один заказ.'],
    ['Обзор', 'Дата ежемесячного пересмотра плана. Первый обзор равен заказу на сегодня.'],
    ['Окно заказа', 'Дата заказа близко к дате данных, поэтому строка входит в заказ сегодня. Размер окна в методе, шаг «Когда заказывать».'],
    ['Срез', 'Прошлая дата, на которую прогноз посчитали заново и сравнили с тем, что потом продалось.'],
    ['Смещение', 'Плюс значит, что прогноз в среднем выше продаж, минус ниже.'],
    ['Главное слагаемое', 'Часть формулы количества, которая изменилась сильнее всего.'],
    ['Реконструкция', 'Расчёт на прошлую дату по сегодняшней выгрузке: всё, что случилось позже этой даты, убрано. Настоящего запуска в тот день не было.'],
  ].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  return `<section class="section"><h2>Что делает код, что делает модель</h2>
      <p class="lede">Количества, даты и статусы считает только код. Модель их не меняет.</p>
      <ul class="plain-list">
        <li>${esc(model.state || NONE)}</li>
        <li>Если число, дата или код в тексте модели не совпали с расчётом или главные числа названы не про то, на странице остаётся шаблон.</li>
        <li>Команда «/zakupki» записывает факт закупщика в журнал и пересчитывает план, например подтверждённый срок заказа. Учтено фактов в этом расчёте: ${esc(num(model.buyer_facts))}.</li>
        <li>Команда «/pochemu» разбирает строку по слагаемым, агент-скептик ищет строки, на которых директор поймает систему. Оба работают с этими же числами и ничего в них не меняют.</li>
      </ul></section>
    ${accuracyHtml(s)}
    <section class="section"><h2>Метод</h2>
      <p class="lede">Все параметры лежат в настройках. Дата берётся из данных, системные часы в расчёте не участвуют. Всё в штуках.</p>
      <ol class="steps">${(site.method || []).map((m) => `<li><b>${esc(m.title)}</b>${esc(m.text)}</li>`).join('')}</ol></section>
    ${qualityHtml(s)}
    <section class="section"><h2>Чего нет в данных</h2>
      <ul class="plain-list">
        <li>Цен закупки и бюджета, поэтому весь расчёт в штуках, денег на странице нет.</li>
        <li>Минимальных партий, короба и объёма. Округление идёт по прошлым партиям, с подписью «предположительно».</li>
        <li>Уровня сервиса: страховка подобрана на бэктесте, а не задана бизнесом.</li>
        <li>Карты замен старых SKU новыми и записей о потерянных продажах.</li>
      </ul>
      <h3>Расхождение в исходных материалах</h3>
      <p class="lede">В письме импортёр из Китая, в описании данных дистрибьютор в Румынии с поставками из Азии. На формулы это не влияет: страна входит только через срок поставки, а срок берётся из фактических отгрузок.</p></section>
    <section class="section"><h2>Журнал решений закупщика</h2>
      <p class="lede">Решения закупщика записываются в журнал и учитываются в следующем запуске: подтверждённый срок, снятый SKU, проверенный поставщик.</p>
      <ul class="plain-list"><li>Решений по SKU: ${esc(num(j.decisions))}.</li><li>Замен SKU: ${esc(num(j.successors))}.</li><li>Проверенных поставщиков: ${esc(num((j.suppliers_verified || []).length))}.</li><li>Правок по заказам в пути: ${esc(num(model.order_facts))}.</li><li>Сроков поставщика, заданных вручную: ${esc(num(model.lead_facts))}.</li>${warnings}</ul></section>
    <section class="section"><h2>Вопросы к вам</h2>
      <ul class="plain-list">${(site.questions || []).map((q) => `<li>${esc(q)}</li>`).join('')}</ul></section>
    <section class="section"><h2>Словарь</h2>
      <h3>Категории</h3><dl class="gloss">${cats}</dl>
      <h3>Статусы SKU</h3><dl class="gloss">${statuses}</dl>
      <h3>Слова на странице</h3><dl class="gloss">${words}</dl></section>`;
}

/* ---- SKU card ---- */
const EXCLUDED = ['OUT', 'GHOST'];
const MONTH_STATUS = { OK: 'в наличии', OUT: 'нет товара', GHOST: 'почти нет товара', RUNOUT: 'закончился в месяце', LATE: 'пришёл поздно' };

function salesChart(card) {
  const hist = card.history || [];
  const fc = card.forecast || [];
  if (!hist.length && !fc.length) return emptyRow('Истории и прогноза нет.');
  const phone = isPhone();
  const W = phone ? 360 : 640, H = phone ? 180 : 200, L = phone ? 40 : 46, R = phone ? 4 : 8, T = 16, B = 22;
  const max = Math.max(1, ...hist.map((m) => m.sold || 0), ...fc.map((m) => m.units || 0));
  const ticks = niceTicks(max);
  const top = Math.max(max, ticks[ticks.length - 1]);
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const all = hist.map((m) => ({ m, kind: 'h' })).concat(fc.map((m) => ({ m, kind: 'f' })));
  const slot = (W - L - R) / all.length;
  const bw = Math.max(3, slot - 2);
  const grid = ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${esc(num(t))}</text>`).join('');
  let marks = '';
  all.forEach((d, i) => {
    const x = L + i * slot;
    const name = d.m.month;
    const value = d.kind === 'h' ? d.m.sold : d.m.units;
    const excluded = d.kind === 'h' && EXCLUDED.includes(d.m.status);
    if (excluded) marks += `<rect x="${x}" y="${T}" width="${slot}" height="${y(0) - T}" fill="url(#hatch)"/>`;
    const h = Math.max(isNum(value) && value > 0 ? 1.5 : 0, y(0) - y(value || 0));
    marks += `<rect x="${x + 1}" y="${y(0) - h}" width="${bw}" height="${h}" rx="2" fill="var(${d.kind === 'h' ? '--ink-2' : '--ramp-3'})"/>`;
    const tip = d.kind === 'h'
      ? `${month(name)}: продано ${units(d.m.sold)}, возвраты ${units(d.m.returned)}, остаток на 1-е ${units(d.m.opening)}, ${MONTH_STATUS[d.m.status] || 'наличие неизвестно'}${excluded ? ', исключён из прогноза' : ''}.`
      : `${month(name)}: прогноз ${units(d.m.units)}.`;
    marks += `<rect class="hit" x="${x}" y="${T}" width="${slot}" height="${y(0) - T}" data-tip="${esc(tip)}"/>`;
    if (name.endsWith('-01') || (i === 0 && !phone)) marks += `<text x="${x + 1}" y="${H - 6}">${esc(phone ? name.slice(0, 4) : month(name))}</text>`;
  });
  const split = L + hist.length * slot;
  const rule = hist.length && fc.length ? `<line x1="${split}" x2="${split}" y1="${T - 8}" y2="${y(0)}" stroke="var(--ink)"/><text class="label" x="${split + 4}" y="${T - 2}">прогноз</text>` : '';
  const rowsH = hist.slice().reverse().map((m) => `<tr><td>${esc(month(m.month))}</td><td class="num">${esc(num(m.sold))}</td><td class="num">${esc(num(m.returned))}</td><td class="num">${esc(num(m.opening))}</td><td>${esc(MONTH_STATUS[m.status] || DASH)}</td></tr>`).join('');
  const rowsF = fc.map((m) => `<tr><td>${esc(month(m.month))}</td><td class="num">${esc(num(m.units))}</td></tr>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Продажи за 24 месяца и прогноз на 12 месяцев, штук. Те же числа в таблице ниже.">
      <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--tint)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--fog)" stroke-width="2"/></pattern></defs>
      ${grid}${marks}${rule}<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--fog)"/></svg>
    <div class="chart-legend"><span><i style="background:var(--ink-2)"></i>продано</span><span><i style="background:var(--ramp-3)"></i>прогноз</span><span><i class="hatch"></i>месяц исключён из прогноза: товара не было</span></div>
    <details class="alt"><summary>Таблица месяцев</summary><div class="pair-tables"><table class="t"><thead><tr><th>Месяц</th><th class="num">Продано</th><th class="num">Возвраты</th><th class="num">Остаток</th><th>Наличие</th></tr></thead><tbody>${rowsH}</tbody></table><table class="t"><thead><tr><th>Месяц</th><th class="num">Прогноз</th></tr></thead><tbody>${rowsF}</tbody></table></div></details>`;
}

function stockChart(card) {
  const p = card.projection || [];
  if (!p.length) return emptyRow('Проекции нет.');
  const phone = isPhone();
  const W = phone ? 360 : 640, H = phone ? 160 : 170, L = phone ? 40 : 46, R = phone ? 4 : 8, T = 12, B = 22;
  const max = Math.max(1, ...p.map((d) => d.with_po || 0), ...p.map((d) => d.with_order || 0));
  const ticks = niceTicks(max);
  const top = Math.max(max, ticks[ticks.length - 1]);
  const y = (v) => T + (H - T - B) * (1 - (v || 0) / top);
  const x = (i) => L + (i + 0.5) * ((W - L - R) / p.length);
  const slot = (W - L - R) / p.length;
  const grid = ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${esc(num(t))}</text>`).join('');
  const line = (key) => p.map((d, i) => `${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const hits = p.map((d, i) => {
    const tip = `${date(d.date)}: с заказами в пути ${units(d.with_po)}, плюс рекомендованный заказ ${units(d.with_order)}.`;
    const label = i % 3 === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(month(d.date))}</text>` : '';
    return `<rect class="hit" x="${L + i * slot}" y="${T}" width="${slot}" height="${H - T - B}" data-tip="${esc(tip)}"/>${label}`;
  }).join('');
  const rows = p.map((d) => `<tr><td>${esc(date(d.date))}</td><td class="num">${esc(num(d.with_po))}</td><td class="num">${esc(num(d.with_order))}</td></tr>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Проекция запаса на 12 месяцев, штук. Те же числа в таблице ниже.">
      ${grid}<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--fog)"/>
      <polyline fill="none" stroke="var(--primary)" stroke-width="2" points="${line('with_order')}"/>
      <polyline fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-dasharray="5 4" points="${line('with_po')}"/>${hits}</svg>
    <div class="chart-legend"><span><i class="dash"></i>с заказами в пути, без нового заказа</span><span><i class="line" style="background:var(--primary)"></i>плюс рекомендованный заказ</span></div>
    <details class="alt"><summary>Таблица месяцев</summary><table class="t"><thead><tr><th>На дату</th><th class="num">С заказами в пути</th><th class="num">Плюс рекомендованный заказ</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}

function gapSentence(card) {
  const gap = card.stock_life.gap;
  if (!gap || !gap.zero_from) return 'Разрыва до прихода нет.';
  const until = gap.until_arrival || gap.until_order_arrival;
  if (until) {
    const kind = gap.until_arrival ? 'прихода по заказу' : 'прихода рекомендованного заказа';
    return `Ноль с ${date(gap.zero_from)} до ${kind} ${date(until)}: ${days(gap.days)}, потеряем ${units(gap.lost_units)}.`;
  }
  const arrival = (card.order || card.shadow || {}).arrival;
  if (!arrival) return `Запас закончится ${date(gap.zero_from)}, новых приходов в плане нет.`;
  if (arrival <= gap.zero_from) return `Запас без нового заказа закончится ${date(gap.zero_from)}. Рекомендованный заказ приедет раньше, ${date(arrival)}, разрыва нет.`;
  return `Запас без нового заказа закончится ${date(gap.zero_from)}, рекомендованный заказ приедет ${date(arrival)}.`;
}
function stockLifeHtml(card) {
  const life = card.stock_life;
  if (!life) return '';
  const zero = (z) => (z && z.zero_date ? `ноль с ${date(z.zero_date)}` : 'до нуля не доходит');
  return `<p>Только запас: ${esc(zero(life.without_po))}. С заказами в пути: ${esc(zero(life.with_po))}.</p><p>${esc(gapSentence(card))}</p>`;
}

const TERM_NAMES = [
  ['demand', 'Спрос за покрытие', true], ['ss_lead', 'Страховка на срок поставки', true],
  ['ss_k', 'Страховка на ошибку прогноза', true], ['ss_cap', 'Потолок страховки', false],
  ['stock_at_arrival', 'Запас к дате прихода', true], ['arrivals_in_cover', 'Заказы, которые придут в покрытие', true],
  ['floor', 'Отсечка', false], ['rounding', 'Округление, предположительно', true], ['buyer_override', 'Правка закупщика', false],
];
function termsTable(terms, qty, step) {
  if (!terms) return '';
  const rows = TERM_NAMES.filter(([k, , always]) => always || (isNum(terms[k]) && terms[k] !== 0)).map(([k, name]) => {
    const tail = k === 'rounding' && isNum(step) ? `, шаг ${num(step)}` : '';
    return `<tr><td>${esc(name + tail)}</td><td class="num">${esc(isNum(terms[k]) ? signed(terms[k] === 0 ? 0 : terms[k], 2) : NONE)}</td></tr>`;
  }).join('');
  return `<table class="t terms"><tbody>${rows}<tr><td class="total">Количество</td><td class="num total">${esc(units(qty))}</td></tr></tbody></table><p class="muted small">Слагаемые округлены до сотых, сумма может расходиться на 0,01–0,02.</p>`;
}
function orderBlock(card) {
  const o = card.order;
  const sh = card.shadow;
  const late = card.late;
  if (o && card.status === 'order_now') {
    const passed = o.order_day && o.order_day < o.order_by ? ` Срок заказа по расчёту наступил ${date(o.order_day)}.` : '';
    return `<h3>Заказ</h3><p>${esc(units(o.qty))} до ${esc(date(o.order_by))}, приход ${esc(date(o.arrival))}, покрытие до ${esc(date(o.cover_until))}.${esc(passed)}</p><h3>Как получилось количество</h3>${termsTable(o.terms, o.qty, (o.rounding || {}).step)}`;
  }
  if (o && o.kind === 'later') {
    return `<h3>Будущий заказ</h3><p>Сегодня заказывать не нужно. Следующий заказ ${esc(units(o.qty))} до ${esc(date(o.order_by))}, приход ${esc(date(o.arrival))}, покрытие до ${esc(date(o.cover_until))}.</p><h3>Как получилось количество</h3>${termsTable(o.terms, o.qty, (o.rounding || {}).step)}`;
  }
  if (late) {
    const cmp = o ? `<p class="muted">Если заказать сегодня, для сравнения: ${esc(units(o.qty))}, приход ${esc(date(o.arrival))}.</p>` : '';
    return `<h3>Поздно на сезон</h3><p>Сезон кончается ${esc(date(late.season_end))}, разрыв ${esc(units(late.gap_units))}. Заказ к следующему сезону: до ${esc(date(late.next_order_by))}, ${esc(units(late.next_order_qty))}, сезон с ${esc(date(late.next_season_start))}.${late.plan_next_order ? ` По плану первая строка ${esc(date(late.plan_next_order))}: ${esc(units(late.plan_next_qty))}.` : ''}</p>${cmp}<h3>Как получилось количество на следующий сезон</h3>${termsTable(late.next_order_terms, late.next_order_qty, ((o || sh || {}).rounding || {}).step)}`;
  }
  if (sh) {
    const when = sh.order_by ? ` до ${date(sh.order_by)}` : '';
    return `<h3>Теневой заказ</h3><p>В итог заказа не входит: ${esc(units(sh.qty))}${esc(when)}, приход ${esc(date(sh.arrival))}.</p><h3>Как получилось количество</h3>${termsTable(sh.terms, sh.qty, (sh.rounding || {}).step)}`;
  }
  return '<h3>Заказ</h3><p>Заказа по этому SKU нет.</p>';
}
function cardHtml(card) {
  const g = (state.summary.meta || {}).glossary || {};
  const reasons = (card.reasons || []).map((r) => gloss('reasons', r)).join(', ');
  const rec = card.recommendation && card.recommendation.text;
  /* The engine sets this flag by the export's confirmed units. Once the buyer has named the date, it is not a question. */
  const allNamed = (card.in_transit_lines || []).length && card.in_transit_lines.every((l) => l.eta_source === 'override');
  const flags = (card.flags || []).filter((f) => !(f === 'eta_unconfirmed' && allNamed)).map((f) => `<span class="tag">${esc((g.flags || {})[f] || NONE)}</span>`).join(' ');
  const lead = card.lead || {};
  const leadSources = { own: `свои отгрузки: ${num(lead.shipments)}`, pool: 'общий срок по всем поставщикам', override: 'задан вручную' };
  const confidence = lead.confidence === 'manual' ? 'ручная' : gloss('confidence', lead.confidence);
  const pos = (card.in_transit_lines || []);
  const posTable = pos.length ? table([
    { h: 'Заказ', cell: (r) => code(r.po_id) },
    { h: 'Количество', num: true, cell: (r) => esc(units(r.qty)) },
    { h: 'Подтверждено в выгрузке', num: true, cell: (r) => esc(units(r.qty_confirmed)) },
    { h: 'Обещано', cell: (r) => esc(date(r.promised)) },
    { h: 'Ждём', cell: (r) => esc(date(r.eta_base)) },
    { h: 'Если поздно', cell: (r) => esc(r.eta_source === 'override' ? 'дату назвал закупщик' : `${date(r.eta_late_min)} – ${date(r.eta_late_max)}`) },
  ], pos) : '<p class="muted">Открытых заказов нет.</p>';
  const sc = card.scenarios || null;
  const scenarioTable = sc ? table([
    { h: 'Сценарий', cell: (r) => esc(gloss('scenarios', r.k)) },
    { h: 'Статус', cell: (r) => esc(gloss('statuses', r.v.status)) },
    { h: 'Заказ сегодня', num: true, cell: (r) => esc(units(r.v.qty)) },
    { h: 'Заказать до', cell: (r) => esc(dateOr(r.v.order_by)) },
    { h: 'Потеряем', num: true, cell: (r) => esc(units(r.v.lost_units)) },
  ], ['base', 'supplier_late', 'other_cover'].filter((k) => sc[k]).map((k) => ({ k, v: sc[k] }))) : '';
  const context = `Запас ${units(card.position)}, в пути ${units(card.in_transit)}, продано за 12 месяцев ${units(card.l12m_units)}.`;
  return `<div class="drawer-top"><div><h2 id="drawer-title">${esc(card.sku_id)}</h2><p class="muted">${esc(card.category_name)}, ${card.supplier_id ? `поставщик ${code(card.supplier_id)}` : 'поставщик не назначен'}</p></div>
      <button type="button" class="btn btn-plain" data-close>Закрыть</button></div>
    <div class="status-line"><b class="tag">${esc(card.status_name)}</b></div>
    ${reasons ? `<p>Причина: ${esc(lowerFirst(reasons))}.</p>` : ''}
    ${rec ? `<p>Рекомендация: ${esc(lowerFirst(groupText(rec)))}.</p>` : ''}
    <p class="muted">${esc(context)}</p>
    ${orderBlock(card)}
    <h3>Продажи и прогноз</h3>${salesChart(card)}
    <h3>Запас вперёд</h3>${stockChart(card)}${stockLifeHtml(card)}
    <h3>Срок поставки</h3>
    <dl class="kv"><dt>Берём</dt><dd>${esc(days(lead.lead_days))}</dd><dt>Медиана и 90-й процентиль</dt><dd>${esc(days(lead.p50))} и ${esc(days(lead.p90))}</dd><dt>Источник</dt><dd>${esc(leadSources[lead.source] || NONE)}</dd><dt>Уверенность</dt><dd>${esc(confidence)}</dd></dl>
    <h3>Открытые заказы</h3>${posTable}
    ${scenarioTable ? `<h3>Сценарии</h3>${scenarioTable}` : ''}
    ${flags ? `<h3>Пометки</h3><p>${flags}</p>` : ''}`;
}

function loadSkus() {
  if (!state.skusPromise) {
    state.skusPromise = fetchJson(`data/${state.asOf}/skus.json`).then((data) => { state.skus = data; return data; });
    state.skusPromise.catch(() => { state.skusPromise = null; });
  }
  return state.skusPromise;
}
function openCard(id) {
  const drawer = document.getElementById('drawer');
  const scrim = document.getElementById('scrim');
  if (drawer.hidden && document.activeElement && document.activeElement !== document.body) state.opener = document.activeElement;
  drawer.hidden = false;
  scrim.hidden = false;
  document.body.style.overflow = 'hidden';
  const paint = (html) => {
    drawer.innerHTML = tidy(html);
    drawer.scrollTop = 0;
    const close = drawer.querySelector('[data-close]');
    if (close) close.focus();
  };
  const shell = (title, text) => `<div class="drawer-top"><div><h2 id="drawer-title">${esc(title)}</h2></div><button type="button" class="btn btn-plain" data-close>Закрыть</button></div><p class="muted">${esc(text)}</p>`;
  if (!state.skus) paint(shell(id, 'Загружаю карточку.'));
  loadSkus().then((all) => {
    if (location.hash !== `#sku/${id}`) return;
    paint(all[id] ? cardHtml(all[id]) : shell(id, 'Такого SKU нет в этом расчёте.'));
  }).catch(() => paint(shell(id, 'Не удалось загрузить карточку. Обновите страницу.')));
}
function closeCardUi() {
  const drawer = document.getElementById('drawer');
  if (drawer.hidden) return;
  drawer.hidden = true;
  drawer.innerHTML = '';
  document.getElementById('scrim').hidden = true;
  document.body.style.overflow = '';
  if (state.opener && document.contains(state.opener)) state.opener.focus();
  state.opener = null;
}
function leaveCard() { location.hash = `#${state.tab || 'orders'}`; }

/* ---- routing ---- */
function renderTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (state.rendered === tab) return;
  const view = document.getElementById('view');
  const render = { orders: ordersHtml, calendar: calendarHtml, risks: risksHtml, how: howHtml }[tab];
  const switched = state.rendered !== null;
  view.innerHTML = tidy(render());
  state.rendered = tab;
  document.title = `${TAB_NAMES[tab]}: план закупок`;
  window.scrollTo(0, 0);
  if (switched) view.focus({ preventScroll: true });
  if (state.jump) {
    const target = document.getElementById(state.jump);
    state.jump = null;
    if (target) target.scrollIntoView();
  }
}
function route() {
  if (!state.summary) return;
  const hash = location.hash.replace(/^#/, '');
  if (hash === 'view' && state.rendered) return; /* the skip link stays on this tab */
  if (hash.startsWith('sku/')) {
    if (!state.rendered) renderTab('orders');
    openCard(decodeURIComponent(hash.slice(4)));
    return;
  }
  closeCardUi();
  renderTab(TABS.includes(hash) ? hash : 'orders');
}

/* ---- header ---- */
function renderHeader() {
  const s = state.summary;
  const meta = s.meta || {};
  const label = meta.label ? `, ${meta.label}` : '';
  document.getElementById('band-date').textContent = `Данные на ${date(meta.as_of)}${label}`;
  const last = state.history[state.history.length - 1];
  let text = '';
  if (last) {
    const when = checkedAt(last.checked_at);
    const failure = { override: 'правка не прошла', tests: 'автотесты не прошли' }[last.error_source] || 'выгрузка не прошла';
    const result = last.status === 'failed' ? failure : last.status === 'unchanged' ? 'новых данных нет' : 'расчёт обновлён';
    text = `Последняя проверка${when ? ` ${when}` : ''}: ${result}`;
  }
  document.getElementById('band-check').textContent = text;
  const alert = document.getElementById('alert');
  if (last && last.status === 'failed') {
    const what = { override: 'Последняя правка закупщика не прошла проверку', tests: 'Автотесты не прошли, расчёт не запускался' }[last.error_source] || 'Последняя выгрузка не прошла проверку';
    alert.innerHTML = tidy(`<div class="wrap alert-in">${ICON_WARN}<span>${esc(what)}: показан расчёт на ${esc(date(meta.as_of))}. Причина: ${esc(last.error || NONE)}.</span></div>`);
    alert.hidden = false;
  }
}

/* ---- search ---- */
const SEARCH_LIMIT = 12;
function renderSearch(query) {
  const out = document.getElementById('search-out');
  if (!out || !state.summary) return;
  const q = query.trim().toLowerCase();
  if (!q) { out.hidden = true; out.innerHTML = ''; return; }
  const fields = (r) => [r[0], r[1], r[3]].concat(r[5] || []);
  const found = (state.summary.sku_index || []).filter((r) => fields(r).some((v) => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => (isNum(b[4]) ? b[4] : -1) - (isNum(a[4]) ? a[4] : -1));
  const hits = found.slice(0, SEARCH_LIMIT);
  const tail = found.length > hits.length ? `<li class="none">Показано ${esc(num(hits.length))} из ${esc(num(found.length))}, сверху самые большие заказы.</li>` : '';
  out.innerHTML = hits.length
    ? hits.map((r) => `<li><a href="#sku/${esc(r[0])}">${esc(r[0])}<span>${esc(r[1])}, ${esc(r[2])}${isNum(r[4]) ? `, заказ ${esc(units(r[4]))}` : ''}</span></a></li>`).join('') + tail
    : '<li class="none">Ничего не нашлось</li>';
  out.hidden = false;
}
function closeSearch() {
  const out = document.getElementById('search-out');
  if (out) out.hidden = true;
}

/* ---- tooltip ---- */
function showTip(target) {
  const tip = document.getElementById('tip');
  tip.textContent = target.getAttribute('data-tip');
  tip.hidden = false;
  const r = target.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - t.width - 8, r.left + r.width / 2 - t.width / 2));
  const above = r.top - t.height - 6;
  tip.style.left = `${left}px`;
  tip.style.top = `${above > 4 ? above : r.bottom + 6}px`;
}
function hideTip() { document.getElementById('tip').hidden = true; }
/* A keyboard move scrolls the table: the cell in focus keeps its tooltip, and it follows the cell. */
function onScroll() {
  const active = document.activeElement;
  if (active && active.classList && active.classList.contains('tl-cell')) showTip(active);
  else hideTip();
}

/* ---- events ---- */
function moveInTimeline(event) {
  const cell = event.target.closest('.tl-cell');
  if (!cell) return;
  const steps = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
  if (!steps) return;
  const row = cell.parentElement;
  const rows = Array.from(row.parentElement.children);
  const nextRow = rows[rows.indexOf(row) + steps[0]];
  if (!nextRow) return;
  const next = nextRow.children[cell.cellIndex + steps[1]];
  if (!next || !next.classList.contains('tl-cell')) return;
  event.preventDefault();
  cell.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
}
function trapFocus(event) {
  const drawer = document.getElementById('drawer');
  if (drawer.hidden || event.key !== 'Tab') return;
  const items = Array.from(drawer.querySelectorAll('a[href], button, summary, [tabindex="0"]')).filter((el) => el.offsetParent !== null);
  if (!items.length) { event.preventDefault(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}
function selectRun(asOf) {
  state.changesRun = asOf;
  const slot = document.getElementById('changes');
  const paint = () => { if (slot && document.contains(slot)) slot.innerHTML = tidy(changesHtml()); };
  if (asOf === state.asOf || state.cache[asOf]) { paint(); return; }
  paint();
  fetchJson(`data/${asOf}/summary.json`).then((s) => { state.cache[asOf] = s; paint(); }).catch(() => {
    if (slot) slot.innerHTML = `${emptyRow('Не удалось загрузить этот расчёт.')}${historyHtml()}`;
  });
}
function onClick(event) {
  const more = event.target.closest('[data-more]');
  if (more) {
    const list = more.closest('.lst');
    const open = list.classList.toggle('open');
    more.textContent = open ? 'Свернуть' : `Показать все: ${num(Number(more.dataset.more))}`;
    return;
  }
  const jump = event.target.closest('[data-jump]');
  if (jump) {
    event.preventDefault();
    const id = jump.dataset.jump;
    if (`#${state.tab}` === jump.getAttribute('href')) {
      const target = document.getElementById(id);
      if (target) target.scrollIntoView();
    } else {
      state.jump = id;
      location.hash = jump.getAttribute('href');
    }
    return;
  }
  const next = event.target.closest('[data-nextcat]');
  if (next) { state.nextCat = next.dataset.nextcat; state.jump = 'next-orders'; }
  if (event.target.closest('#search-out a')) closeSearch();
  const toggle = event.target.closest('[data-toggle]');
  if (toggle) {
    const detail = document.getElementById(toggle.dataset.toggle);
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    detail.hidden = !open;
    return;
  }
  const run = event.target.closest('[data-run]');
  if (run) { selectRun(run.dataset.run); return; }
  if (event.target.closest('[data-close]') || event.target.id === 'scrim') { leaveCard(); return; }
  if (!event.target.closest('#search')) closeSearch();
}
function bind() {
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideTip();
      closeSearch();
      if (!document.getElementById('drawer').hidden) leaveCard();
      return;
    }
    trapFocus(event);
    moveInTimeline(event);
  });
  document.addEventListener('input', (event) => { if (event.target.id === 'sku-search') renderSearch(event.target.value); });
  document.addEventListener('focusout', (event) => {
    const box = document.getElementById('search');
    if (box && box.contains(event.target) && event.relatedTarget && !box.contains(event.relatedTarget)) closeSearch();
  });
  document.addEventListener('change', (event) => {
    if (event.target.id !== 'next-cat') return;
    state.nextCat = event.target.value;
    document.getElementById('next-table').innerHTML = tidy(nextOrdersTable());
  });
  window.matchMedia('(max-width: 720px)').addEventListener('change', () => {
    if (!state.summary || !state.tab) return;
    state.rendered = null;
    renderTab(state.tab);
  });
  document.addEventListener('keydown', (event) => {
    if (event.target.id === 'sku-search' && event.key === 'Enter') {
      const hit = document.querySelector('#search-out a');
      if (hit) { location.hash = hit.getAttribute('href'); closeSearch(); }
    }
  });
  document.addEventListener('mouseover', (event) => { const t = event.target.closest('[data-tip]'); if (t) showTip(t); else hideTip(); });
  document.addEventListener('focusin', (event) => { const t = event.target.closest('[data-tip]'); if (t) showTip(t); else hideTip(); });
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('hashchange', route);
}

/* ---- start ---- */
function fetchJson(path) {
  return fetch(path).then((r) => {
    if (!r.ok) throw new Error(path);
    return r.json();
  });
}
function start() {
  bind();
  fetchJson('data/history.json').then((history) => {
    state.history = Array.isArray(history) ? history : [];
    const current = state.history.slice().reverse().find((e) => e.status === 'ok' && e.has_data);
    if (!current) throw new Error('no run');
    state.asOf = current.as_of;
    return Promise.all([
      fetchJson(`data/${state.asOf}/summary.json`),
      fetchJson(`data/${state.asOf}/timeline.json`).catch(() => null),
    ]);
  }).then(([summary, timeline]) => {
    state.summary = summary;
    state.timeline = timeline;
    renderHeader();
    route();
  }).catch(() => {
    document.getElementById('view').innerHTML = '<p class="loading">Не удалось загрузить расчёт. Обновите страницу.</p>';
  });
}
start();
