import fs from 'fs';
import path from 'path';

// Locate a CSV file: either passed as arg or the latest first-owner-cars-*.csv
function findCsvFile() {
    const arg = process.argv[2];
    if (arg && fs.existsSync(arg)) return arg;

    const cwd = process.cwd();
    const files = fs.readdirSync(cwd)
        .filter(f => f.endsWith('.csv'))
        .sort((a, b) => fs.statSync(path.join(cwd, b)).mtimeMs - fs.statSync(path.join(cwd, a)).mtimeMs);
    if (files.length === 0) {
        throw new Error('No .csv files found in current directory. Pass a path as the first argument.');
    }
    return path.join(cwd, files[0]);
}

function parseCsvPipe(content) {
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split('|').map(h => h.trim());
    const rows = lines.slice(1).map(line => line.split('|').map(v => v.trim()));
    return { headers, rows };
}

function inferColumnIndex(headers, candidates) {
    const lc = headers.map(h => h.toLowerCase());
    for (const c of candidates) {
        const idx = lc.indexOf(c);
        if (idx !== -1) return idx;
    }
    return -1;
}

function escapeHtml(s) {
    return (s ?? '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildHtml(headers, rows) {
    // Identify important columns (by Bulgarian header names used by the scraper)
    const linkIdx = inferColumnIndex(headers, ['линк', 'link']);
    const titleIdx = inferColumnIndex(headers, ['заглавие', 'title']);
    const yearIdx = inferColumnIndex(headers, ['година на производство', 'година', 'year']);
    const mileageIdx = inferColumnIndex(headers, ['пробег', 'mileage']);
    const fuelIdx = inferColumnIndex(headers, ['тип гориво', 'fuel']);
    const volumeIdx = inferColumnIndex(headers, ['обем на двигателя', 'engine volume', 'engine']);
    const hpIdx = inferColumnIndex(headers, ['мощност', 'horsepower']);
    const transmissionIdx = inferColumnIndex(headers, ['скоростна кутия', 'transmission']);
    const formIdx = inferColumnIndex(headers, ['форм фактор', 'form']);
    const keywordIdx = inferColumnIndex(headers, ['намерен по ключова дума', 'matched keyword']);
    const priceIdx = inferColumnIndex(headers, ['цена', 'price']); // optional

    const sortableHeader = (name, key) => `<th data-key="${key}">${escapeHtml(name)}<span class="sort-indicator"></span></th>`;

    const html = `<!doctype html>
<html lang="bg">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Обобщена таблица от CSV</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', Arial, sans-serif; margin: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; }
    th { background: #f8fafc; position: sticky; top: 0; z-index: 1; cursor: pointer; user-select: none; }
    tr:hover { background: #f9fafb; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .sort-indicator { margin-left: 6px; color: #94a3b8; }
    .numeric { text-align: right; white-space: nowrap; }
    .toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
    input[type="search"] { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 6px; width: 280px; }
    .muted { color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="toolbar">
    <input id="search" type="search" placeholder="Търси по заглавие или ключова дума..." />
    <span class="muted">Кликни заглавията за сортиране (вкл. Пробег, Мощност, ${priceIdx !== -1 ? 'Цена, ' : ''}Година, Ключова дума)</span>
  </div>
  <table id="data-table">
    <thead>
      <tr>
        ${sortableHeader(headers[linkIdx] || 'Линк', 'link')}
        ${sortableHeader(headers[titleIdx] || 'Заглавие', 'title')}
        ${priceIdx !== -1 ? sortableHeader(headers[priceIdx] || 'Цена', 'price') : ''}
        ${sortableHeader(headers[yearIdx] || 'Година на производство', 'year')}
        ${sortableHeader(headers[mileageIdx] || 'Пробег', 'mileage')}
        ${sortableHeader(headers[fuelIdx] || 'Тип гориво', 'fuel')}
        ${sortableHeader(headers[volumeIdx] || 'Обем на двигателя', 'engineVolume')}
        ${sortableHeader(headers[hpIdx] || 'Мощност', 'horsepower')}
        ${sortableHeader(headers[transmissionIdx] || 'Скоростна кутия', 'transmission')}
        ${sortableHeader(headers[formIdx] || 'Форм фактор', 'formFactor')}
        ${sortableHeader(headers[keywordIdx] || 'Намерен по ключова дума', 'matchedKeyword')}
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => {
        const link = r[linkIdx] || '';
        const title = r[titleIdx] || '';
        const year = r[yearIdx] || '';
        const mileage = r[mileageIdx] || '';
        const fuel = r[fuelIdx] || '';
        const volume = r[volumeIdx] || '';
        const hp = r[hpIdx] || '';
        const transmission = r[transmissionIdx] || '';
        const form = r[formIdx] || '';
        const price = priceIdx !== -1 ? (r[priceIdx] || '') : '';
        const keyword = r[keywordIdx] || '';

        const toDigits = (s) => (s || '').toString().replace(/[^0-9]/g, '');
        const toNumberText = (s) => {
          const digits = toDigits(s);
          return digits.length ? digits : '';
        };

        const cell = (v, cls = '') => `<td class="${cls}">${escapeHtml(v)}</td>`;
        const numCell = (v, cls = '') => {
          const num = toNumberText(v);
          const data = num ? ` data-num="${num}"` : '';
          return `<td class="${cls}"${data}>${escapeHtml(v)}</td>`;
        };
        const linkCell = `<td><a href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(title || link)}</a></td>`;

        return `<tr>
          ${cell(link)}
          ${linkCell}
          ${priceIdx !== -1 ? numCell(price, 'numeric') : ''}
          ${numCell(year, 'numeric')}
          ${numCell(mileage, 'numeric')}
          ${cell(fuel)}
          ${numCell(volume, 'numeric')}
          ${numCell(hp, 'numeric')}
          ${cell(transmission)}
          ${cell(form)}
          ${cell(keyword)}
        </tr>`;
      }).join('\n')}
    </tbody>
  </table>
  <script>
    (function() {
      const table = document.getElementById('data-table');
      const tbody = table.querySelector('tbody');
      const headers = table.querySelectorAll('th');
      let sortState = { key: null, dir: 1 };

      function textFromCell(cell) { return (cell?.textContent || '').trim(); }

      function parseNumberBg(s) {
        // Prefer a numeric hint on the cell when available
        const t = (s || '').toString();
        const digits = t.replace(/[^0-9]/g, '');
        if (digits) return parseFloat(digits);
        // Fallback parsing
        const x = t.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');
        const num = x.replace(/[^0-9.\-]/g, '');
        const f = parseFloat(num);
        return isNaN(f) ? Number.NEGATIVE_INFINITY : f;
      }

      function getKeyExtractor(key) {
        // Map header key to column index
        const map = {};
        headers.forEach((h, i) => { map[h.dataset.key] = i; });
        const idx = map[key];
        const numericKeys = new Set(['mileage', 'horsepower', 'price', 'year', 'engineVolume']);
        return function(row) {
          const cell = row.children[idx];
          const hint = cell?.dataset?.num;
          if (hint) return parseFloat(hint);
          const val = textFromCell(cell);
          if (numericKeys.has(key)) return parseNumberBg(val);
          return val.toLowerCase();
        }
      }

      function updateSortIndicators(activeKey, dir) {
        headers.forEach(h => {
          const span = h.querySelector('.sort-indicator');
          if (!span) return;
          if (h.dataset.key === activeKey) {
            span.textContent = dir > 0 ? '▲' : '▼';
          } else {
            span.textContent = '';
          }
        });
      }

      headers.forEach(h => {
        h.addEventListener('click', () => {
          const key = h.dataset.key;
          const dir = (sortState.key === key) ? -sortState.dir : 1;
          sortState = { key, dir };
          const getVal = getKeyExtractor(key);

          const rows = Array.from(tbody.querySelectorAll('tr'));
          rows.sort((a, b) => {
            const va = getVal(a);
            const vb = getVal(b);
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
          });

          // Re-append in new order
          rows.forEach(r => tbody.appendChild(r));
          updateSortIndicators(key, dir);
        });
      });

      // Simple search filter on title or keyword
      const search = document.getElementById('search');
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        const rows = Array.from(tbody.querySelectorAll('tr'));
        rows.forEach(r => {
          const tds = r.querySelectorAll('td');
          const title = (tds[1]?.textContent || '').toLowerCase();
          const keyword = (tds[tds.length - 1]?.textContent || '').toLowerCase();
          const match = !q || title.includes(q) || keyword.includes(q);
          r.style.display = match ? '' : 'none';
        });
      });
    })();
  </script>
</body>
</html>`;
    return html;
}

function main() {
    const csvPath = findCsvFile();
    const content = fs.readFileSync(csvPath, 'utf8');
    const { headers, rows } = parseCsvPipe(content);
    const html = buildHtml(headers, rows);
    const out = path.join(path.dirname(csvPath), path.basename(csvPath, '.csv') + '.html');
    fs.writeFileSync(out, html, 'utf8');
    console.log(`Generated HTML: ${out}`);
}

main();


