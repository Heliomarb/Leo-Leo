// ============ ARQUITETURA DE DADOS ============
let S = {
  config: {
    diesel: 6.00, media: 2.5, arla: 0.15, manut: 0.50, kmMes: 10000,
    impostos: { percentual: 6 },
    fixos: [
      { n: 'Seguro / Rastreamento', v: 1800 },
      { n: 'IPVA / Licenciamento', v: 800 }
    ]
  },
  fretes: [],
  caminhoes: [],
  motoristas: [],
  manutencoes: [],
  financiamentos: [],
  clientes: [],
  combustiveis: [],
  pneus: [],
  contasPagar: [],
  pagamentosMotoristas: []
};

const STORAGE_KEY = 'erp_leo_leo_v2';
const Store = {
  load() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  },
  save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
};

let charts = {};

function ensureStateShape() {
  S.config = { diesel: 6, media: 2.5, arla: 0.15, manut: 0.50, kmMes: 10000, impostos: { percentual: 6 }, fixos: [], ...(S.config || {}) };
  S.config.impostos = { percentual: 6, ...(S.config.impostos || {}) };
  S.config.fixos = S.config.fixos || [];
  ['fretes','caminhoes','motoristas','manutencoes','financiamentos','clientes','combustiveis','pneus','contasPagar','pagamentosMotoristas'].forEach(k => {
    if (!Array.isArray(S[k])) S[k] = [];
  });
  S.financiamentos = S.financiamentos.map(f => ({ caminhaoId: '', ...f }));
  S.caminhoes = S.caminhoes.map(c => ({ ativo: true, motoristaId: '', consumoMedio: 0, quilometragem: 0, ...c }));
  S.clientes = S.clientes.map(c => ({ ativo: true, ...c }));
  S.motoristas = S.motoristas.map(m => ({ ativo: true, regraKm: 0, regraViagem: 0, regraLucro: 0, ...m }));
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function fmtMoney(v, digits = 2) {
  return 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function dateFromInput(value) {
  return value ? new Date(value + 'T00:00:00') : new Date('');
}

function isSameMonth(value, mes, ano) {
  const d = dateFromInput(value);
  return !Number.isNaN(d.getTime()) && d.getMonth() === mes && d.getFullYear() === ano;
}

function monthOptions(selectedMonth = new Date().getMonth()) {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return meses.map((m, i) => `<option value="${i}" ${i === selectedMonth ? 'selected' : ''}>${m}</option>`).join('');
}

function yearOptions(selectedYear = new Date().getFullYear()) {
  const anos = [];
  for (let y = selectedYear + 1; y >= selectedYear - 4; y--) anos.push(y);
  return anos.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`).join('');
}

// ============ INICIALIZAÇÃO ============
window.onload = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = Store.load();
      S = { ...S, ...parsed };
      ensureStateShape();
    } catch (e) { console.error('Erro ao carregar:', e); }
  }
  // Migrar de versão antiga (v1)
  const oldSaved = localStorage.getItem('erp_leo_leo_v1');
  if (oldSaved && !saved) {
    try {
      const old = JSON.parse(oldSaved);
      S = { ...S, ...old };
      S.motoristas = [];
      ensureStateShape();
      toast('Dados migrados da versão anterior!', 'success');
      save();
    } catch(e) {}
  }
  ensureStateShape();
  preencherFiltrosDRE();
  preencherFiltrosFolha();
  atualizarSelects();
  renderAll();
  updDash();
  document.getElementById('f-data-emissao').valueAsDate = new Date();
  ['comb-data','pneu-data','man-data','pag-venc'].forEach(id => {
    const input = document.getElementById(id);
    if (input && !input.value) input.valueAsDate = new Date();
  });
};

function save() { Store.save(S); }

// ============ TOAST NOTIFICATIONS ============
function toast(msg, tipo = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  const icons = { success: 'ti-circle-check', error: 'ti-circle-x', warning: 'ti-alert-triangle' };
  t.innerHTML = `<i class="ti ${icons[tipo]||'ti-info-circle'}"></i><span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ============ MODAL ============
function openModal(titulo, html, footerHtml = '') {
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">${titulo}</span>
          <button class="btn-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">${html}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    </div>`;
}
function closeModal() { document.getElementById('modal-container').innerHTML = ''; }

function confirmAction(msg, callback) {
  openModal('Confirmar Ação', `<p style="font-size:.9rem">${msg}</p>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-danger" onclick="closeModal();(${callback.toString()})()">Confirmar</button>`);
}

// ============ MÁSCARAS ============
function maskCPF(el) {
  let v = el.value.replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
  v = v.replace(/\.(\d{3})(\d)/, '.$1-$2');
  el.value = v;
}
function maskTel(el) {
  let v = el.value.replace(/\D/g, '');
  if (v.length > 11) v = v.slice(0, 11);
  if (v.length <= 10) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  else v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  el.value = v;
}

// ============ NAVEGAÇÃO ============
function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + id);
  if (pg) pg.classList.add('active');
  if (el) el.classList.add('active');
  const titles = {
    dashboard: 'Dashboard Executivo', fretes: 'Gestão de Fretes', frota: 'Gestão de Frota',
    motoristas: 'Motoristas', manutencao: 'Manutenção', receber: 'Contas a Receber',
    pagar: 'Contas a Pagar', folha: 'Folha de Motoristas',
    combustivel: 'Controle de Combustível', pneus: 'Controle de Pneus',
    fluxo: 'Fluxo de Caixa', financiamento: 'Financiamentos', previsao: 'Previsão Financeira',
    clientes: 'Clientes', custos: 'Custos Operacionais', agente: 'Assistente IA',
    'rank-clientes': 'Ranking de Clientes', 'rank-rotas': 'Rentabilidade de Rotas',
    'desempenho-frota': 'Desempenho da Frota', backup: 'Backup / Dados'
  };
  document.getElementById('page-title').textContent = titles[id] || id;
  if (id === 'rank-clientes') renderRankClientes();
  if (id === 'rank-rotas') renderRankRotas();
  if (id === 'desempenho-frota') renderDesempenhoFrota();
  if (id === 'manutencao') renderManutencaoStats();
  if (id === 'combustivel') renderCombustivel();
  if (id === 'pneus') renderPneus();
  if (id === 'fluxo') { renderDREPage(); renderFluxo(); }
  if (id === 'previsao') renderPrevisao();
  if (id === 'receber') renderReceber();
  if (id === 'pagar') renderContasPagar();
  if (id === 'folha') renderFolhaMotoristas();
  updDash();
}

// ============ CUSTOS OPERACIONAIS ============
function calcCustos() {
  S.config.diesel = parseFloat(document.getElementById('c-diesel').value) || 0;
  S.config.media = parseFloat(document.getElementById('c-media').value) || 1;
  S.config.arla = parseFloat(document.getElementById('c-arla').value) || 0;
  S.config.manut = parseFloat(document.getElementById('c-manut').value) || 0;
  S.config.kmMes = parseFloat(document.getElementById('c-km-mes').value) || 1;
  S.config.impostos = { percentual: parseFloat(document.getElementById('c-impostos').value) || 0 };
  save();
}

function addFixedCost() { S.config.fixos.push({ n: 'Novo Custo', v: 0 }); renderFixedCosts(); }

function renderFixedCosts() {
  const container = document.getElementById('fixed-costs-list');
  if (!container) return;
  container.innerHTML = S.config.fixos.map((f, i) => `
    <div style="display:grid;grid-template-columns:1fr 130px 40px;gap:8px;margin-bottom:8px">
      <input class="form-control" value="${f.n}" onchange="S.config.fixos[${i}].n=this.value;save()">
      <input type="number" class="form-control" value="${f.v}" onchange="S.config.fixos[${i}].v=parseFloat(this.value)||0;save()">
      <button class="btn btn-danger btn-sm" onclick="S.config.fixos.splice(${i},1);renderFixedCosts();save()"><i class="ti ti-trash"></i></button>
    </div>`).join('');
}

// ============ CÁLCULO DO MOTORISTA ============
function calcCustoMotorista(motorista, kmT, valB) {
  if (!motorista) return 0;
  let cMot = 0;
  if (motorista.tipo === 'fixo') {
    cMot = (motorista.salario / S.config.kmMes) * kmT;
  } else if (motorista.tipo === 'comissao') {
    cMot = valB * (motorista.comissao / 100);
  } else if (motorista.tipo === 'misto') {
    const cFixo = (motorista.salario / S.config.kmMes) * kmT;
    const cComis = valB * (motorista.comissao / 100);
    cMot = cFixo + cComis;
  }
  return cMot + (motorista.regraViagem || 0) + (kmT * (motorista.regraKm || 0));
}

// ============ CÁLCULO DO FINANCIAMENTO POR CAMINHÃO ============
function calcCustoFinanciamento(caminhaoId, kmT) {
  // Financiamentos do caminhão específico
  const finCam = S.financiamentos.filter(f => f.caminhaoId && f.caminhaoId == caminhaoId);
  const finGeral = S.financiamentos.filter(f => !f.caminhaoId);
  
  const totalCam = finCam.reduce((a, b) => a + b.parcela, 0);
  const totalGeral = finGeral.reduce((a, b) => a + b.parcela, 0);
  
  const cFinGeral = (totalGeral / S.config.kmMes) * kmT;
  const cFinCamKm = (totalCam / S.config.kmMes) * kmT;
  
  return cFinCamKm + cFinGeral;
}

function calcularResultadoFrete({ kmC = 0, kmVC = 0, kmVD = 0, valorBruto = 0, pedagio = 0, comissaoPct = 0, motoristaId = '', caminhaoId = '' }) {
  const kmT = kmC + kmVC + kmVD;
  const motorista = S.motoristas.find(m => m.id == motoristaId);
  const custoDiesel = S.config.media > 0 ? (kmT * S.config.diesel) / S.config.media : 0;
  const custoVariavel = kmT * (S.config.arla + S.config.manut);
  const totalFixos = S.config.fixos.reduce((a, b) => a + (b.v || 0), 0);
  const custoFixo = S.config.kmMes > 0 ? (totalFixos / S.config.kmMes) * kmT : 0;
  const custoFinanc = calcCustoFinanciamento(caminhaoId, kmT);
  const custoMotorista = calcCustoMotorista(motorista, kmT, valorBruto);
  const comissao = valorBruto * (comissaoPct / 100);
  const impostos = valorBruto * ((S.config.impostos?.percentual || 0) / 100);
  const custoTotal = custoDiesel + custoVariavel + custoFixo + custoFinanc + custoMotorista + comissao + impostos + pedagio;
  const lucroLiquido = valorBruto - custoTotal;
  const receitaLiquida = valorBruto - comissao - impostos - pedagio;
  const margem = valorBruto > 0 ? (lucroLiquido / valorBruto) * 100 : 0;
  return { kmT, custoDiesel, custoVariavel, custoFixo, custoFinanc, custoMotorista, comissao, impostos, custoTotal, lucroLiquido, receitaLiquida, margem };
}

// ============ GESTÃO DE FRETES ============
function previewFrete() {
  const kmC = parseFloat(document.getElementById('f-km').value) || 0;
  const kmVC = parseFloat(document.getElementById('f-vazio-coleta').value) || 0;
  const kmVD = parseFloat(document.getElementById('f-vazio-descarga').value) || 0;
  const valB = parseFloat(document.getElementById('f-valor').value) || 0;
  const ped = parseFloat(document.getElementById('f-ped').value) || 0;
  const comPct = parseFloat(document.getElementById('f-comissao-pct').value) || 0;
  
  if (!kmC || !valB) { document.getElementById('f-preview').style.display = 'none'; document.getElementById('f-indicadores').style.display = 'none'; return; }
  
  const motId = document.getElementById('f-motorista').value;
  const camId = document.getElementById('f-caminhao').value;
  const r = calcularResultadoFrete({ kmC, kmVC, kmVD, valorBruto: valB, pedagio: ped, comissaoPct: comPct, motoristaId: motId, caminhaoId: camId });
  
  const box = document.getElementById('f-preview');
  box.style.display = 'block';
  box.className = 'alert ' + (r.margem > 20 ? 'alert-info' : r.margem > 0 ? 'alert-warning' : 'alert-danger');
  box.innerHTML = `<div><strong>Prévia do Resultado:</strong><br>
    Diesel: ${fmtMoney(r.custoDiesel)} | Motorista: ${fmtMoney(r.custoMotorista)} | Financ: ${fmtMoney(r.custoFinanc)}<br>
    Receita Líquida: ${fmtMoney(r.receitaLiquida)}<br>
    Lucro Real: <strong style="color:${r.lucroLiquido > 0 ? 'var(--success)' : 'var(--danger)'}">${fmtMoney(r.lucroLiquido)}</strong> | Margem: <strong>${r.margem.toFixed(1)}%</strong></div>`;
  
  document.getElementById('f-indicadores').style.display = 'block';
  document.getElementById('fi-rec-km').textContent = 'R$ ' + (kmC > 0 ? (valB / kmC).toFixed(2) : 0);
  document.getElementById('fi-custo-km').textContent = 'R$ ' + (r.kmT > 0 ? (r.custoTotal / r.kmT).toFixed(2) : 0);
  document.getElementById('fi-lucro-km').textContent = 'R$ ' + (kmC > 0 ? (r.lucroLiquido / kmC).toFixed(2) : 0);
  const cor = r.margem > 20 ? 'var(--success)' : r.margem > 0 ? 'var(--warning)' : 'var(--danger)';
  document.getElementById('fi-margem').innerHTML = `<span style="color:${cor}">${r.margem.toFixed(1)}%</span>`;
}

function salvarFrete() {
  const cliId = document.getElementById('f-cliente').value;
  const camId = document.getElementById('f-caminhao').value;
  const motId = document.getElementById('f-motorista').value;
  const valB = parseFloat(document.getElementById('f-valor').value) || 0;
  
  if (!cliId || !camId || !valB) { toast('Preencha cliente, caminhão e valor!', 'error'); return; }
  
  const kmC = parseFloat(document.getElementById('f-km').value) || 0;
  const kmVC = parseFloat(document.getElementById('f-vazio-coleta').value) || 0;
  const kmVD = parseFloat(document.getElementById('f-vazio-descarga').value) || 0;
  const ped = parseFloat(document.getElementById('f-ped').value) || 0;
  const comPct = parseFloat(document.getElementById('f-comissao-pct').value) || 0;
  const r = calcularResultadoFrete({ kmC, kmVC, kmVD, valorBruto: valB, pedagio: ped, comissaoPct: comPct, motoristaId: motId, caminhaoId: camId });
  
  const editId = document.getElementById('f-edit-id').value;
  const novoFrete = {
    id: editId ? parseInt(editId) : Date.now(),
    clienteId: cliId, caminhaoId: camId, motoristaId: motId,
    origem: document.getElementById('f-origem').value,
    destino: document.getElementById('f-destino').value,
    kmC, kmVC, kmVD, kmT: r.kmT,
    valorBruto: valB, pedagio: ped,
    comissao: r.comissao, comissaoPct: comPct,
    impostos: r.impostos, custoDiesel: r.custoDiesel,
    custoVariavel: r.custoVariavel, custoFixo: r.custoFixo,
    custoFinanc: r.custoFinanc, custoMotorista: r.custoMotorista,
    custoTotal: r.custoTotal, lucroLiquido: r.lucroLiquido,
    statusReceb: document.getElementById('f-status-receb').value,
    dataEmissao: document.getElementById('f-data-emissao').value,
    dataVenc: document.getElementById('f-data-venc').value,
    nf: document.getElementById('f-nf').value,
    dataRecebimento: '', formaPagamento: '', obs: ''
  };
  
  if (editId) {
    const idx = S.fretes.findIndex(f => f.id == editId);
    if (idx !== -1) S.fretes[idx] = novoFrete;
  } else {
    S.fretes.unshift(novoFrete);
  }
  
  save(); renderFretes(); updDash();
  toast(editId ? 'Frete atualizado!' : 'Frete salvo com sucesso!', 'success');
  limparFrete();
}

function limparFrete() {
  ['f-cliente','f-motorista','f-caminhao','f-status-receb','f-origem','f-destino','f-nf'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.tagName === 'INPUT') el.value = '';
  });
  ['f-km','f-vazio-coleta','f-vazio-descarga','f-valor','f-ped','f-comissao-pct'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = id === 'f-vazio-coleta' || id === 'f-vazio-descarga' || id === 'f-comissao-pct' || id === 'f-ped' ? '0' : '';
  });
  document.getElementById('f-edit-id').value = '';
  document.getElementById('f-preview').style.display = 'none';
  document.getElementById('f-indicadores').style.display = 'none';
  document.getElementById('f-data-emissao').valueAsDate = new Date();
}

function editarFrete(id) {
  const f = S.fretes.find(x => x.id == id);
  if (!f) return;
  showPage('fretes', document.querySelector('[onclick*="fretes"]'));
  document.getElementById('f-edit-id').value = f.id;
  document.getElementById('f-cliente').value = f.clienteId;
  document.getElementById('f-motorista').value = f.motoristaId || '';
  document.getElementById('f-caminhao').value = f.caminhaoId;
  document.getElementById('f-origem').value = f.origem;
  document.getElementById('f-destino').value = f.destino;
  document.getElementById('f-km').value = f.kmC;
  document.getElementById('f-vazio-coleta').value = f.kmVC;
  document.getElementById('f-vazio-descarga').value = f.kmVD;
  document.getElementById('f-valor').value = f.valorBruto;
  document.getElementById('f-ped').value = f.pedagio;
  document.getElementById('f-comissao-pct').value = f.comissaoPct || 0;
  document.getElementById('f-status-receb').value = f.statusReceb;
  document.getElementById('f-data-emissao').value = f.dataEmissao;
  document.getElementById('f-data-venc').value = f.dataVenc;
  document.getElementById('f-nf').value = f.nf || '';
  previewFrete();
  window.scrollTo(0, 0);
  toast('Frete carregado para edição', 'warning');
}

function excluirFrete(id) {
  confirmAction('Tem certeza que deseja excluir este frete?', () => {
    S.fretes = S.fretes.filter(f => f.id != id);
    save(); renderFretes(); updDash();
    toast('Frete excluído', 'warning');
  });
}

function baixarFrete(id) {
  const f = S.fretes.find(x => x.id == id);
  if (!f) return;
  openModal('Baixar Recebimento', `
    <div class="form-group"><label class="form-label">Data do Recebimento</label><input type="date" id="br-data" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
    <div class="form-group"><label class="form-label">Forma de Pagamento</label>
      <select id="br-forma" class="form-control">
        <option>PIX</option><option>Transferência</option><option>Boleto</option><option>Cheque</option><option>Dinheiro</option>
      </select>
    </div>
    <div class="form-group"><label class="form-label">Observações</label><input type="text" id="br-obs" class="form-control" placeholder="Opcional"></div>`,
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-success" onclick="confirmarBaixa(${id})"><i class="ti ti-check"></i> Confirmar Recebimento</button>`);
}

function confirmarBaixa(id) {
  const f = S.fretes.find(x => x.id == id);
  if (!f) return;
  f.statusReceb = 'Recebido';
  f.dataRecebimento = document.getElementById('br-data').value;
  f.formaPagamento = document.getElementById('br-forma').value;
  f.obs = document.getElementById('br-obs').value;
  save(); renderFretes(); updDash(); closeModal();
  toast('Recebimento confirmado!', 'success');
}

// ============ RENDER FRETES ============
function renderFretes() {
  const list = document.getElementById('fretes-lista');
  if (!list) return;
  const filtro = document.getElementById('filtro-status-frete') ? document.getElementById('filtro-status-frete').value : '';
  let fretes = S.fretes;
  if (filtro) fretes = fretes.filter(f => f.statusReceb === filtro);
  
  if (!fretes.length) { list.innerHTML = '<div class="empty-st"><i class="ti ti-clipboard-list"></i>Nenhum frete registrado.</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>Cliente / Rota</th><th>Motorista</th><th>Caminhão</th><th>Valor Bruto</th><th>Lucro Líq.</th><th>Status</th><th>Emissão</th><th>Ações</th></tr></thead><tbody>` +
    fretes.map(f => {
      const cli = S.clientes.find(c => c.id == f.clienteId);
      const mot = S.motoristas.find(m => m.id == f.motoristaId);
      const cam = S.caminhoes.find(c => c.id == f.caminhaoId);
      const badge = {Recebido:'badge-success',Pendente:'badge-warning',Atrasado:'badge-danger',Faturado:'badge-info'}[f.statusReceb]||'badge-muted';
      return `<tr>
        <td><strong>${escapeHTML(cli ? cli.nome : 'N/A')}</strong><br><small style="color:var(--muted)">${escapeHTML(f.origem||'')} → ${escapeHTML(f.destino||'')}</small></td>
        <td><small>${escapeHTML(mot ? mot.nome : '—')}</small></td>
        <td><small>${escapeHTML(cam ? cam.placa : '—')}</small></td>
        <td>R$ ${(f.valorBruto||0).toFixed(2)}</td>
        <td style="color:${(f.lucroLiquido||0) > 0 ? 'var(--success)' : 'var(--danger)'}"><strong>R$ ${(f.lucroLiquido||0).toFixed(2)}</strong></td>
        <td><span class="badge ${badge}">${f.statusReceb}</span></td>
        <td><small>${f.dataEmissao||''}</small></td>
        <td style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" onclick="editarFrete(${f.id})"><i class="ti ti-pencil"></i></button>
          ${f.statusReceb !== 'Recebido' ? `<button class="btn btn-success btn-sm" onclick="baixarFrete(${f.id})"><i class="ti ti-check"></i></button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="excluirFrete(${f.id})"><i class="ti ti-trash"></i></button>
        </td></tr>`;
    }).join('') + '</tbody></table>';
  renderReceber();
}

// ============ MOTORISTAS ============
function toggleMotoristaForm() {
  const tipo = document.getElementById('mot-tipo').value;
  document.getElementById('mot-salario-div').style.display = (tipo === 'fixo' || tipo === 'misto') ? 'block' : 'none';
  document.getElementById('mot-comissao-div').style.display = (tipo === 'comissao' || tipo === 'misto') ? 'block' : 'none';
}

function salvarMotorista() {
  const nome = document.getElementById('mot-nome').value.trim();
  if (!nome) { toast('Nome obrigatório!', 'error'); return; }
  const editId = document.getElementById('mot-edit-id').value;
  const mot = {
    id: editId ? parseInt(editId) : Date.now(),
    nome, cpf: document.getElementById('mot-cpf').value,
    telefone: document.getElementById('mot-tel').value,
    tipo: document.getElementById('mot-tipo').value,
    salario: parseFloat(document.getElementById('mot-salario').value) || 0,
    comissao: parseFloat(document.getElementById('mot-comissao').value) || 0,
    regraViagem: parseFloat(document.getElementById('mot-regra-viagem').value) || 0,
    regraKm: parseFloat(document.getElementById('mot-regra-km').value) || 0,
    regraLucro: parseFloat(document.getElementById('mot-regra-lucro').value) || 0,
    admissao: document.getElementById('mot-admissao').value,
    obs: document.getElementById('mot-obs').value,
    ativo: true
  };
  if (editId) {
    const idx = S.motoristas.findIndex(m => m.id == editId);
    if (idx !== -1) { mot.ativo = S.motoristas[idx].ativo; S.motoristas[idx] = mot; }
  } else {
    S.motoristas.push(mot);
  }
  save(); renderMotoristas(); atualizarSelects();
  toast(editId ? 'Motorista atualizado!' : 'Motorista cadastrado!', 'success');
  limparMotorista();
}

function limparMotorista() {
  ['mot-nome','mot-cpf','mot-tel','mot-obs','mot-admissao'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('mot-salario').value = 0;
  document.getElementById('mot-comissao').value = 0;
  document.getElementById('mot-regra-viagem').value = 0;
  document.getElementById('mot-regra-km').value = 0;
  document.getElementById('mot-regra-lucro').value = 0;
  document.getElementById('mot-tipo').value = 'fixo';
  document.getElementById('mot-edit-id').value = '';
  toggleMotoristaForm();
}

function editarMotorista(id) {
  const m = S.motoristas.find(x => x.id == id);
  if (!m) return;
  document.getElementById('mot-edit-id').value = m.id;
  document.getElementById('mot-nome').value = m.nome;
  document.getElementById('mot-cpf').value = m.cpf || '';
  document.getElementById('mot-tel').value = m.telefone || '';
  document.getElementById('mot-tipo').value = m.tipo;
  document.getElementById('mot-salario').value = m.salario || 0;
  document.getElementById('mot-comissao').value = m.comissao || 0;
  document.getElementById('mot-regra-viagem').value = m.regraViagem || 0;
  document.getElementById('mot-regra-km').value = m.regraKm || 0;
  document.getElementById('mot-regra-lucro').value = m.regraLucro || 0;
  document.getElementById('mot-admissao').value = m.admissao || '';
  document.getElementById('mot-obs').value = m.obs || '';
  toggleMotoristaForm();
  toast('Motorista carregado para edição', 'warning');
}

function inativarMotorista(id) {
  const m = S.motoristas.find(x => x.id == id);
  if (!m) return;
  const acao = m.ativo ? 'inativar' : 'reativar';
  confirmAction(`Deseja ${acao} o motorista <strong>${m.nome}</strong>?`, () => {
    m.ativo = !m.ativo;
    save(); renderMotoristas(); atualizarSelects();
    toast(`Motorista ${m.ativo ? 'reativado' : 'inativado'}`, 'success');
  });
}

function renderMotoristas() {
  const list = document.getElementById('motoristas-lista');
  if (!list) return;
  const showInativos = document.getElementById('mot-show-inativos') ? document.getElementById('mot-show-inativos').checked : false;
  let mots = showInativos ? S.motoristas : S.motoristas.filter(m => m.ativo !== false);
  if (!mots.length) { list.innerHTML = '<div class="empty-st"><i class="ti ti-id-badge-2"></i>Nenhum motorista cadastrado.</div>'; return; }
  const tipoLabel = { fixo: 'Salário Fixo', comissao: 'Comissão', misto: 'Misto' };
  list.innerHTML = `<table><thead><tr><th>Nome</th><th>CPF</th><th>Telefone</th><th>Tipo</th><th>Remuneração</th><th>Regras Extras</th><th>Status</th><th>Ações</th></tr></thead><tbody>` +
    mots.map(m => {
      const remunLabel = m.tipo === 'fixo' ? `R$ ${(m.salario||0).toFixed(2)}/mês` : m.tipo === 'comissao' ? `${m.comissao||0}% frete` : `R$ ${(m.salario||0).toFixed(2)} + ${m.comissao||0}%`;
      const regras = [`Viagem: ${fmtMoney(m.regraViagem || 0)}`, `KM: ${fmtMoney(m.regraKm || 0, 3)}`, `Lucro: ${m.regraLucro || 0}%`].join(' | ');
      return `<tr style="${!m.ativo ? 'opacity:.5' : ''}">
        <td><strong>${escapeHTML(m.nome)}</strong></td>
        <td><small>${escapeHTML(m.cpf||'—')}</small></td>
        <td><small>${escapeHTML(m.telefone||'—')}</small></td>
        <td><span class="badge badge-info">${tipoLabel[m.tipo]||m.tipo}</span></td>
        <td><small>${remunLabel}</small></td>
        <td><small>${regras}</small></td>
        <td><span class="badge ${m.ativo !== false ? 'badge-success' : 'badge-danger'}">${m.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
        <td style="display:flex;gap:4px">
          <button class="btn btn-outline btn-sm" onclick="editarMotorista(${m.id})"><i class="ti ti-pencil"></i></button>
          <button class="btn btn-warning btn-sm" onclick="inativarMotorista(${m.id})"><i class="ti ti-${m.ativo !== false ? 'user-off' : 'user-check'}"></i></button>
        </td>
      </tr>`;
    }).join('') + '</tbody></table>';
}

// ============ GESTÃO DE FROTA ============
function salvarCaminhao() {
  const placa = document.getElementById('cam-placa').value.trim();
  if (!placa) { toast('Placa obrigatória!', 'error'); return; }
  const editId = document.getElementById('cam-edit-id').value;
  const cam = {
    id: editId ? parseInt(editId) : Date.now(),
    placa, modelo: document.getElementById('cam-modelo').value,
    ano: document.getElementById('cam-ano').value,
    capacidade: document.getElementById('cam-capacidade').value,
    motoristaId: document.getElementById('cam-motorista').value,
    ativo: true
  };
  if (editId) {
    const idx = S.caminhoes.findIndex(c => c.id == editId);
    if (idx !== -1) { cam.ativo = S.caminhoes[idx].ativo; S.caminhoes[idx] = cam; }
  } else {
    S.caminhoes.push(cam);
  }
  save(); renderCaminhoes(); atualizarSelects();
  toast(editId ? 'Veículo atualizado!' : 'Veículo cadastrado!', 'success');
  limparCaminhao();
}

function limparCaminhao() {
  ['cam-placa','cam-modelo','cam-ano','cam-capacidade'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('cam-motorista').value = '';
  document.getElementById('cam-edit-id').value = '';
}

function editarCaminhao(id) {
  const c = S.caminhoes.find(x => x.id == id);
  if (!c) return;
  document.getElementById('cam-edit-id').value = c.id;
  document.getElementById('cam-placa').value = c.placa;
  document.getElementById('cam-modelo').value = c.modelo;
  document.getElementById('cam-ano').value = c.ano;
  document.getElementById('cam-capacidade').value = c.capacidade;
  document.getElementById('cam-motorista').value = c.motoristaId || '';
  toast('Veículo carregado para edição', 'warning');
}

function inativarCaminhao(id) {
  const c = S.caminhoes.find(x => x.id == id);
  if (!c) return;
  confirmAction(`Deseja ${c.ativo !== false ? 'inativar' : 'reativar'} o veículo <strong>${c.placa}</strong>?`, () => {
    c.ativo = !(c.ativo !== false);
    save(); renderCaminhoes(); atualizarSelects();
    toast(`Veículo ${c.ativo ? 'reativado' : 'inativado'}`, 'success');
  });
}

function renderCaminhoes() {
  const list = document.getElementById('caminhoes-lista');
  if (!list) return;
  if (!S.caminhoes.length) { list.innerHTML = '<div class="empty-st"><i class="ti ti-truck"></i>Nenhum veículo cadastrado.</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>Placa</th><th>Modelo</th><th>Ano</th><th>Cap.</th><th>Motorista</th><th>Status</th><th>Ações</th></tr></thead><tbody>` +
    S.caminhoes.map(c => {
      const mot = S.motoristas.find(m => m.id == c.motoristaId);
      return `<tr style="${c.ativo === false ? 'opacity:.5' : ''}">
        <td><strong>${escapeHTML(c.placa)}</strong></td><td>${escapeHTML(c.modelo)}</td><td>${escapeHTML(c.ano)}</td><td>${escapeHTML(c.capacidade)}t</td>
        <td>${mot ? escapeHTML(mot.nome) : '<span style="color:var(--muted)">—</span>'}</td>
        <td><span class="badge ${c.ativo !== false ? 'badge-success' : 'badge-danger'}">${c.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
        <td style="display:flex;gap:4px">
          <button class="btn btn-outline btn-sm" onclick="editarCaminhao(${c.id})"><i class="ti ti-pencil"></i></button>
          <button class="btn btn-warning btn-sm" onclick="inativarCaminhao(${c.id})"><i class="ti ti-${c.ativo !== false ? 'eye-off' : 'eye'}"></i></button>
        </td>
      </tr>`;
    }).join('') + '</tbody></table>';
  atualizarSelects();
}

// ============ MANUTENÇÃO ============
function salvarManutencao() {
  const camId = document.getElementById('man-caminhao').value;
  const valor = parseFloat(document.getElementById('man-valor').value) || 0;
  if (!camId || !valor) { toast('Selecione o veículo e informe o valor!', 'error'); return; }
  const man = {
    id: Date.now(), caminhaoId: camId,
    tipo: document.getElementById('man-tipo').value,
    data: document.getElementById('man-data').value,
    km: parseFloat(document.getElementById('man-km').value) || 0,
    valor, desc: document.getElementById('man-desc').value
  };
  S.manutencoes.push(man);
  save(); renderManutencoes(); renderManutencaoStats(); updDash();
  document.getElementById('man-valor').value = '';
  document.getElementById('man-km').value = '';
  document.getElementById('man-desc').value = '';
  toast('Manutenção registrada!', 'success');
}

function excluirManutencao(id) {
  confirmAction('Excluir este registro de manutenção?', () => {
    S.manutencoes = S.manutencoes.filter(m => m.id != id);
    save(); renderManutencoes(); renderManutencaoStats(); updDash();
    toast('Manutenção excluída', 'warning');
  });
}

function renderManutencoes() {
  const list = document.getElementById('manutencao-lista');
  if (!list) return;
  if (!S.manutencoes.length) { list.innerHTML = '<div class="empty-st"><i class="ti ti-tools"></i>Nenhuma manutenção registrada.</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>Data</th><th>Veículo</th><th>Serviço</th><th>KM</th><th>Valor</th><th>Descrição</th><th>Ação</th></tr></thead><tbody>` +
    [...S.manutencoes].reverse().map(m => {
      const cam = S.caminhoes.find(c => c.id == m.caminhaoId);
      return `<tr><td><small>${escapeHTML(m.data||'')}</small></td><td><strong>${escapeHTML(cam ? cam.placa : 'N/A')}</strong></td><td>${escapeHTML(m.tipo)}</td><td>${(m.km||0).toLocaleString('pt-BR')}</td><td style="color:var(--danger)">R$ ${(m.valor||0).toFixed(2)}</td><td><small>${escapeHTML(m.desc||'')}</small></td>
        <td><button class="btn btn-danger btn-sm" onclick="excluirManutencao(${m.id})"><i class="ti ti-trash"></i></button></td></tr>`;
    }).join('') + '</tbody></table>';
}

function renderManutencaoStats() {
  const agora = new Date();
  const manutMes = S.manutencoes.filter(m => {
    const d = new Date(m.data);
    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  });
  const totalMes = manutMes.reduce((a, b) => a + (b.valor||0), 0);
  const totalGeral = S.manutencoes.reduce((a, b) => a + (b.valor||0), 0);
  const totalKM = S.fretes.reduce((a, b) => a + (b.kmT||0), 0);
  
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('man-total-mes', 'R$ ' + totalMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  el('man-total-geral', 'R$ ' + totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  el('man-custo-km', 'R$ ' + (totalKM > 0 ? (totalGeral / totalKM).toFixed(3) : '0.000'));
  el('man-qtd-mes', manutMes.length);
  
  // Por caminhão
  const container = document.getElementById('man-por-caminhao');
  if (!container) return;
  if (!S.caminhoes.length) { container.innerHTML = '<div class="empty-st">Nenhum veículo.</div>'; return; }
  container.innerHTML = `<table><thead><tr><th>Veículo</th><th>Eventos</th><th>Custo Total</th><th>KM Total</th><th>R$/KM Manutenção</th></tr></thead><tbody>` +
    S.caminhoes.map(c => {
      const mans = S.manutencoes.filter(m => m.caminhaoId == c.id);
      const total = mans.reduce((a, b) => a + (b.valor||0), 0);
      const kms = S.fretes.filter(f => f.caminhaoId == c.id).reduce((a, b) => a + (b.kmT||0), 0);
      return `<tr><td><strong>${escapeHTML(c.placa)} — ${escapeHTML(c.modelo)}</strong></td><td>${mans.length}</td><td style="color:var(--danger)">R$ ${total.toFixed(2)}</td><td>${kms.toLocaleString('pt-BR')} km</td><td>${kms > 0 ? 'R$ ' + (total/kms).toFixed(3) : '—'}</td></tr>`;
    }).join('') + '</tbody></table>';
}

// ============ COMBUSTIVEL ============
function salvarCombustivel() {
  const caminhaoId = document.getElementById('comb-caminhao').value;
  const litros = parseFloat(document.getElementById('comb-litros-input').value) || 0;
  const valor = parseFloat(document.getElementById('comb-valor').value) || 0;
  if (!caminhaoId || !litros || !valor) { toast('Informe veiculo, litros e valor!', 'error'); return; }
  S.combustiveis.unshift({
    id: Date.now(),
    caminhaoId,
    data: document.getElementById('comb-data').value,
    litros,
    valor,
    km: parseFloat(document.getElementById('comb-km').value) || 0,
    posto: document.getElementById('comb-posto').value
  });
  save(); renderCombustivel(); updDash();
  ['comb-litros-input','comb-valor','comb-km','comb-posto'].forEach(id => document.getElementById(id).value = '');
  toast('Abastecimento registrado!', 'success');
}

function renderCombustivel() {
  const total = S.combustiveis.reduce((a, b) => a + (b.valor || 0), 0);
  const litros = S.combustiveis.reduce((a, b) => a + (b.litros || 0), 0);
  const kmTotal = S.fretes.reduce((a, b) => a + (b.kmT || 0), 0);
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('comb-total', fmtMoney(total));
  el('comb-litros', litros.toLocaleString('pt-BR') + ' L');
  el('comb-preco-medio', litros > 0 ? fmtMoney(total / litros) : 'R$ 0,00');
  el('comb-custo-km', kmTotal > 0 ? fmtMoney(total / kmTotal, 3) : 'R$ 0,00');

  const alertas = document.getElementById('comb-alertas');
  if (alertas) {
    const precoMedio = litros > 0 ? total / litros : 0;
    const custoIdeal = S.config.media > 0 ? S.config.diesel / S.config.media : 0;
    alertas.innerHTML = `
      <div class="alert ${precoMedio > S.config.diesel * 1.08 ? 'alert-warning' : 'alert-success'}"><div>Preco medio abastecido: <strong>${fmtMoney(precoMedio)}</strong></div></div>
      <div class="alert ${kmTotal && total / kmTotal > custoIdeal * 1.15 ? 'alert-warning' : 'alert-info'}"><div>Custo real por KM: <strong>${kmTotal > 0 ? fmtMoney(total / kmTotal, 3) : 'R$ 0,00'}</strong> | Referencia: ${fmtMoney(custoIdeal, 3)}</div></div>`;
  }

  const list = document.getElementById('comb-lista');
  if (!list) return;
  if (!S.combustiveis.length) { list.innerHTML = '<div class="empty-st"><i class="ti ti-gas-station"></i>Nenhum abastecimento registrado.</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>Data</th><th>Veiculo</th><th>Litros</th><th>Valor</th><th>R$/L</th><th>KM</th><th>Posto</th></tr></thead><tbody>` +
    S.combustiveis.map(a => {
      const cam = S.caminhoes.find(c => c.id == a.caminhaoId);
      return `<tr><td>${escapeHTML(a.data || '')}</td><td><strong>${escapeHTML(cam ? cam.placa : 'N/A')}</strong></td><td>${(a.litros||0).toLocaleString('pt-BR')} L</td><td>${fmtMoney(a.valor)}</td><td>${a.litros > 0 ? fmtMoney(a.valor/a.litros) : 'R$ 0,00'}</td><td>${(a.km||0).toLocaleString('pt-BR')}</td><td>${escapeHTML(a.posto || '')}</td></tr>`;
    }).join('') + '</tbody></table>';
}

// ============ PNEUS ============
function salvarPneu() {
  const caminhaoId = document.getElementById('pneu-caminhao').value;
  const valor = parseFloat(document.getElementById('pneu-valor').value) || 0;
  if (!caminhaoId) { toast('Selecione o veiculo!', 'error'); return; }
  S.pneus.unshift({
    id: Date.now(),
    caminhaoId,
    data: document.getElementById('pneu-data').value,
    tipo: document.getElementById('pneu-tipo').value,
    valor,
    km: parseFloat(document.getElementById('pneu-km').value) || 0,
    desc: document.getElementById('pneu-desc').value
  });
  save(); renderPneus(); updDash();
  ['pneu-valor','pneu-km','pneu-desc'].forEach(id => document.getElementById(id).value = '');
  toast('Evento de pneus registrado!', 'success');
}

function renderPneus() {
  const total = S.pneus.reduce((a, b) => a + (b.valor || 0), 0);
  const kmTotal = S.fretes.reduce((a, b) => a + (b.kmT || 0), 0);
  const kmsEventos = S.pneus.map(p => p.km || 0).filter(Boolean).sort((a, b) => a - b);
  const vida = kmsEventos.length > 1 ? kmsEventos[kmsEventos.length - 1] - kmsEventos[0] : 0;
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('pneu-total', fmtMoney(total));
  el('pneu-eventos', S.pneus.length);
  el('pneu-custo-km', kmTotal > 0 ? fmtMoney(total / kmTotal, 3) : 'R$ 0,00');
  el('pneu-vida', vida.toLocaleString('pt-BR') + ' km');

  const porCam = document.getElementById('pneu-por-caminhao');
  if (porCam) {
    porCam.innerHTML = `<table><thead><tr><th>Veiculo</th><th>Eventos</th><th>Total</th><th>R$/KM</th></tr></thead><tbody>` +
      S.caminhoes.map(c => {
        const eventos = S.pneus.filter(p => p.caminhaoId == c.id);
        const custo = eventos.reduce((a, b) => a + (b.valor || 0), 0);
        const km = S.fretes.filter(f => f.caminhaoId == c.id).reduce((a, b) => a + (b.kmT || 0), 0);
        return `<tr><td><strong>${escapeHTML(c.placa)}</strong></td><td>${eventos.length}</td><td>${fmtMoney(custo)}</td><td>${km > 0 ? fmtMoney(custo / km, 3) : 'R$ 0,00'}</td></tr>`;
      }).join('') + '</tbody></table>';
  }

  const list = document.getElementById('pneu-lista');
  if (!list) return;
  if (!S.pneus.length) { list.innerHTML = '<div class="empty-st"><i class="ti ti-lifebuoy"></i>Nenhum evento de pneus registrado.</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>Data</th><th>Veiculo</th><th>Evento</th><th>Valor</th><th>KM</th><th>Descricao</th></tr></thead><tbody>` +
    S.pneus.map(p => {
      const cam = S.caminhoes.find(c => c.id == p.caminhaoId);
      return `<tr><td>${escapeHTML(p.data || '')}</td><td><strong>${escapeHTML(cam ? cam.placa : 'N/A')}</strong></td><td>${escapeHTML(p.tipo)}</td><td>${fmtMoney(p.valor)}</td><td>${(p.km||0).toLocaleString('pt-BR')}</td><td>${escapeHTML(p.desc || '')}</td></tr>`;
    }).join('') + '</tbody></table>';
}

// ============ CLIENTES ============
function salvarCliente() {
  const nome = document.getElementById('cli-nome').value.trim();
  if (!nome) { toast('Nome do cliente obrigatório!', 'error'); return; }
  const editId = document.getElementById('cli-edit-id').value;
  const cli = {
    id: editId ? parseInt(editId) : Date.now(),
    nome, empresa: document.getElementById('cli-empresa').value,
    telefone: document.getElementById('cli-tel').value,
    cidade: document.getElementById('cli-cidade').value,
    estado: document.getElementById('cli-estado').value,
    ativo: true
  };
  if (editId) {
    const idx = S.clientes.findIndex(c => c.id == editId);
    if (idx !== -1) { cli.ativo = S.clientes[idx].ativo; S.clientes[idx] = cli; }
  } else {
    S.clientes.push(cli);
  }
  save(); renderClientes(); atualizarSelects();
  toast(editId ? 'Cliente atualizado!' : 'Cliente cadastrado!', 'success');
  limparCliente();
}

function limparCliente() {
  ['cli-nome','cli-empresa','cli-tel','cli-cidade','cli-estado'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('cli-edit-id').value = '';
}

function editarCliente(id) {
  const c = S.clientes.find(x => x.id == id);
  if (!c) return;
  document.getElementById('cli-edit-id').value = c.id;
  document.getElementById('cli-nome').value = c.nome;
  document.getElementById('cli-empresa').value = c.empresa || '';
  document.getElementById('cli-tel').value = c.telefone || '';
  document.getElementById('cli-cidade').value = c.cidade || '';
  document.getElementById('cli-estado').value = c.estado || '';
  toast('Cliente carregado para edição', 'warning');
}

function inativarCliente(id) {
  const c = S.clientes.find(x => x.id == id);
  if (!c) return;
  confirmAction(`Deseja ${c.ativo !== false ? 'inativar' : 'reativar'} o cliente <strong>${c.nome}</strong>?`, () => {
    c.ativo = !(c.ativo !== false);
    save(); renderClientes(); atualizarSelects();
    toast(`Cliente ${c.ativo ? 'reativado' : 'inativado'}`, 'success');
  });
}

function renderClientes() {
  const list = document.getElementById('clientes-lista');
  if (!list) return;
  const showInativos = document.getElementById('cli-show-inativos') ? document.getElementById('cli-show-inativos').checked : false;
  let clis = showInativos ? S.clientes : S.clientes.filter(c => c.ativo !== false);
  if (!clis.length) { list.innerHTML = '<div class="empty-st"><i class="ti ti-users"></i>Nenhum cliente cadastrado.</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>Nome</th><th>Empresa</th><th>Telefone</th><th>Cidade/UF</th><th>Status</th><th>Ações</th></tr></thead><tbody>` +
    clis.map(c => `<tr style="${c.ativo === false ? 'opacity:.5' : ''}">
      <td><strong>${escapeHTML(c.nome)}</strong></td><td>${escapeHTML(c.empresa||'—')}</td><td>${escapeHTML(c.telefone||'—')}</td><td>${escapeHTML(c.cidade||'')}${c.estado ? '/'+escapeHTML(c.estado) : ''}</td>
      <td><span class="badge ${c.ativo !== false ? 'badge-success' : 'badge-danger'}">${c.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
      <td style="display:flex;gap:4px">
        <button class="btn btn-outline btn-sm" onclick="editarCliente(${c.id})"><i class="ti ti-pencil"></i></button>
        <button class="btn btn-warning btn-sm" onclick="inativarCliente(${c.id})"><i class="ti ti-${c.ativo !== false ? 'user-off' : 'user-check'}"></i></button>
      </td>
    </tr>`).join('') + '</tbody></table>';
  atualizarSelects();
}

// ============ FINANCIAMENTOS ============
function salvarFinanciamento() {
  const desc = document.getElementById('fin-desc').value.trim();
  if (!desc) { toast('Descrição obrigatória!', 'error'); return; }
  const fin = {
    id: Date.now(), desc,
    caminhaoId: document.getElementById('fin-caminhao').value,
    parcela: parseFloat(document.getElementById('fin-parcela').value) || 0,
    qtd: parseInt(document.getElementById('fin-qtd').value) || 0,
    pagas: parseInt(document.getElementById('fin-pagas').value) || 0
  };
  S.financiamentos.push(fin);
  save(); renderFinanciamentos();
  toast('Financiamento cadastrado!', 'success');
}

function excluirFinanciamento(id) {
  confirmAction('Excluir este financiamento?', () => {
    S.financiamentos = S.financiamentos.filter(f => f.id != id);
    save(); renderFinanciamentos();
    toast('Financiamento removido', 'warning');
  });
}

function renderFinanciamentos() {
  const list = document.getElementById('fin-lista');
  if (!list) return;
  if (!S.financiamentos.length) { list.innerHTML = '<div class="empty-st"><i class="ti ti-credit-card"></i>Nenhum financiamento.</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>Bem</th><th>Caminhão</th><th>Parcela</th><th>Progresso</th><th>Restante</th><th>Ação</th></tr></thead><tbody>` +
    S.financiamentos.map(f => {
      const cam = S.caminhoes.find(c => c.id == f.caminhaoId);
      const restante = (f.qtd - f.pagas);
      const pct = f.qtd > 0 ? (f.pagas / f.qtd * 100) : 0;
      return `<tr><td><strong>${f.desc}</strong></td>
        <td>${cam ? cam.placa : '<span style="color:var(--muted)">Geral</span>'}</td>
        <td>R$ ${(f.parcela||0).toFixed(2)}</td>
        <td><div style="font-size:.75rem;margin-bottom:3px">${f.pagas}/${f.qtd}</div><div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--success)"></div></div></td>
        <td>R$ ${((restante) * (f.parcela||0)).toFixed(2)}</td>
        <td><button class="btn btn-danger btn-sm" onclick="excluirFinanciamento(${f.id})"><i class="ti ti-trash"></i></button></td>
      </tr>`;
    }).join('') + '</tbody></table>';
}

// ============ SELECTS ============
function atualizarSelects() {
  const caminhoeAtivos = S.caminhoes.filter(c => c.ativo !== false);
  const clientesAtivos = S.clientes.filter(c => c.ativo !== false);
  const motoristasAtivos = S.motoristas.filter(m => m.ativo !== false);
  
  const el = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };
  
  el('f-cliente', clientesAtivos.map(c => `<option value="${c.id}">${c.nome}</option>`).join(''));
  el('f-motorista', `<option value="">-- Sem motorista --</option>` + motoristasAtivos.map(m => `<option value="${m.id}">${m.nome}</option>`).join(''));
  
  const camOpts = caminhoeAtivos.map(c => `<option value="${c.id}">${c.placa} - ${c.modelo}</option>`).join('');
  const camOptsAll = S.caminhoes.map(c => `<option value="${c.id}">${c.placa}${c.ativo === false ? ' (inativo)' : ''}</option>`).join('');
  el('f-caminhao', camOpts);
  el('man-caminhao', camOpts);
  el('comb-caminhao', camOpts);
  el('pneu-caminhao', camOpts);
  el('pag-caminhao', `<option value="">-- Geral --</option>` + camOptsAll);
  el('fin-caminhao', `<option value="">-- Geral (rateado) --</option>` + camOptsAll);
  el('cam-motorista', `<option value="">-- Nenhum --</option>` + motoristasAtivos.map(m => `<option value="${m.id}">${m.nome}</option>`).join(''));
  
  // Preencher campos de custos da config
  const setVal = (id, val) => { const e = document.getElementById(id); if (e) e.value = val; };
  setVal('c-diesel', S.config.diesel);
  setVal('c-media', S.config.media);
  setVal('c-arla', S.config.arla);
  setVal('c-manut', S.config.manut);
  setVal('c-km-mes', S.config.kmMes);
  setVal('c-impostos', S.config.impostos ? S.config.impostos.percentual : 6);
}

// ============ CONTAS A RECEBER ============
function renderReceber() {
  const filtro = document.getElementById('filtro-rec') ? document.getElementById('filtro-rec').value : '';
  let fretes = S.fretes;
  if (filtro) fretes = fretes.filter(f => f.statusReceb === filtro);
  
  const agora = new Date();
  const tbRec = document.getElementById('tb-recebimentos');
  if (tbRec) {
    tbRec.innerHTML = fretes.map(f => {
      const cli = S.clientes.find(c => c.id == f.clienteId);
      const badge = {Recebido:'badge-success',Pendente:'badge-warning',Atrasado:'badge-danger',Faturado:'badge-info'}[f.statusReceb]||'badge-muted';
      const atrasado = f.statusReceb !== 'Recebido' && f.dataVenc && new Date(f.dataVenc) < agora;
      return `<tr>
        <td><strong>${cli ? cli.nome : 'N/A'}</strong><br><small>${f.origem||''} → ${f.destino||''}</small></td>
        <td><small>${f.nf||'—'}</small></td>
        <td ${atrasado ? 'style="color:var(--danger);font-weight:600"' : ''}>${f.dataVenc||'—'}</td>
        <td>R$ ${(f.valorBruto||0).toFixed(2)}</td>
        <td><small>${f.formaPagamento||'—'}</small></td>
        <td><span class="badge ${badge}">${f.statusReceb}</span></td>
        <td>${f.statusReceb !== 'Recebido' ? `<button class="btn btn-success btn-sm" onclick="baixarFrete(${f.id})"><i class="ti ti-check"></i> Baixar</button>` : `<small style="color:var(--muted)">${f.dataRecebimento||''}</small>`}</td>
      </tr>`;
    }).join('');
  }
  
  const pendente = S.fretes.filter(f => f.statusReceb !== 'Recebido').reduce((a, b) => a + (b.valorBruto||0), 0);
  const mesAtual = agora.getMonth(); const anoAtual = agora.getFullYear();
  const recebidoMes = S.fretes.filter(f => f.statusReceb === 'Recebido' && new Date(f.dataRecebimento||f.dataEmissao).getMonth() === mesAtual).reduce((a, b) => a + (b.valorBruto||0), 0);
  const atrasado = S.fretes.filter(f => f.statusReceb !== 'Recebido' && f.dataVenc && new Date(f.dataVenc) < agora).reduce((a, b) => a + (b.valorBruto||0), 0);
  
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('rec-total-pendente', 'R$ ' + pendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  el('rec-total-recebido', 'R$ ' + recebidoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  el('rec-total-atrasado', 'R$ ' + atrasado.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
  el('rec-projecao', 'R$ ' + (pendente + recebidoMes).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
}

// ============ CONTAS A PAGAR ============
function salvarContaPagar() {
  const desc = document.getElementById('pag-desc').value.trim();
  const valor = parseFloat(document.getElementById('pag-valor').value) || 0;
  if (!desc || !valor) { toast('Informe descrição e valor da conta!', 'error'); return; }
  const editId = document.getElementById('pag-edit-id').value;
  const conta = {
    id: editId ? parseInt(editId) : Date.now(),
    desc,
    categoria: document.getElementById('pag-categoria').value,
    caminhaoId: document.getElementById('pag-caminhao').value,
    vencimento: document.getElementById('pag-venc').value,
    valor,
    status: document.getElementById('pag-status').value,
    obs: document.getElementById('pag-obs').value,
    dataPagamento: document.getElementById('pag-status').value === 'Pago' ? new Date().toISOString().split('T')[0] : ''
  };
  if (editId) {
    const idx = S.contasPagar.findIndex(c => c.id == editId);
    if (idx !== -1) {
      conta.dataPagamento = conta.status === 'Pago' ? (S.contasPagar[idx].dataPagamento || conta.dataPagamento) : '';
      S.contasPagar[idx] = conta;
    }
  } else {
    S.contasPagar.unshift(conta);
  }
  save(); renderContasPagar(); renderFluxo(); renderDREPage(); updDash();
  limparContaPagar();
  toast(editId ? 'Conta atualizada!' : 'Conta cadastrada!', 'success');
}

function limparContaPagar() {
  ['pag-desc','pag-valor','pag-obs','pag-edit-id'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('pag-status').value = 'Pendente';
  document.getElementById('pag-categoria').value = 'Combustível';
  document.getElementById('pag-caminhao').value = '';
  const venc = document.getElementById('pag-venc');
  if (venc) venc.valueAsDate = new Date();
}

function editarContaPagar(id) {
  const c = S.contasPagar.find(x => x.id == id);
  if (!c) return;
  document.getElementById('pag-edit-id').value = c.id;
  document.getElementById('pag-desc').value = c.desc || '';
  document.getElementById('pag-categoria').value = c.categoria || 'Outros';
  document.getElementById('pag-caminhao').value = c.caminhaoId || '';
  document.getElementById('pag-venc').value = c.vencimento || '';
  document.getElementById('pag-valor').value = c.valor || 0;
  document.getElementById('pag-status').value = c.status || 'Pendente';
  document.getElementById('pag-obs').value = c.obs || '';
  toast('Conta carregada para edição', 'warning');
}

function baixarContaPagar(id) {
  const c = S.contasPagar.find(x => x.id == id);
  if (!c) return;
  c.status = 'Pago';
  c.dataPagamento = new Date().toISOString().split('T')[0];
  save(); renderContasPagar(); renderFluxo(); renderDREPage(); updDash();
  toast('Conta marcada como paga!', 'success');
}

function excluirContaPagar(id) {
  confirmAction('Excluir esta conta a pagar?', () => {
    S.contasPagar = S.contasPagar.filter(c => c.id != id);
    save(); renderContasPagar(); renderFluxo(); renderDREPage(); updDash();
    toast('Conta removida', 'warning');
  });
}

function renderContasPagar() {
  const agora = new Date();
  const hoje = dateFromInput(new Date().toISOString().split('T')[0]);
  S.contasPagar.forEach(c => {
    if (c.status !== 'Pago' && c.vencimento && dateFromInput(c.vencimento) < hoje) c.status = 'Vencido';
  });
  const filtro = document.getElementById('filtro-pagar') ? document.getElementById('filtro-pagar').value : '';
  let contas = filtro ? S.contasPagar.filter(c => c.status === filtro) : S.contasPagar;
  const aberto = S.contasPagar.filter(c => c.status !== 'Pago').reduce((a, b) => a + (b.valor || 0), 0);
  const pagoMes = S.contasPagar.filter(c => c.status === 'Pago' && isSameMonth(c.dataPagamento || c.vencimento, agora.getMonth(), agora.getFullYear())).reduce((a, b) => a + (b.valor || 0), 0);
  const vencido = S.contasPagar.filter(c => c.status === 'Vencido').reduce((a, b) => a + (b.valor || 0), 0);
  const limite = new Date(hoje); limite.setDate(limite.getDate() + 7);
  const prox7 = S.contasPagar.filter(c => c.status !== 'Pago' && c.vencimento && dateFromInput(c.vencimento) >= hoje && dateFromInput(c.vencimento) <= limite).reduce((a, b) => a + (b.valor || 0), 0);
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('pag-total-aberto', fmtMoney(aberto));
  el('pag-total-pago', fmtMoney(pagoMes));
  el('pag-total-vencido', fmtMoney(vencido));
  el('pag-prox-7', fmtMoney(prox7));

  const list = document.getElementById('pagar-lista');
  if (!list) return;
  if (!contas.length) { list.innerHTML = '<div class="empty-st"><i class="ti ti-file-invoice"></i>Nenhuma conta cadastrada.</div>'; return; }
  list.innerHTML = `<table><thead><tr><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>` +
    contas.map(c => {
      const badge = {Pago:'badge-success',Pendente:'badge-warning',Vencido:'badge-danger'}[c.status] || 'badge-muted';
      return `<tr>
        <td><strong>${escapeHTML(c.desc)}</strong><br><small style="color:var(--muted)">${escapeHTML(c.obs || '')}</small></td>
        <td>${escapeHTML(c.categoria || 'Outros')}</td>
        <td>${escapeHTML(c.vencimento || '—')}</td>
        <td>${fmtMoney(c.valor)}</td>
        <td><span class="badge ${badge}">${escapeHTML(c.status)}</span></td>
        <td style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" onclick="editarContaPagar(${c.id})"><i class="ti ti-pencil"></i></button>
          ${c.status !== 'Pago' ? `<button class="btn btn-success btn-sm" onclick="baixarContaPagar(${c.id})"><i class="ti ti-check"></i></button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="excluirContaPagar(${c.id})"><i class="ti ti-trash"></i></button>
        </td></tr>`;
    }).join('') + '</tbody></table>';
}

// ============ FOLHA DE MOTORISTAS ============
function preencherFiltrosFolha() {
  const mes = document.getElementById('folha-mes');
  const ano = document.getElementById('folha-ano');
  if (!mes || !ano) return;
  const agora = new Date();
  mes.innerHTML = monthOptions(agora.getMonth());
  ano.innerHTML = yearOptions(agora.getFullYear());
}

function calcularFolhaMotorista(motorista, mes, ano) {
  const fretes = S.fretes.filter(f => f.motoristaId == motorista.id && isSameMonth(f.dataEmissao, mes, ano));
  const receita = fretes.reduce((a, b) => a + (b.valorBruto || 0), 0);
  const lucro = fretes.reduce((a, b) => a + (b.lucroLiquido || 0), 0);
  const km = fretes.reduce((a, b) => a + (b.kmT || 0), 0);
  let fixo = motorista.tipo === 'fixo' || motorista.tipo === 'misto' ? (motorista.salario || 0) : 0;
  let comissao = motorista.tipo === 'comissao' || motorista.tipo === 'misto' ? receita * ((motorista.comissao || 0) / 100) : 0;
  comissao += fretes.length * (motorista.regraViagem || 0);
  comissao += km * (motorista.regraKm || 0);
  comissao += Math.max(lucro, 0) * ((motorista.regraLucro || 0) / 100);
  const bruto = fixo + comissao;
  const pago = S.pagamentosMotoristas.filter(p => p.motoristaId == motorista.id && Number(p.mes) === mes && Number(p.ano) === ano).reduce((a, b) => a + (b.valor || 0), 0);
  return { motorista, fretes: fretes.length, receita, lucro, km, fixo, comissao, bruto, pago, aberto: Math.max(bruto - pago, 0) };
}

function pagarFolhaMotorista(motoristaId) {
  const mes = parseInt(document.getElementById('folha-mes').value);
  const ano = parseInt(document.getElementById('folha-ano').value);
  const motorista = S.motoristas.find(m => m.id == motoristaId);
  if (!motorista) return;
  const item = calcularFolhaMotorista(motorista, mes, ano);
  if (item.aberto <= 0) { toast('Nada em aberto para este motorista.', 'warning'); return; }
  S.pagamentosMotoristas.unshift({ id: Date.now(), motoristaId, mes, ano, valor: item.aberto, data: new Date().toISOString().split('T')[0] });
  S.contasPagar.unshift({ id: Date.now() + 1, desc: `Folha motorista - ${motorista.nome}`, categoria: 'Salários', caminhaoId: '', vencimento: new Date().toISOString().split('T')[0], valor: item.aberto, status: 'Pago', dataPagamento: new Date().toISOString().split('T')[0], obs: `Competência ${String(mes + 1).padStart(2,'0')}/${ano}` });
  save(); renderFolhaMotoristas(); renderContasPagar(); renderFluxo(); renderDREPage(); updDash();
  toast('Pagamento de folha registrado!', 'success');
}

function renderFolhaMotoristas() {
  const mesEl = document.getElementById('folha-mes');
  const anoEl = document.getElementById('folha-ano');
  if (!mesEl || !anoEl) return;
  const mes = parseInt(mesEl.value);
  const ano = parseInt(anoEl.value);
  const itens = S.motoristas.filter(m => m.ativo !== false).map(m => calcularFolhaMotorista(m, mes, ano));
  const prevista = itens.reduce((a, b) => a + b.bruto, 0);
  const pago = itens.reduce((a, b) => a + b.pago, 0);
  const aberto = itens.reduce((a, b) => a + b.aberto, 0);
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('folha-prevista', fmtMoney(prevista));
  el('folha-pago', fmtMoney(pago));
  el('folha-aberto', fmtMoney(aberto));
  el('folha-ativos', itens.length);

  const lista = document.getElementById('folha-lista');
  if (lista) {
    if (!itens.length) lista.innerHTML = '<div class="empty-st"><i class="ti ti-id-badge-2"></i>Nenhum motorista ativo.</div>';
    else lista.innerHTML = `<table><thead><tr><th>Motorista</th><th>Fretes</th><th>KM</th><th>Receita</th><th>Lucro</th><th>Fixo</th><th>Comissão</th><th>Total</th><th>Pago</th><th>Ação</th></tr></thead><tbody>` +
      itens.map(i => `<tr>
        <td><strong>${escapeHTML(i.motorista.nome)}</strong></td><td>${i.fretes}</td><td>${i.km.toLocaleString('pt-BR')} km</td><td>${fmtMoney(i.receita)}</td>
        <td style="color:${i.lucro >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmtMoney(i.lucro)}</td><td>${fmtMoney(i.fixo)}</td><td>${fmtMoney(i.comissao)}</td>
        <td><strong>${fmtMoney(i.bruto)}</strong></td><td>${fmtMoney(i.pago)}</td>
        <td>${i.aberto > 0 ? `<button class="btn btn-success btn-sm" onclick="pagarFolhaMotorista(${i.motorista.id})"><i class="ti ti-check"></i> Pagar</button>` : '<span class="badge badge-success">Quitado</span>'}</td>
      </tr>`).join('') + '</tbody></table>';
  }

  const hist = document.getElementById('folha-historico');
  if (hist) {
    const rows = S.pagamentosMotoristas.slice(0, 20);
    if (!rows.length) hist.innerHTML = '<div class="empty-st"><i class="ti ti-history"></i>Nenhum pagamento registrado.</div>';
    else hist.innerHTML = `<table><thead><tr><th>Data</th><th>Motorista</th><th>Competência</th><th>Valor</th></tr></thead><tbody>` +
      rows.map(p => {
        const mot = S.motoristas.find(m => m.id == p.motoristaId);
        return `<tr><td>${escapeHTML(p.data)}</td><td><strong>${escapeHTML(mot ? mot.nome : 'N/A')}</strong></td><td>${String(Number(p.mes) + 1).padStart(2,'0')}/${p.ano}</td><td>${fmtMoney(p.valor)}</td></tr>`;
      }).join('') + '</tbody></table>';
  }
}

// ============ FLUXO DE CAIXA ============
function renderFluxo() {
  const agora = new Date();
  const mes = agora.getMonth(), ano = agora.getFullYear();
  
  const fretesMes = S.fretes.filter(f => { const d = dateFromInput(f.dataEmissao); return d.getMonth() === mes && d.getFullYear() === ano; });
  const recebidoMes = S.fretes.filter(f => {
    const d = dateFromInput(f.dataRecebimento);
    return f.statusReceb === 'Recebido' && f.dataRecebimento && d.getMonth() === mes && d.getFullYear() === ano;
  });
  
  const entradas = recebidoMes.reduce((a, b) => a + (b.valorBruto||0), 0);
  const saidaManut = S.manutencoes.filter(m => { const d = dateFromInput(m.data); return d.getMonth() === mes && d.getFullYear() === ano; }).reduce((a, b) => a + (b.valor||0), 0);
  const saidaFixos = S.config.fixos.reduce((a, b) => a + (b.v||0), 0);
  const saidaFinanc = S.financiamentos.reduce((a, b) => a + (b.parcela||0), 0);
  const saidaFolha = S.motoristas.filter(m => m.ativo !== false && m.tipo !== 'comissao').reduce((a, b) => a + (b.salario||0), 0);
  const saidaComissoes = fretesMes.reduce((a, b) => a + (b.custoMotorista||0), 0);
  const saidaDiesel = fretesMes.reduce((a, b) => a + (b.custoDiesel||0), 0);
  const saidaContas = S.contasPagar.filter(c => c.status === 'Pago' && isSameMonth(c.dataPagamento || c.vencimento, mes, ano)).reduce((a, b) => a + (b.valor || 0), 0);
  
  const totalSaidas = saidaManut + saidaFixos + saidaFinanc + saidaFolha + saidaComissoes + saidaDiesel + saidaContas;
  const saldo = entradas - totalSaidas;
  
  const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('fluxo-entradas', fmt(entradas));
  el('fluxo-saidas', fmt(totalSaidas));
  el('fluxo-saldo', fmt(saldo));
  document.getElementById('fluxo-saldo').style.color = saldo >= 0 ? 'var(--success)' : 'var(--danger)';
  
  const entDet = document.getElementById('fluxo-entradas-det');
  if (entDet) entDet.innerHTML = `
    <div style="padding:.75rem"><table>
      <tr><td>Fretes recebidos no mês</td><td style="text-align:right;color:var(--success)">${fmt(entradas)}</td></tr>
    </table></div>`;
  
  const saiDet = document.getElementById('fluxo-saidas-det');
  if (saiDet) saiDet.innerHTML = `
    <div style="padding:.75rem"><table>
      <tr><td>Diesel (fretes do mês)</td><td style="text-align:right;color:var(--danger)">${fmt(saidaDiesel)}</td></tr>
      <tr><td>Manutenções</td><td style="text-align:right;color:var(--danger)">${fmt(saidaManut)}</td></tr>
      <tr><td>Folha Motoristas</td><td style="text-align:right;color:var(--danger)">${fmt(saidaFolha)}</td></tr>
      <tr><td>Comissoes de Viagem</td><td style="text-align:right;color:var(--danger)">${fmt(saidaComissoes)}</td></tr>
      <tr><td>Contas Pagas</td><td style="text-align:right;color:var(--danger)">${fmt(saidaContas)}</td></tr>
      <tr><td>Custos Fixos</td><td style="text-align:right;color:var(--danger)">${fmt(saidaFixos)}</td></tr>
      <tr><td>Financiamentos</td><td style="text-align:right;color:var(--danger)">${fmt(saidaFinanc)}</td></tr>
      <tr style="font-weight:700"><td>TOTAL SAÍDAS</td><td style="text-align:right;color:var(--danger)">${fmt(totalSaidas)}</td></tr>
    </table></div>`;
}

// ============ FILTROS DRE ============
function preencherFiltrosDRE() {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const selMes = document.getElementById('dre-mes');
  const selAno = document.getElementById('dre-ano');
  if (!selMes || !selAno) return;
  const agora = new Date();
  selMes.innerHTML = meses.map((m, i) => `<option value="${i}" ${i === agora.getMonth() ? 'selected' : ''}>${m}</option>`).join('');
  const anos = [];
  for (let y = agora.getFullYear(); y >= agora.getFullYear() - 3; y--) anos.push(y);
  selAno.innerHTML = anos.map(y => `<option value="${y}">${y}</option>`).join('');
}

// ============ DRE PROFISSIONAL ============
function renderDREPage() {
  const selMes = document.getElementById('dre-mes');
  const selAno = document.getElementById('dre-ano');
  if (!selMes || !selAno) return;
  const mes = parseInt(selMes.value);
  const ano = parseInt(selAno.value);
  const fretes = S.fretes.filter(f => { const d = new Date(f.dataEmissao); return d.getMonth() === mes && d.getFullYear() === ano; });
  renderDRE(fretes);
}

function renderDRE(fretes) {
  const container = document.getElementById('dre-container');
  if (!container) return;
  
  const receitas = fretes.reduce((a, b) => a + (b.valorBruto||0), 0);
  const diesel = fretes.reduce((a, b) => a + (b.custoDiesel||0), 0);
  const pedagio = fretes.reduce((a, b) => a + (b.pedagio||0), 0);
  const motorista = fretes.reduce((a, b) => a + (b.custoMotorista||0), 0);
  const impostos = fretes.reduce((a, b) => a + (b.impostos||0), 0);
  const comissao = fretes.reduce((a, b) => a + (b.comissao||0), 0);
  const variaveis = fretes.reduce((a, b) => a + (b.custoVariavel||0), 0);
  const fixos = fretes.reduce((a, b) => a + (b.custoFixo||0), 0);
  const financ = fretes.reduce((a, b) => a + (b.custoFinanc||0), 0);
  
  // Manutenção do período (integrada ao DRE)
  let mesDRE = new Date().getMonth(), anoDRE = new Date().getFullYear();
  const selMes = document.getElementById('dre-mes'), selAno = document.getElementById('dre-ano');
  if (selMes) mesDRE = parseInt(selMes.value);
  if (selAno) anoDRE = parseInt(selAno.value);
  const manutPeriodo = S.manutencoes.filter(m => { const d = new Date(m.data); return d.getMonth() === mesDRE && d.getFullYear() === anoDRE; }).reduce((a, b) => a + (b.valor||0), 0);
  const contasPeriodo = S.contasPagar.filter(c => c.status === 'Pago' && isSameMonth(c.dataPagamento || c.vencimento, mesDRE, anoDRE)).reduce((a, b) => a + (b.valor || 0), 0);
  
  const recLiq = receitas - impostos - comissao - pedagio;
  const margContrib = recLiq - diesel - variaveis - motorista - manutPeriodo;
  const lucroOper = margContrib - fixos - financ - contasPeriodo;
  
  const pct = v => receitas > 0 ? ` <span class="pct">(${(v/receitas*100).toFixed(1)}%)</span>` : '';
  const fmt = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  
  const rows = [
    { n: 'RECEITA BRUTA', v: receitas, type: 'bold' },
    { n: '(-) Impostos', v: impostos, type: '' },
    { n: '(-) Comissão de Agenciamento', v: comissao, type: '' },
    { n: '(-) Pedágio', v: pedagio, type: '' },
    { n: 'RECEITA LÍQUIDA', v: recLiq, type: 'section' },
    { n: '(-) Diesel', v: diesel, type: '' },
    { n: '(-) Motoristas (custo rateado)', v: motorista, type: '' },
    { n: '(-) Manutenções do período', v: manutPeriodo, type: '' },
    { n: '(-) Custos Variáveis (Arla/Pneus)', v: variaveis, type: '' },
    { n: 'MARGEM DE CONTRIBUIÇÃO', v: margContrib, type: 'section' },
    { n: '(-) Custos Fixos Rateados', v: fixos, type: '' },
    { n: '(-) Financiamentos Rateados', v: financ, type: '' },
    { n: '(-) Contas Pagas do Período', v: contasPeriodo, type: '' },
    { n: 'LUCRO OPERACIONAL', v: lucroOper, type: 'bold', color: lucroOper > 0 ? 'var(--success)' : 'var(--danger)' }
  ];
  
  container.innerHTML = `<div style="max-width:600px">` +
    rows.map(r => `
      <div class="dre-row ${r.type}">
        <span>${r.n}${pct(r.v)}</span>
        <span style="${r.color ? 'color:'+r.color : ''}">${fmt(r.v)}</span>
      </div>`).join('') + `</div>
    <div style="margin-top:1rem;font-size:.8rem;color:var(--muted);padding:.5rem;background:#f8fafc;border-radius:6px">
      <strong>Nota:</strong> Fretes no período: ${fretes.length} | Total KM: ${fretes.reduce((a,b)=>a+(b.kmT||0),0).toLocaleString('pt-BR')} km
    </div>`;
}

// ============ PREVISÃO ============
function renderPrevisao() {
  const container = document.getElementById('previsao-detalhe');
  if (!container) return;
  
  const receber = S.fretes.filter(f => f.statusReceb !== 'Recebido').reduce((a, b) => a + (b.valorBruto||0), 0);
  const totalFixos = S.config.fixos.reduce((a, b) => a + (b.v||0), 0);
  const totalParcelas = S.financiamentos.reduce((a, b) => a + (b.parcela||0), 0);
  const folhaMotoristas = S.motoristas.filter(m => m.ativo !== false && m.tipo !== 'comissao').reduce((a, b) => a + (b.salario||0), 0);
  const contasAbertas = S.contasPagar.filter(c => c.status !== 'Pago').reduce((a, b) => a + (b.valor || 0), 0);
  const saidasMensais = totalFixos + totalParcelas + folhaMotoristas + contasAbertas;
  
  const proj30 = receber - saidasMensais;
  const proj60 = proj30 - saidasMensais;
  const proj90 = proj60 - saidasMensais;
  
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const fmt = v => 'R$ ' + v.toLocaleString('pt-BR');
  el('proj-30', fmt(proj30)); el('proj-60', fmt(proj60)); el('proj-90', fmt(proj90));
  
  const faturMedioKm = S.fretes.length > 0 ? S.fretes.reduce((a, b) => a + ((b.kmC||0) > 0 ? (b.valorBruto||0)/(b.kmC||1) : 0), 0) / S.fretes.length : 0;
  const cVarKm = (S.config.diesel / S.config.media) + S.config.arla + S.config.manut;
  const margContribKm = faturMedioKm - cVarKm;
  const breakeven = margContribKm > 0 ? saidasMensais / margContribKm : 0;
  el('proj-breakeven', Math.ceil(breakeven).toLocaleString('pt-BR') + ' km');
  
  container.innerHTML = `
    <div class="alert alert-info">
      <div><strong>Projeção Executiva:</strong><br>
      Custos e compromissos: <strong>${fmt(saidasMensais)}</strong> (Fixos: ${fmt(totalFixos)} | Financ: ${fmt(totalParcelas)} | Folha: ${fmt(folhaMotoristas)} | Contas: ${fmt(contasAbertas)})<br>
      KM mínimo para breakeven: <strong>${Math.ceil(breakeven).toLocaleString('pt-BR')} km/mês</strong><br>
      Saldo a receber cobre despesas fixas por: <strong>${saidasMensais > 0 ? (receber/saidasMensais).toFixed(1) : '∞'} meses</strong></div>
    </div>`;
}

// ============ RANKINGS ============
function renderRankClientes() {
  const tbody = document.getElementById('tb-rank-clientes');
  if (!tbody) return;
  const stats = S.clientes.map(c => {
    const fts = S.fretes.filter(f => f.clienteId == c.id);
    const receita = fts.reduce((a, b) => a + (b.valorBruto||0), 0);
    const lucro = fts.reduce((a, b) => a + (b.lucroLiquido||0), 0);
    const margem = receita > 0 ? (lucro / receita * 100) : 0;
    const ticket = fts.length > 0 ? receita / fts.length : 0;
    return { nome: c.nome, qtd: fts.length, receita, lucro, margem, ticket };
  }).filter(s => s.qtd > 0).sort((a, b) => b.receita - a.receita);
  
  if (!stats.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-st">Nenhum dado.</td></tr>'; return; }
  tbody.innerHTML = stats.map((s, i) => `<tr>
    <td><strong>#${i+1}</strong></td>
    <td><strong>${s.nome}</strong></td>
    <td>${s.qtd}</td>
    <td>R$ ${s.receita.toFixed(2)}</td>
    <td style="color:${s.lucro > 0 ? 'var(--success)' : 'var(--danger)'}">R$ ${s.lucro.toFixed(2)}</td>
    <td><span class="badge ${s.margem > 20 ? 'badge-success' : s.margem > 0 ? 'badge-warning' : 'badge-danger'}">${s.margem.toFixed(1)}%</span></td>
    <td>R$ ${s.ticket.toFixed(2)}</td>
  </tr>`).join('');
}

function renderRankRotas() {
  const tbody = document.getElementById('tb-rank-rotas');
  if (!tbody) return;
  const mapa = {};
  S.fretes.forEach(f => {
    const key = `${(f.origem||'').trim()}→${(f.destino||'').trim()}`;
    if (!mapa[key]) mapa[key] = { origem: f.origem||'', destino: f.destino||'', qtd: 0, receita: 0, lucro: 0, km: 0 };
    mapa[key].qtd++;
    mapa[key].receita += (f.valorBruto||0);
    mapa[key].lucro += (f.lucroLiquido||0);
    mapa[key].km += (f.kmT||0);
  });
  const rotas = Object.values(mapa).sort((a, b) => b.lucro - a.lucro);
  if (!rotas.length) { tbody.innerHTML = '<tr><td colspan="8" class="empty-st">Nenhum frete registrado.</td></tr>'; return; }
  tbody.innerHTML = rotas.map((r, i) => `<tr>
    <td><strong>#${i+1}</strong></td>
    <td><strong>${r.origem}</strong> → <strong>${r.destino}</strong></td>
    <td>${r.qtd}</td>
    <td>${r.km.toLocaleString('pt-BR')} km</td>
    <td>R$ ${r.receita.toFixed(2)}</td>
    <td style="color:${r.lucro > 0 ? 'var(--success)' : 'var(--danger)'}">R$ ${r.lucro.toFixed(2)}</td>
    <td>R$ ${r.qtd > 0 ? (r.lucro/r.qtd).toFixed(2) : '0.00'}</td>
    <td>R$ ${r.km > 0 ? (r.receita/r.km).toFixed(2) : '0.00'}</td>
  </tr>`).join('');
}

function renderDesempenhoFrota() {
  const tbody = document.getElementById('tb-desempenho-frota');
  if (!tbody) return;
  const stats = S.caminhoes.map(c => {
    const fts = S.fretes.filter(f => f.caminhaoId == c.id);
    const mans = S.manutencoes.filter(m => m.caminhaoId == c.id);
    const fins = S.financiamentos.filter(f => f.caminhaoId == c.id);
    const receita = fts.reduce((a, b) => a + (b.valorBruto||0), 0);
    const custoOper = fts.reduce((a, b) => a + (b.custoDiesel||0) + (b.custoVariavel||0) + (b.impostos||0) + (b.comissao||0) + (b.pedagio||0), 0);
    const custoMot = fts.reduce((a, b) => a + (b.custoMotorista||0), 0);
    const customan = mans.reduce((a, b) => a + (b.valor||0), 0);
    const custofin = fins.reduce((a, b) => a + ((b.qtd - b.pagas) * b.parcela), 0);
    const km = fts.reduce((a, b) => a + (b.kmT||0), 0);
    const lucro = receita - custoOper - custoMot - customan;
    const mot = S.motoristas.find(m => m.id == c.motoristaId);
    return { placa: c.placa, modelo: c.modelo, motorista: mot ? mot.nome : '—', qtd: fts.length, km, receita, custoOper: custoOper + custoMot, customan, custofin, lucro };
  });
  
  if (!stats.length) { tbody.innerHTML = '<tr><td colspan="10" class="empty-st">Nenhum veículo cadastrado.</td></tr>'; return; }
  tbody.innerHTML = stats.map(s => `<tr>
    <td><strong>${s.placa}</strong><br><small>${s.modelo}</small></td>
    <td><small>${s.motorista}</small></td>
    <td>${s.qtd}</td>
    <td>${s.km.toLocaleString('pt-BR')} km</td>
    <td>R$ ${s.receita.toFixed(2)}</td>
    <td>R$ ${s.custoOper.toFixed(2)}</td>
    <td style="color:var(--danger)">R$ ${s.customan.toFixed(2)}</td>
    <td style="color:var(--warning)">R$ ${s.custofin.toFixed(2)}</td>
    <td style="color:${s.lucro > 0 ? 'var(--success)' : 'var(--danger)'}"><strong>R$ ${s.lucro.toFixed(2)}</strong></td>
    <td>${s.km > 0 ? 'R$ '+(s.lucro/s.km).toFixed(3) : '—'}</td>
  </tr>`).join('');
}

// ============ DASHBOARD ============
function renderDashboardCharts() {
  if (typeof Chart === 'undefined') return;
  const fatCanvas = document.getElementById('chart-faturamento');
  const custosCanvas = document.getElementById('chart-custos');
  if (!fatCanvas || !custosCanvas) return;
  const agora = new Date();
  const labels = [];
  const receitas = [];
  const lucros = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    labels.push(d.toLocaleDateString('pt-BR', { month: 'short' }));
    const fretes = S.fretes.filter(f => isSameMonth(f.dataEmissao, d.getMonth(), d.getFullYear()));
    receitas.push(fretes.reduce((a, b) => a + (b.valorBruto || 0), 0));
    lucros.push(fretes.reduce((a, b) => a + (b.lucroLiquido || 0), 0));
  }
  if (charts.faturamento) charts.faturamento.destroy();
  charts.faturamento = new Chart(fatCanvas, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Faturamento', data: receitas, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.12)', tension: .35, fill: true },
      { label: 'Lucro', data: lucros, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.10)', tension: .35, fill: true }
    ] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR') } } } }
  });

  const mes = agora.getMonth(), ano = agora.getFullYear();
  const fretesMes = S.fretes.filter(f => isSameMonth(f.dataEmissao, mes, ano));
  const custos = {
    Diesel: fretesMes.reduce((a, b) => a + (b.custoDiesel || 0), 0),
    Motoristas: fretesMes.reduce((a, b) => a + (b.custoMotorista || 0), 0),
    Pedágios: fretesMes.reduce((a, b) => a + (b.pedagio || 0), 0),
    Manutenção: S.manutencoes.filter(m => isSameMonth(m.data, mes, ano)).reduce((a, b) => a + (b.valor || 0), 0),
    Contas: S.contasPagar.filter(c => c.status === 'Pago' && isSameMonth(c.dataPagamento || c.vencimento, mes, ano)).reduce((a, b) => a + (b.valor || 0), 0)
  };
  if (charts.custos) charts.custos.destroy();
  charts.custos = new Chart(custosCanvas, {
    type: 'doughnut',
    data: { labels: Object.keys(custos), datasets: [{ data: Object.values(custos), backgroundColor: ['#2563eb','#10b981','#f59e0b','#ef4444','#64748b'] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

function updDash() {
  const agora = new Date();
  const mes = agora.getMonth(), ano = agora.getFullYear();
  const fretesMes = S.fretes.filter(f => { const d = new Date(f.dataEmissao); return d.getMonth() === mes && d.getFullYear() === ano; });
  
  const faturamento = fretesMes.reduce((a, b) => a + (b.valorBruto||0), 0);
  const lucro = fretesMes.reduce((a, b) => a + (b.lucroLiquido||0), 0);
  const impostos = fretesMes.reduce((a, b) => a + (b.impostos||0), 0);
  const comissao = fretesMes.reduce((a, b) => a + (b.comissao||0), 0);
  const pedagio = fretesMes.reduce((a, b) => a + (b.pedagio||0), 0);
  const recLiq = faturamento - impostos - comissao - pedagio;
  const kmT = fretesMes.reduce((a, b) => a + (b.kmT||0), 0);
  const kmC = fretesMes.reduce((a, b) => a + (b.kmC||0), 0);
  const kmV = fretesMes.reduce((a, b) => a + (b.kmVC||0) + (b.kmVD||0), 0);
  const receber = S.fretes.filter(f => f.statusReceb !== 'Recebido').reduce((a, b) => a + (b.valorBruto||0), 0);
  const recebidoMes = fretesMes.filter(f => f.statusReceb === 'Recebido').reduce((a, b) => a + (b.valorBruto||0), 0);
  const custoTotal = fretesMes.reduce((a, b) => a + (b.custoTotal||0), 0);
  const ticket = fretesMes.length > 0 ? faturamento / fretesMes.length : 0;
  
  const fmt = (v, d=2) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: d });
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  
  el('top-faturamento', fmt(faturamento)); el('top-lucro', fmt(lucro)); el('top-receber', fmt(receber));
  el('dash-faturamento', fmt(faturamento)); el('dash-faturamento-qtd', fretesMes.length + ' fretes realizados');
  el('dash-rec-liq', fmt(recLiq));
  el('dash-lucro', fmt(lucro));
  el('dash-lucro-km', kmC > 0 ? fmt(lucro/kmC) + '/km' : 'R$ 0,00/km');
  el('dash-margem', 'Margem média: ' + (faturamento > 0 ? (lucro/faturamento*100).toFixed(1) : 0) + '%');
  el('dash-receber', fmt(receber));
  el('dash-atrasados', S.fretes.filter(f => f.statusReceb !== 'Recebido').length + ' faturas pendentes');
  el('dash-km-total', kmT.toLocaleString('pt-BR') + ' km');
  el('dash-vazio', (kmT > 0 ? (kmV/kmT*100).toFixed(1) : 0) + '% km vazio');
  el('dash-rec-km', kmC > 0 ? fmt(faturamento/kmC) : 'R$ 0,00');
  el('dash-custo-km', kmT > 0 ? fmt(custoTotal/kmT) : 'R$ 0,00');
  el('dash-ticket', fmt(ticket));
  
  // Receber page update
  const recPend = document.getElementById('rec-total-pendente');
  if (recPend) renderReceber();
  
  // Tabelas Dashboard
  const tbRec = document.getElementById('tb-recent');
  if (tbRec) {
    tbRec.innerHTML = S.fretes.slice(0, 6).map(f => {
      const cli = S.clientes.find(c => c.id == f.clienteId);
      const badge = {Recebido:'badge-success',Pendente:'badge-warning',Atrasado:'badge-danger',Faturado:'badge-info'}[f.statusReceb]||'badge-muted';
      return `<tr><td><strong>${cli ? cli.nome : 'N/A'}</strong><br><small>${f.origem||''} → ${f.destino||''}</small></td><td>${f.dataEmissao||''}</td><td style="color:${(f.lucroLiquido||0) > 0 ? 'var(--success)' : 'var(--danger)'}">R$ ${(f.lucroLiquido||0).toFixed(2)}</td><td><span class="badge ${badge}">${f.statusReceb}</span></td></tr>`;
    }).join('');
    
    const rankCam = document.getElementById('tb-rank-caminhao');
    if (rankCam) {
      const camStats = S.caminhoes.map(c => {
        const fts = S.fretes.filter(f => f.caminhaoId == c.id);
        return { placa: c.placa, qtd: fts.length, km: fts.reduce((a,b)=>a+(b.kmT||0),0), lucro: fts.reduce((a,b)=>a+(b.lucroLiquido||0),0) };
      }).sort((a, b) => b.lucro - a.lucro);
      rankCam.innerHTML = camStats.map(s => `<tr><td><strong>${s.placa}</strong></td><td>${s.qtd}</td><td>${s.km.toLocaleString('pt-BR')} km</td><td style="color:${s.lucro>=0?'var(--success)':'var(--danger)'}">R$ ${s.lucro.toFixed(2)}</td></tr>`).join('');
    }
  }
  renderDashboardCharts();
}

// ============ ASSISTENTE IA ============
function askIA(msg) {
  document.getElementById('chat-input').value = msg;
  sendMsg();
}

function sendMsg() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  
  const chat = document.getElementById('chat-msgs');
  chat.innerHTML += `<div style="margin-bottom:1rem;text-align:right"><span style="background:var(--accent);color:white;padding:.6rem 1rem;border-radius:12px;display:inline-block;max-width:80%">${msg}</span></div>`;
  input.value = '';
  chat.scrollTop = chat.scrollHeight;
  
  setTimeout(() => {
    const resp = analisarIA(msg.toLowerCase());
    chat.innerHTML += `<div style="margin-bottom:1rem"><span style="background:white;border:1px solid var(--border);padding:.7rem 1rem;border-radius:12px;display:inline-block;max-width:85%;line-height:1.6">${resp}</span></div>`;
    chat.scrollTop = chat.scrollHeight;
  }, 600);
}

function analisarIA(msg) {
  const fretes = S.fretes;
  const faturamento = fretes.reduce((a,b)=>a+(b.valorBruto||0),0);
  const lucro = fretes.reduce((a,b)=>a+(b.lucroLiquido||0),0);
  const margem = faturamento > 0 ? (lucro/faturamento*100).toFixed(1) : 0;
  const receber = fretes.filter(f=>f.statusReceb!=='Recebido').reduce((a,b)=>a+(b.valorBruto||0),0);
  const kmTotal = fretes.reduce((a,b)=>a+(b.kmT||0),0);
  const custoTotal = fretes.reduce((a,b)=>a+(b.custoTotal||0),0);
  
  if (msg.includes('melhor cliente') || msg.includes('top cliente')) {
    const stats = S.clientes.map(c => ({ nome: c.nome, lucro: fretes.filter(f=>f.clienteId==c.id).reduce((a,b)=>a+(b.lucroLiquido||0),0), qtd: fretes.filter(f=>f.clienteId==c.id).length })).sort((a,b)=>b.lucro-a.lucro);
    if (!stats.length || stats[0].qtd === 0) return '📊 Nenhum frete registrado ainda.';
    const top = stats.filter(s=>s.qtd>0)[0];
    return `🏆 <strong>Melhor cliente: ${top.nome}</strong><br>Lucro gerado: R$ ${top.lucro.toFixed(2)} | Fretes: ${top.qtd}`;
  }
  
  if (msg.includes('caminhão') && (msg.includes('lucrativo') || msg.includes('melhor'))) {
    const stats = S.caminhoes.map(c => ({ placa: c.placa, lucro: fretes.filter(f=>f.caminhaoId==c.id).reduce((a,b)=>a+(b.lucroLiquido||0),0) })).sort((a,b)=>b.lucro-a.lucro);
    if (!stats.length) return '🚛 Nenhum veículo cadastrado.';
    return `🚛 <strong>Caminhão mais lucrativo: ${stats[0].placa}</strong><br>Lucro total: R$ ${stats[0].lucro.toFixed(2)}`;
  }
  
  if (msg.includes('rota') && (msg.includes('lucro') || msg.includes('melhor'))) {
    const mapa = {};
    fretes.forEach(f => { const k = `${f.origem||''}→${f.destino||''}`; if (!mapa[k]) mapa[k]={k,l:0}; mapa[k].l+=(f.lucroLiquido||0); });
    const top = Object.values(mapa).sort((a,b)=>b.l-a.l)[0];
    if (!top) return '🗺️ Nenhuma rota registrada.';
    return `🗺️ <strong>Rota mais lucrativa: ${top.k}</strong><br>Lucro acumulado: R$ ${top.l.toFixed(2)}`;
  }
  
  if (msg.includes('receber') || msg.includes('recebimento')) {
    const atrasados = fretes.filter(f=>f.statusReceb!=='Recebido'&&f.dataVenc&&new Date(f.dataVenc)<new Date()).length;
    return `💰 <strong>A Receber:</strong> R$ ${receber.toLocaleString('pt-BR', {minimumFractionDigits:2})}<br>Faturas em aberto: ${fretes.filter(f=>f.statusReceb!=='Recebido').length} | Atrasadas: ${atrasados}`;
  }

  if (msg.includes('pagar') || msg.includes('despesa')) {
    const aberto = S.contasPagar.filter(c=>c.status!=='Pago').reduce((a,b)=>a+(b.valor||0),0);
    const vencidas = S.contasPagar.filter(c=>c.status==='Vencido').reduce((a,b)=>a+(b.valor||0),0);
    return `💸 <strong>A Pagar:</strong> R$ ${aberto.toLocaleString('pt-BR', {minimumFractionDigits:2})}<br>Contas abertas: ${S.contasPagar.filter(c=>c.status!=='Pago').length} | Vencidas: R$ ${vencidas.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
  }

  if (msg.includes('folha')) {
    const agora = new Date();
    const itens = S.motoristas.filter(m=>m.ativo!==false).map(m=>calcularFolhaMotorista(m, agora.getMonth(), agora.getFullYear()));
    const prevista = itens.reduce((a,b)=>a+b.bruto,0);
    const aberto = itens.reduce((a,b)=>a+b.aberto,0);
    return `👤 <strong>Folha do mês:</strong> R$ ${prevista.toLocaleString('pt-BR', {minimumFractionDigits:2})}<br>Em aberto: R$ ${aberto.toLocaleString('pt-BR', {minimumFractionDigits:2})} | Motoristas ativos: ${itens.length}`;
  }
  
  if (msg.includes('margem')) {
    return `📈 <strong>Margem média: ${margem}%</strong><br>${margem < 15 ? '⚠️ Atenção: abaixo do ideal (20%). Verifique seus custos.' : margem > 25 ? '✅ Excelente! Sua operação está muito saudável.' : '✅ Margem saudável para o setor.'}`;
  }
  
  if (msg.includes('custo') && msg.includes('km')) {
    const cKm = kmTotal > 0 ? (custoTotal/kmTotal).toFixed(3) : 0;
    return `⚙️ <strong>Custo médio por KM: R$ ${cKm}</strong><br>KM total rodado: ${kmTotal.toLocaleString('pt-BR')} | Custo total: R$ ${custoTotal.toFixed(2)}`;
  }
  
  if (msg.includes('manutenção') || msg.includes('manutencao')) {
    const stats = S.caminhoes.map(c => ({ placa: c.placa, total: S.manutencoes.filter(m=>m.caminhaoId==c.id).reduce((a,b)=>a+(b.valor||0),0) })).sort((a,b)=>b.total-a.total);
    if (!stats.length || stats[0].total === 0) return '🔧 Nenhuma manutenção registrada.';
    return `🔧 <strong>Maior custo de manutenção: ${stats[0].placa}</strong><br>Total gasto: R$ ${stats[0].total.toFixed(2)}`;
  }
  
  if (msg.includes('motorista')) {
    const stats = S.motoristas.map(m => ({ nome: m.nome, custo: fretes.filter(f=>f.motoristaId==m.id).reduce((a,b)=>a+(b.custoMotorista||0),0) })).sort((a,b)=>b.custo-a.custo);
    if (!stats.length || stats[0].custo === 0) return '👤 Nenhum dado de motoristas ainda.';
    return `👤 <strong>Motorista de maior custo: ${stats[0].nome}</strong><br>Custo acumulado: R$ ${stats[0].custo.toFixed(2)}`;
  }
  
  // Análise geral
  return `📊 <strong>Resumo da Operação Leo & Leo:</strong><br>
    • Faturamento total: <strong>R$ ${faturamento.toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong><br>
    • Lucro líquido: <strong>R$ ${lucro.toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong><br>
    • Margem média: <strong>${margem}%</strong><br>
    • A receber: <strong>R$ ${receber.toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong><br>
    • KM total: <strong>${kmTotal.toLocaleString('pt-BR')} km</strong><br>
    • Fretes: <strong>${fretes.length}</strong> | Caminhões: <strong>${S.caminhoes.length}</strong> | Motoristas: <strong>${S.motoristas.length}</strong><br><br>
    Pergunte sobre: cliente, rota, caminhão, margem, custo/km, receber, manutenção`;
}

// ============ RENDER ALL ============
function renderAll() {
  renderFixedCosts();
  renderClientes();
  renderCaminhoes();
  renderMotoristas();
  renderManutencoes();
  renderManutencaoStats();
  renderCombustivel();
  renderPneus();
  renderContasPagar();
  renderFolhaMotoristas();
  renderFinanciamentos();
  renderFretes();
}

// ============ BACKUP / RESTAURAÇÃO ============
function exportarBackupJSON() {
  const data = JSON.stringify(S, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `backup_leoleo_${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('Backup exportado com sucesso!', 'success');
}

function importarBackup() {
  const file = document.getElementById('backup-file').files[0];
  if (!file) { toast('Selecione um arquivo de backup!', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      S = JSON.parse(e.target.result);
      save(); renderAll(); atualizarSelects(); updDash();
      toast('Backup restaurado com sucesso!', 'success');
    } catch(err) { toast('Arquivo inválido!', 'error'); }
  };
  reader.readAsText(file);
}

function exportarRelatorio(tipo) {
  let csv = '', rows = [], headers = [];
  if (tipo === 'fretes') {
    headers = ['ID','Cliente','Motorista','Caminhão','Origem','Destino','KM Carregado','KM Total','Valor Bruto','Lucro Líquido','Margem%','Status','Data Emissão','Data Venc','NF'];
    rows = S.fretes.map(f => {
      const cli = S.clientes.find(c=>c.id==f.clienteId); const mot = S.motoristas.find(m=>m.id==f.motoristaId); const cam = S.caminhoes.find(c=>c.id==f.caminhaoId);
      const margem = f.valorBruto > 0 ? (f.lucroLiquido/f.valorBruto*100).toFixed(1) : 0;
      return [f.id, cli?cli.nome:'N/A', mot?mot.nome:'—', cam?cam.placa:'—', f.origem, f.destino, f.kmC, f.kmT, f.valorBruto?.toFixed(2), f.lucroLiquido?.toFixed(2), margem, f.statusReceb, f.dataEmissao, f.dataVenc, f.nf||''];
    });
  } else if (tipo === 'clientes') {
    headers = ['ID','Nome','Empresa','Telefone','Cidade','Estado','Ativo'];
    rows = S.clientes.map(c => [c.id, c.nome, c.empresa, c.telefone, c.cidade, c.estado, c.ativo!==false?'Sim':'Não']);
  } else if (tipo === 'manutencoes') {
    headers = ['ID','Veículo','Tipo','Data','KM','Valor','Descrição'];
    rows = S.manutencoes.map(m => { const c=S.caminhoes.find(x=>x.id==m.caminhaoId); return [m.id, c?c.placa:'N/A', m.tipo, m.data, m.km, m.valor?.toFixed(2), m.desc]; });
  } else if (tipo === 'motoristas') {
    headers = ['ID','Nome','CPF','Telefone','Tipo','Salário','Comissão%','Admissão','Ativo'];
    rows = S.motoristas.map(m => [m.id, m.nome, m.cpf, m.telefone, m.tipo, m.salario, m.comissao, m.admissao, m.ativo!==false?'Sim':'Não']);
  } else if (tipo === 'contas_pagar') {
    headers = ['ID','Descrição','Categoria','Vencimento','Valor','Status','Data Pagamento','Observações'];
    rows = S.contasPagar.map(c => [c.id, c.desc, c.categoria, c.vencimento, c.valor?.toFixed(2), c.status, c.dataPagamento, c.obs]);
  } else if (tipo === 'folha') {
    const mes = document.getElementById('folha-mes') ? parseInt(document.getElementById('folha-mes').value) : new Date().getMonth();
    const ano = document.getElementById('folha-ano') ? parseInt(document.getElementById('folha-ano').value) : new Date().getFullYear();
    headers = ['Motorista','Fretes','KM','Receita','Lucro','Fixo','Comissão','Total','Pago','Em Aberto','Competência'];
    rows = S.motoristas.filter(m => m.ativo !== false).map(m => {
      const f = calcularFolhaMotorista(m, mes, ano);
      return [m.nome, f.fretes, f.km, f.receita.toFixed(2), f.lucro.toFixed(2), f.fixo.toFixed(2), f.comissao.toFixed(2), f.bruto.toFixed(2), f.pago.toFixed(2), f.aberto.toFixed(2), `${String(mes + 1).padStart(2,'0')}/${ano}`];
    });
  }
  csv = [headers, ...rows].map(r => r.map(v => `"${(v||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=`${tipo}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast(`Relatório de ${tipo} exportado!`, 'success');
}

function limparTodosDados() {
  confirmAction('<strong>ATENÇÃO:</strong> Esta ação irá apagar TODOS os dados do sistema permanentemente. Esta operação não pode ser desfeita!', () => {
    S = { config: { diesel:6, media:2.5, arla:0.15, manut:0.50, kmMes:10000, impostos:{percentual:6}, fixos:[{n:'Seguro/Rastreamento',v:1800},{n:'IPVA/Licenciamento',v:800}] }, fretes:[], caminhoes:[], motoristas:[], manutencoes:[], financiamentos:[], clientes:[], combustiveis:[], pneus:[], contasPagar:[], pagamentosMotoristas:[] };
    save(); renderAll(); atualizarSelects(); updDash();
    toast('Sistema resetado!', 'warning');
  });
}

