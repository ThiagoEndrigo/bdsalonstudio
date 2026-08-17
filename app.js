document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const schemaSelect = document.getElementById('schemaSelect');
  const btnRunQuery = document.getElementById('btnRunQuery');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnClear = document.getElementById('btnClear');
  const btnFormat = document.getElementById('btnFormat');
  const tableSearch = document.getElementById('tableSearch');
  const tablesTree = document.getElementById('tablesTree');
  const templatesList = document.getElementById('templatesList');
  const sqlEditor = document.getElementById('sqlEditor');
  const statusBar = document.getElementById('statusBar');
  const statusBadge = document.getElementById('statusBadge');
  const statusMessage = document.getElementById('statusMessage');
  const metricRows = document.getElementById('metricRows');
  const metricTime = document.getElementById('metricTime');
  const resultsContainer = document.getElementById('resultsContainer');
  const resultMeta = document.getElementById('resultMeta');
  const sidebarTabs = document.querySelectorAll('.sidebar-tab');

  let currentQueryResult = null;
  let schemaTablesData = {};

  // Tab switching
  sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sidebarTabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sidebar-content').forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetTab = tab.getAttribute('data-tab');
      if (targetTab === 'tables') {
        document.getElementById('tabTables').classList.add('active');
      } else if (targetTab === 'templates') {
        document.getElementById('tabTemplates').classList.add('active');
      }
    });
  });

  const btnConfigApi = document.getElementById('btnConfigApi');
  const DEFAULT_RENDER_URL = 'https://bdsalonstudio.onrender.com';

  function getApiUrl(endpoint) {
    if (window.location.hostname.includes('github.io')) {
      let savedApi = localStorage.getItem('salonstudio_api_url') || DEFAULT_RENDER_URL;
      if (savedApi.startsWith('postgres') || !savedApi.startsWith('http')) {
        savedApi = DEFAULT_RENDER_URL;
        localStorage.removeItem('salonstudio_api_url');
      }
      return savedApi.replace(/\/$/, '') + endpoint;
    }
    return endpoint;
  }

  if (window.location.hostname.includes('github.io') && btnConfigApi) {
    btnConfigApi.classList.remove('hidden');
    btnConfigApi.addEventListener('click', () => {
      const current = localStorage.getItem('salonstudio_api_url') || DEFAULT_RENDER_URL;
      const input = prompt('Digite o link HTTP do seu Web Service no Render (ex: https://bdsalonstudio.onrender.com):', current);
      if (input !== null && input.trim() !== '') {
        const val = input.trim();
        if (val.startsWith('postgres')) {
          alert('⚠️ Atenção: Você colou o link do banco PostgreSQL!\n\nNo painel do Render, o link do PostgreSQL (postgresql://...) deve ser colado em "Environment Variables" com a chave DATABASE_URL.\n\nAqui no botão "API Render", você deve colar o link do seu Web Service (ex: https://bdsalonstudio.onrender.com).');
          return;
        }
        localStorage.setItem('salonstudio_api_url', val);
        alert('URL do servidor web atualizada com sucesso!');
        loadSchemas();
        loadTemplates();
      }
    });
  }

  // Load Schemas
  async function loadSchemas() {
    try {
      const res = await fetch(getApiUrl('/api/schemas'));
      const data = await res.json();
      schemaSelect.innerHTML = '';
      data.schemas.forEach(schema => {
        const option = document.createElement('option');
        option.value = schema;
        option.textContent = schema;
        if (schema === 'company_keilafrutuoso') {
          option.selected = true;
        }
        schemaSelect.appendChild(option);
      });
      loadTables();
    } catch (err) {
      console.error('Error loading schemas:', err);
    }
  }

  // Load Tables for selected schema
  async function loadTables() {
    const schema = schemaSelect.value || 'company_keilafrutuoso';
    tablesTree.innerHTML = '<div class="loading-spinner">Carregando tabelas...</div>';

    try {
      const res = await fetch(getApiUrl(`/api/tables?schema=${encodeURIComponent(schema)}`));
      const data = await res.json();
      schemaTablesData = data.tables || {};
      renderTablesTree(schemaTablesData);
    } catch (err) {
      tablesTree.innerHTML = `<div class="error-box">Erro ao carregar tabelas: ${err.message}</div>`;
    }
  }

  // Render Tables Tree
  function renderTablesTree(tablesMap, filter = '') {
    tablesTree.innerHTML = '';
    const tableNames = Object.keys(tablesMap);

    if (tableNames.length === 0) {
      tablesTree.innerHTML = '<div class="loading-spinner">Nenhuma tabela encontrada.</div>';
      return;
    }

    const filterLower = filter.toLowerCase();

    tableNames.forEach(tableName => {
      const columns = tablesMap[tableName];
      const matchesTable = tableName.toLowerCase().includes(filterLower);
      const matchingCols = columns.filter(c => c.column.toLowerCase().includes(filterLower));

      if (filter && !matchesTable && matchingCols.length === 0) {
        return;
      }

      const node = document.createElement('div');
      node.className = 'table-node' + (filter ? ' open' : '');

      const header = document.createElement('div');
      header.className = 'table-header';
      header.innerHTML = `
        <div class="table-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <span>${tableName}</span>
        </div>
        <span class="table-badge">${columns.length} colunas</span>
      `;

      // Click to toggle columns or double click to SELECT
      header.addEventListener('click', (e) => {
        node.classList.toggle('open');
      });

      header.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        sqlEditor.value = `SELECT * FROM "${tableName}" LIMIT 100;`;
        runQuery();
      });

      const colList = document.createElement('div');
      colList.className = 'column-list';

      columns.forEach(col => {
        const colDiv = document.createElement('div');
        colDiv.className = 'column-item';
        colDiv.innerHTML = `
          <span class="col-name">${col.column}</span>
          <span class="col-type">${col.type}</span>
        `;
        colList.appendChild(colDiv);
      });

      node.appendChild(header);
      node.appendChild(colList);
      tablesTree.appendChild(node);
    });
  }

  // Filter tables
  tableSearch.addEventListener('input', (e) => {
    renderTablesTree(schemaTablesData, e.target.value);
  });

  // Load Query Templates
  async function loadTemplates() {
    try {
      const res = await fetch(getApiUrl('/api/templates'));
      const data = await res.json();
      templatesList.innerHTML = '';
      data.templates.forEach(tpl => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.innerHTML = `
          <h4>${tpl.name}</h4>
          <code>${tpl.sql.split('\n')[0]}...</code>
        `;
        card.addEventListener('click', () => {
          if (tpl.schema) {
            schemaSelect.value = tpl.schema;
            loadTables();
          }
          sqlEditor.value = tpl.sql;
          runQuery();
        });
        templatesList.appendChild(card);
      });
    } catch (err) {
      console.error('Error loading templates:', err);
    }
  }

  // Run Query
  async function runQuery() {
    const sql = sqlEditor.value.trim();
    if (!sql) return;

    btnRunQuery.disabled = true;
    resultsContainer.innerHTML = '<div class="loading-spinner">Executando consulta SQL...</div>';
    statusBar.classList.remove('hidden');
    statusBadge.className = 'badge badge-success';
    statusBadge.textContent = 'EXECUTANDO';
    statusMessage.textContent = 'Aguardando resposta do banco PostgreSQL...';

    try {
      const res = await fetch(getApiUrl('/api/query'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, schema: schemaSelect.value })
      });

      const data = await res.json();
      btnRunQuery.disabled = false;

      if (!res.ok || data.error) {
        currentQueryResult = null;
        btnExportCsv.disabled = true;
        statusBadge.className = 'badge badge-error';
        statusBadge.textContent = 'ERRO';
        statusMessage.textContent = 'Falha na execução da consulta';
        metricRows.textContent = '0 linhas';
        metricTime.textContent = `${data.duration || 0} ms`;

        resultsContainer.innerHTML = `<div class="error-box">ERROR: ${escapeHtml(data.error)}\n${data.detail ? 'Detail: ' + escapeHtml(data.detail) : ''}</div>`;
        resultMeta.textContent = 'Erro ao executar';
        return;
      }

      currentQueryResult = data;

      // Normalize results to always be an array
      const resultsList = Array.isArray(data.results) 
        ? data.results 
        : (data && data.fields ? [{ command: data.command || 'SELECT', rowCount: data.rowCount, fields: data.fields, rows: data.rows || [] }] : []);

      currentQueryResult.normalizedResults = resultsList;

      const totalRows = resultsList.reduce((acc, r) => acc + (r && r.rows ? r.rows.length : 0), 0);
      const queryCount = resultsList.length;
      
      btnExportCsv.disabled = totalRows === 0;

      statusBadge.className = 'badge badge-success';
      statusBadge.textContent = 'OK';
      const firstCmd = (resultsList[0] && resultsList[0].command) ? resultsList[0].command : 'SELECT';
      statusMessage.textContent = queryCount > 1 ? `${queryCount} comandos SQL executados` : `Comando: ${firstCmd}`;
      metricRows.textContent = `${totalRows} ${totalRows === 1 ? 'linha' : 'linhas'}${queryCount > 1 ? ` em ${queryCount} consultas` : ''}`;
      metricTime.textContent = `${data.duration || 0} ms`;

      resultMeta.textContent = `${queryCount} ${queryCount === 1 ? 'consulta executada' : 'consultas executadas simultaneamente'} em ${data.duration || 0}ms (${totalRows} linhas no total)`;

      renderResults(resultsList);
    } catch (err) {
      btnRunQuery.disabled = false;
      statusBadge.className = 'badge badge-error';
      statusBadge.textContent = 'ERRO';
      statusMessage.textContent = err.message;
      resultsContainer.innerHTML = `<div class="error-box">Erro de execução: ${escapeHtml(err.message)}</div>`;
    }
  }

  // Render Query Results in Grid
  function renderResults(resultsList) {
    if (!resultsList || !Array.isArray(resultsList) || resultsList.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <p>Nenhum resultado para exibir.</p>
        </div>
      `;
      return;
    }

    let html = '';

    resultsList.forEach((res, resIdx) => {
      const showHeader = resultsList.length > 1 || Boolean(res.tableName);
      const tableLabel = res.tableName ? ` — Tabela: ${res.tableName}` : '';
      if (showHeader) {
        html += `
          <div class="multi-result-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>Consulta #${resIdx + 1}${tableLabel} (${res.command || 'SELECT'}) — ${res.rows ? res.rows.length : 0} linhas</span>
          </div>
        `;
      }

      if (!res.fields || res.fields.length === 0) {
        html += `
          <div class="empty-state" style="height: auto; padding: 16px;">
            <p>Comando '${res.command || 'OK'}' executado com sucesso. Linhas afetadas: ${res.rowCount || 0}</p>
          </div>
        `;
        return;
      }

      html += '<table class="data-table"><thead><tr>';
      html += '<th>#</th>';
      res.fields.forEach(f => {
        html += `<th>${escapeHtml(f)}</th>`;
      });
      html += '</tr></thead><tbody>';

      if (!res.rows || res.rows.length === 0) {
        html += `<tr><td colspan="${res.fields.length + 1}" class="cell-null" style="text-align: center; padding: 16px;">Nenhum registro encontrado nesta consulta.</td></tr>`;
      } else {
        res.rows.forEach((row, idx) => {
          html += `<tr><td>${idx + 1}</td>`;
          res.fields.forEach(f => {
            const val = row[f];
            if (val === null || val === undefined) {
              html += '<td class="cell-null">null</td>';
            } else if (typeof val === 'object') {
              const strVal = JSON.stringify(val);
              html += `<td class="clickable-cell" data-col="${escapeHtml(f)}" data-json="1" title="Clique para expandir o conteúdo completo">${escapeHtml(strVal)}</td>`;
            } else {
              const strVal = String(val);
              html += `<td class="clickable-cell" data-col="${escapeHtml(f)}" title="Clique para expandir o conteúdo completo">${escapeHtml(strVal)}</td>`;
            }
          });
          html += '</tr>';
        });
      }

      html += '</tbody></table>';
      if (showHeader) {
        html += '<div style="margin-bottom: 24px;"></div>';
      }
    });

    resultsContainer.innerHTML = html;
  }

  // Export CSV
  function exportCsv() {
    if (!currentQueryResult || !currentQueryResult.normalizedResults) return;

    let csvContent = '';
    const resultsList = currentQueryResult.normalizedResults;

    resultsList.forEach((res, resIdx) => {
      if (!res.rows || res.rows.length === 0 || !res.fields) return;

      if (resultsList.length > 1) {
        csvContent += `=== CONSULTA #${resIdx + 1} (${res.command || 'SELECT'}) ===\n`;
      }

      const fields = res.fields;
      csvContent += fields.join(',') + '\n';

      res.rows.forEach(row => {
        const line = fields.map(f => {
          let val = row[f];
          if (val === null || val === undefined) return '""';
          if (typeof val === 'object') val = JSON.stringify(val);
          val = String(val).replace(/"/g, '""');
          return `"${val}"`;
        }).join(',');
        csvContent += line + '\n';
      });

      csvContent += '\n';
    });

    if (!csvContent.trim()) return;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `consultas_salonstudio_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Format SQL basic helper
  function formatSql() {
    let sql = sqlEditor.value;
    const keywords = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'LIMIT', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'ON', 'AND', 'OR', 'SET', 'UPDATE', 'INSERT INTO', 'VALUES', 'HAVING'];
    keywords.forEach(kw => {
      const regex = new RegExp('\\b' + kw + '\\b', 'gi');
      sql = sql.replace(regex, '\n' + kw);
    });
    sqlEditor.value = sql.trim();
  }

  // Helper
  function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Event Listeners
  schemaSelect.addEventListener('change', loadTables);
  btnRunQuery.addEventListener('click', runQuery);
  btnExportCsv.addEventListener('click', exportCsv);
  btnClear.addEventListener('click', () => { sqlEditor.value = ''; sqlEditor.focus(); });
  btnFormat.addEventListener('click', formatSql);

  // Keyboard shortcut Ctrl+Enter
  sqlEditor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  });

  // Upload Modal elements
  const btnUploadDb = document.getElementById('btnUploadDb');
  const uploadModal = document.getElementById('uploadModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelUpload = document.getElementById('btnCancelUpload');
  const btnConfirmUpload = document.getElementById('btnConfirmUpload');
  const fileDropZone = document.getElementById('fileDropZone');
  const fileInput = document.getElementById('fileInput');
  const selectedFileInfo = document.getElementById('selectedFileInfo');
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  const fileSizeDisplay = document.getElementById('fileSizeDisplay');
  const uploadProgressContainer = document.getElementById('uploadProgressContainer');
  const uploadStatusText = document.getElementById('uploadStatusText');

  let fileToUpload = null;

  if (btnUploadDb) {
    btnUploadDb.addEventListener('click', () => {
      uploadModal.classList.remove('hidden');
      resetUploadModal();
    });

    const closeModal = () => uploadModal.classList.add('hidden');
    btnCloseModal.addEventListener('click', closeModal);
    btnCancelUpload.addEventListener('click', closeModal);

    fileDropZone.addEventListener('click', () => fileInput.click());

    fileDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileDropZone.classList.add('dragover');
    });

    fileDropZone.addEventListener('dragleave', () => fileDropZone.classList.remove('dragover'));

    fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      fileDropZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelected(e.target.files[0]);
      }
    });

    function handleFileSelected(file) {
      if (!file.name.toLowerCase().endsWith('.sql')) {
        alert('Por favor, selecione apenas arquivos com extensão .sql');
        return;
      }
      fileToUpload = file;
      fileNameDisplay.textContent = file.name;
      fileSizeDisplay.textContent = `(${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
      selectedFileInfo.classList.remove('hidden');
      btnConfirmUpload.disabled = false;
    }

    function resetUploadModal() {
      fileToUpload = null;
      fileInput.value = '';
      selectedFileInfo.classList.add('hidden');
      uploadProgressContainer.classList.add('hidden');
      btnConfirmUpload.disabled = true;
      btnConfirmUpload.textContent = 'Importar Banco';
    }

    btnConfirmUpload.addEventListener('click', async () => {
      if (!fileToUpload) return;

      btnConfirmUpload.disabled = true;
      btnCancelUpload.disabled = true;
      uploadProgressContainer.classList.remove('hidden');
      uploadStatusText.textContent = `Enviando e importando '${fileToUpload.name}' para o PostgreSQL...`;

      const formData = new FormData();
      formData.append('sqlFile', fileToUpload);

      try {
        const res = await fetch(getApiUrl('/api/upload'), {
          method: 'POST',
          body: formData
        });
        const data = await res.json();

        btnCancelUpload.disabled = false;
        if (!res.ok || data.error) {
          alert('Erro ao importar banco: ' + (data.error || data.details || 'Falha na requisição'));
          uploadProgressContainer.classList.add('hidden');
          btnConfirmUpload.disabled = false;
          return;
        }

        uploadStatusText.textContent = data.message || 'Importação concluída com sucesso!';
        setTimeout(() => {
          uploadModal.classList.add('hidden');
          loadSchemas();
        }, 1200);
      } catch (err) {
        btnCancelUpload.disabled = false;
        btnConfirmUpload.disabled = false;
        alert('Erro de conexão ao carregar banco: ' + err.message);
        uploadProgressContainer.classList.add('hidden');
      }
    });
  }

  // Theme Toggle logic
  const btnToggleTheme = document.getElementById('btnToggleTheme');
  const themeIconSun = document.getElementById('themeIconSun');
  const themeIconMoon = document.getElementById('themeIconMoon');
  const themeLabel = document.getElementById('themeLabel');

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('salonstudio_theme', theme);
    if (theme === 'light') {
      if (themeIconSun) themeIconSun.classList.remove('hidden');
      if (themeIconMoon) themeIconMoon.classList.add('hidden');
      if (themeLabel) themeLabel.textContent = 'Modo Escuro';
    } else {
      if (themeIconSun) themeIconSun.classList.add('hidden');
      if (themeIconMoon) themeIconMoon.classList.remove('hidden');
      if (themeLabel) themeLabel.textContent = 'Modo Claro';
    }
  }

  const savedTheme = localStorage.getItem('salonstudio_theme') || 'dark';
  setTheme(savedTheme);

  if (btnToggleTheme) {
    btnToggleTheme.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
    });
  }

  // Cell Detail Modal & Wrap Text logic
  const btnToggleWrap = document.getElementById('btnToggleWrap');
  const cellDetailModal = document.getElementById('cellDetailModal');
  const btnCloseCellModal = document.getElementById('btnCloseCellModal');
  const btnCloseCellModalFooter = document.getElementById('btnCloseCellModalFooter');
  const btnCopyCellContent = document.getElementById('btnCopyCellContent');
  const cellModalColName = document.getElementById('cellModalColName');
  const cellModalType = document.getElementById('cellModalType');
  const cellDetailText = document.getElementById('cellDetailText');

  if (btnToggleWrap) {
    btnToggleWrap.addEventListener('click', () => {
      resultsContainer.classList.toggle('wrap-cells');
      btnToggleWrap.classList.toggle('active');
    });
  }

  const closeCellModal = () => {
    if (cellDetailModal) cellDetailModal.classList.add('hidden');
  };
  if (btnCloseCellModal) btnCloseCellModal.addEventListener('click', closeCellModal);
  if (btnCloseCellModalFooter) btnCloseCellModalFooter.addEventListener('click', closeCellModal);

  if (resultsContainer) {
    resultsContainer.addEventListener('click', (e) => {
      const cell = e.target.closest('.clickable-cell');
      if (!cell) return;

      const col = cell.getAttribute('data-col') || 'Coluna';
      const isJson = cell.getAttribute('data-json') === '1';
      const rawText = cell.innerText || cell.textContent;

      if (cellModalColName) cellModalColName.textContent = `Coluna: ${col}`;
      
      let displayText = rawText;
      if (isJson) {
        try {
          const parsed = JSON.parse(rawText);
          displayText = JSON.stringify(parsed, null, 2);
          if (cellModalType) cellModalType.textContent = 'JSON Formatado';
        } catch (err) {
          if (cellModalType) cellModalType.textContent = 'Texto (' + rawText.length + ' caracteres)';
        }
      } else {
        if (cellModalType) cellModalType.textContent = 'Texto (' + rawText.length + ' caracteres)';
      }

      if (cellDetailText) cellDetailText.textContent = displayText;
      if (cellDetailModal) cellDetailModal.classList.remove('hidden');
    });
  }

  if (btnCopyCellContent) {
    btnCopyCellContent.addEventListener('click', () => {
      if (!cellDetailText) return;
      navigator.clipboard.writeText(cellDetailText.textContent).then(() => {
        const origText = btnCopyCellContent.innerHTML;
        btnCopyCellContent.textContent = 'Copiado!';
        setTimeout(() => btnCopyCellContent.innerHTML = origText, 1500);
      });
    });
  }

  // Initial Load
  loadSchemas();
  loadTemplates();
});
