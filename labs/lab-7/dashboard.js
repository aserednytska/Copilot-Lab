(async () => {
  const root = document.querySelector('[data-aurora-dashboard]');
  if (!root) return;

  const response = await fetch('project-data.json');
  const payload = await response.json();
  const header = Object.fromEntries(payload.headers.map((name, index) => [name, index]));
  const rows = payload.projects.map((values) => ({ values: [...values] }));
  const cutoff = new Date('2026-08-14T00:00:00Z');
  let simulated = false;

  const controls = {
    department: root.querySelector('[data-filter="department"]'),
    stage: root.querySelector('[data-filter="stage"]'),
    rag: root.querySelector('[data-filter="rag"]'),
    decision: root.querySelector('[data-filter="decision"]'),
    search: root.querySelector('[data-filter="search"]')
  };

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  const value = (row, field) => row.values[header[field]];
  const euro = (number) => new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(number);

  function flags(row) {
    const found = [];
    if (!value(row, 'Project Manager')) found.push('Missing project manager');
    if (!value(row, 'RAG Status')) found.push('Missing RAG status');
    if (value(row, 'Decision Required') === 'Yes' && !value(row, 'Decision Owner')) found.push('Missing decision owner');
    if (value(row, 'RAG Status') === 'Red' && value(row, 'Decision Required') !== 'Yes') found.push('Red without decision');
    if (value(row, 'RAG Status') === 'Green' && value(row, 'Schedule Variance Days') > 30) found.push('Green despite >30-day delay');
    if (value(row, 'Forecast Cost') < 0) found.push('Invalid forecast cost');
    if (!value(row, 'Forecast Go-Live')) found.push('Missing forecast date');
    if (new Date(`${value(row, 'Last Update Date')}T00:00:00Z`) < cutoff) found.push('Stale update');
    if (value(row, 'Budget Variance') !== value(row, 'Forecast Cost') - value(row, 'Approved Budget')) found.push('Variance mismatch');
    if (value(row, 'Evidence Status') === 'Missing') found.push('Missing evidence');
    return found;
  }

  function addOptions(select, values) {
    [...new Set(values.filter(Boolean))].sort().forEach((item) => {
      const option = document.createElement('option');
      option.value = item;
      option.textContent = item;
      select.append(option);
    });
  }

  addOptions(controls.department, rows.map((row) => value(row, 'Department')));
  addOptions(controls.stage, rows.map((row) => value(row, 'Stage')));
  addOptions(controls.rag, rows.map((row) => value(row, 'RAG Status')));

  function filteredRows() {
    const query = controls.search.value.trim().toLowerCase();
    return rows.filter((row) => {
      const matchSearch = !query || `${value(row, 'Project ID')} ${value(row, 'Project Name')} ${value(row, 'Project Manager')}`.toLowerCase().includes(query);
      return matchSearch
        && (!controls.department.value || value(row, 'Department') === controls.department.value)
        && (!controls.stage.value || value(row, 'Stage') === controls.stage.value)
        && (!controls.rag.value || value(row, 'RAG Status') === controls.rag.value)
        && (!controls.decision.value || value(row, 'Decision Required') === controls.decision.value);
    });
  }

  function renderBars(target, data, colors) {
    const maximum = Math.max(1, ...data.map((item) => item.count));
    target.innerHTML = data.map((item, index) => `
      <div class="dash-bar-row">
        <span>${esc(item.label)}</span>
        <span class="dash-bar-track"><i style="width:${Math.max(3, (item.count / maximum) * 100)}%;background:${colors[index % colors.length]}"></i></span>
        <strong>${item.count}</strong>
      </div>`).join('');
  }

  function render() {
    const current = filteredRows();
    const count = (field, expected) => current.filter((row) => value(row, field) === expected).length;
    const total = current.length;
    const active = current.filter((row) => value(row, 'Stage') !== 'Live').length;
    const red = count('RAG Status', 'Red');
    const overBudget = current.filter((row) => value(row, 'Budget Variance') > 0).length;
    const late = current.filter((row) => value(row, 'Schedule Variance Days') > 0).length;
    const stale = current.filter((row) => new Date(`${value(row, 'Last Update Date')}T00:00:00Z`) < cutoff).length;
    const decisions = count('Decision Required', 'Yes');
    const quality = current.filter((row) => flags(row).length).length;

    const cards = [
      ['Projects', total, `${active} active`],
      ['Red', red, 'requires review'],
      ['Over budget', overBudget, 'reported variance > 0'],
      ['Forecast late', late, 'schedule variance > 0'],
      ['Stale updates', stale, 'older than 14 days'],
      ['Decisions', decisions, 'decision required']
    ];
    root.querySelector('[data-kpis]').innerHTML = cards.map(([label, metric, note]) => `
      <div class="dash-kpi"><span>${esc(label)}</span><strong>${metric}</strong><small>${esc(note)}</small></div>`).join('');

    const ragData = ['Red', 'Amber', 'Green', 'Not confirmed'].map((label) => ({
      label,
      count: label === 'Not confirmed' ? current.filter((row) => !value(row, 'RAG Status')).length : count('RAG Status', label)
    }));
    renderBars(root.querySelector('[data-rag-chart]'), ragData, ['#c4314b', '#f2c811', '#107c10', '#8a8886']);

    const stages = ['Discovery', 'Planning', 'Build', 'UAT', 'Live'].map((label) => ({ label, count: count('Stage', label) }));
    renderBars(root.querySelector('[data-stage-chart]'), stages, ['#0067b8', '#2b88d8', '#5ca9e6', '#7fba00', '#107c10']);

    const approved = current.reduce((sum, row) => sum + value(row, 'Approved Budget'), 0);
    const forecast = current.reduce((sum, row) => sum + value(row, 'Forecast Cost'), 0);
    const maxBudget = Math.max(1, approved, forecast);
    root.querySelector('[data-budget]').innerHTML = `
      <div class="dash-budget-line"><span>Approved</span><i style="width:${(approved / maxBudget) * 100}%"></i><strong>${euro(approved)}</strong></div>
      <div class="dash-budget-line forecast"><span>Forecast</span><i style="width:${Math.max(0, (forecast / maxBudget) * 100)}%"></i><strong>${euro(forecast)}</strong></div>`;

    root.querySelector('[data-quality]').innerHTML = `<strong>${quality} of ${total}</strong> visible records contain at least one quality warning. Financial totals include an invalid negative forecast and must not be treated as trusted.`;

    const exceptions = current
      .filter((row) => value(row, 'RAG Status') === 'Red' || value(row, 'RAG Status') === 'Amber' || flags(row).length)
      .sort((a, b) => value(b, 'Open Critical Issues') - value(a, 'Open Critical Issues') || value(b, 'Schedule Variance Days') - value(a, 'Schedule Variance Days'));

    root.querySelector('[data-exceptions]').innerHTML = exceptions.slice(0, 12).map((row) => {
      const rag = value(row, 'RAG Status') || 'Not confirmed';
      return `<tr>
        <td><a href="#dashboard-example" title="Example link only">${esc(value(row, 'Project ID'))}</a></td>
        <td><strong>${esc(value(row, 'Project Name'))}</strong><small>${esc(flags(row).join('; ') || 'No quality flag')}</small></td>
        <td><span class="rag-pill rag-${rag.toLowerCase().replace(' ', '-')}">${esc(rag)}</span></td>
        <td>${esc(value(row, 'Project Manager') || 'Not confirmed')}</td>
        <td>${euro(value(row, 'Budget Variance'))}</td>
        <td>${esc(value(row, 'Forecast Go-Live') || 'Not confirmed')}</td>
        <td>${value(row, 'Open Critical Issues')}</td>
        <td>${esc(value(row, 'Decision Required'))}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="8">No records match the current filters.</td></tr>';

    root.querySelector('[data-result-count]').textContent = `${exceptions.length} exception records`;
    root.querySelector('[data-simulation-status]').textContent = simulated
      ? 'Local example active: IT-017 now shows Red. No SharePoint data was changed.'
      : 'Example baseline: IT-017 is Amber.';
  }

  Object.values(controls).forEach((control) => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', render));
  root.querySelector('[data-reset]').addEventListener('click', () => {
    Object.values(controls).forEach((control) => { control.value = ''; });
    render();
  });
  root.querySelector('[data-simulate]').addEventListener('click', (event) => {
    const row = rows.find((item) => value(item, 'Project ID') === 'IT-017');
    simulated = !simulated;
    row.values[header['RAG Status']] = simulated ? 'Red' : 'Amber';
    event.currentTarget.textContent = simulated ? 'Restore baseline' : 'Simulate IT-017 change';
    render();
  });

  render();
})().catch((error) => {
  const root = document.querySelector('[data-aurora-dashboard]');
  if (root) root.innerHTML = `<p class="callout warning">The dashboard example could not load: ${String(error)}</p>`;
});
