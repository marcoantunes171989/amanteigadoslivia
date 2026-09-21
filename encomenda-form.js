import {
  buildEncomendaWhatsAppMessage,
  isMobileWhatsAppClient,
  isSimpleEmail,
  maskBrDateInput,
  maskWhatsAppPtBr,
  minQuantidadeForTipo,
  parseBrDateToIso,
  QUANTIDADE_MINIMA_DEFAULT,
} from './ui-core.js';
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from './backend/src/whatsapp.js';

(function () {
  const form = document.getElementById('encomendaForm');
  if (!form) return;

  const success = document.getElementById('encomendaSuccess');
  const submit = document.getElementById('encomendaSubmit');
  const live = document.getElementById('encomendaLive');
  const nome = document.getElementById('encomendaNome');
  const telefone = document.getElementById('encomendaTelefone');
  const email = document.getElementById('encomendaEmail');
  const tipo = document.getElementById('encomendaTipo');
  const data = document.getElementById('encomendaData');
  const quantidade = document.getElementById('encomendaQtd');
  const quantidadeHint = document.getElementById('encomendaQtdHint');
  const descricao = document.getElementById('encomendaDescricao');
  const SENT_KEY = 'amanteigados_encomenda_enviada';

  function minimosAtuais() {
    return window.AmanteigadosSite?.get?.()?.configuracao?.quantidade_minima_solicitacao
      || QUANTIDADE_MINIMA_DEFAULT;
  }

  function minimoAtual() {
    return minQuantidadeForTipo(minimosAtuais(), tipo?.value);
  }

  function showError(name, message) {
    const field = form.querySelector(`[name="${name}"]`);
    const node = form.querySelector(`.field-error[data-for="${name}"]`);
    if (field) {
      field.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (node?.id) field.setAttribute('aria-describedby', node.id);
    }
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || '';
  }

  function clearErrors() {
    form.querySelectorAll('.field-error').forEach((node) => {
      node.hidden = true;
      node.textContent = '';
    });
    form.querySelectorAll('[aria-invalid]').forEach((node) => {
      node.setAttribute('aria-invalid', 'false');
    });
  }

  function setLive(message) {
    if (live) live.textContent = message || '';
  }

  function syncQuantidade() {
    const min = minimoAtual();
    if (!quantidade) return;
    quantidade.min = String(min);
    if (quantidadeHint) quantidadeHint.textContent = `Quantidade mínima: ${min}`;
  }

  function commercialPhone() {
    const raw = window.AmanteigadosWhatsApp?.phone
      || window.AmanteigadosSite?.get?.()?.configuracao?.whatsapp_telefone;
    return normalizeWhatsAppPhone(raw);
  }

  function validateClient() {
    const errors = {};
    if (!String(nome.value || '').trim()) errors.nome = 'Informe o nome.';
    const phoneDigits = normalizeWhatsAppPhone(telefone.value);
    if (!phoneDigits) errors.telefone = 'Informe um WhatsApp/telefone válido.';
    if (email.value && !isSimpleEmail(email.value)) errors.email = 'E-mail inválido.';
    if (!tipo.value) errors.tipo = 'Tipo de solicitação inválido.';
    if (data.value) {
      const iso = parseBrDateToIso(data.value);
      if (!iso) errors.data = 'Data do evento inválida.';
    }
    const qty = Number(quantidade.value);
    const min = minimoAtual();
    if (!Number.isInteger(qty) || qty < min) {
      errors.quantidade = `Quantidade mínima: ${min}`;
    }
    if (!String(descricao.value || '').trim()) errors.descricao = 'Conte-nos o que deseja.';
    return errors;
  }

  function openWhatsApp(url) {
    const mobile = isMobileWhatsAppClient(navigator.userAgent);
    if (mobile) {
      window.location.assign(url);
      return;
    }
    const popup = window.open(url, '_blank', 'noopener');
    if (!popup) window.location.assign(url);
  }

  function markSent(id) {
    try {
      sessionStorage.setItem(SENT_KEY, JSON.stringify({ id, at: Date.now() }));
    } catch {
      // session visual only
    }
  }

  function restoreSentState() {
    try {
      const raw = sessionStorage.getItem(SENT_KEY);
      if (!raw) return;
      if (success) {
        success.hidden = false;
        success.textContent = 'Solicitação enviada.';
      }
      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Solicitação enviada';
      }
      setLive('Solicitação enviada.');
    } catch {
      // ignore
    }
  }

  telefone?.addEventListener('input', () => {
    telefone.value = maskWhatsAppPtBr(telefone.value);
    if (telefone.getAttribute('aria-invalid') === 'true') showError('telefone', '');
  });

  data?.addEventListener('input', () => {
    data.value = maskBrDateInput(data.value);
    if (data.getAttribute('aria-invalid') === 'true' && parseBrDateToIso(data.value)) {
      showError('data', '');
    }
  });

  tipo?.addEventListener('change', syncQuantidade);
  quantidade?.addEventListener('input', () => {
    if (quantidade.getAttribute('aria-invalid') === 'true') {
      const qty = Number(quantidade.value);
      if (Number.isInteger(qty) && qty >= minimoAtual()) showError('quantidade', '');
    }
  });
  email?.addEventListener('input', () => {
    if (email.getAttribute('aria-invalid') === 'true' && isSimpleEmail(email.value)) {
      showError('email', '');
    }
  });
  [nome, descricao].forEach((node) => {
    node?.addEventListener('input', () => {
      const key = node === nome ? 'nome' : 'descricao';
      if (node.getAttribute('aria-invalid') === 'true' && String(node.value || '').trim()) {
        showError(key, '');
      }
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit?.disabled) return;
    clearErrors();
    if (success) success.hidden = true;
    const errors = validateClient();
    const firstError = Object.entries(errors)[0];
    if (firstError) {
      showError(firstError[0], firstError[1]);
      form.querySelector(`[name="${firstError[0]}"]`)?.focus();
      setLive(firstError[1]);
      return;
    }

    const isoDate = parseBrDateToIso(data.value);
    const payload = {
      nome_cliente: nome.value,
      telefone_cliente: telefone.value,
      email_cliente: email.value,
      tipo_solicitacao: tipo.value,
      data_evento: isoDate,
      quantidade_estimada: Number(quantidade.value),
      descricao_pedido: descricao.value,
    };

    submit.disabled = true;
    submit.textContent = 'Enviando...';
    setLive('Enviando...');

    try {
      const response = await fetch('/api/encomendas', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message = result?.message || 'Não foi possível enviar a solicitação.';
        if (/nome/i.test(message)) showError('nome', message);
        else if (/whatsapp|telefone/i.test(message)) showError('telefone', message);
        else if (/e-mail|email/i.test(message)) showError('email', message);
        else if (/tipo/i.test(message)) showError('tipo', message);
        else if (/data/i.test(message)) showError('data', message);
        else if (/quantidade/i.test(message)) showError('quantidade', message);
        else showError('descricao', message);
        setLive(message);
        submit.disabled = false;
        submit.textContent = 'Enviar pedido';
        return;
      }

      const phone = commercialPhone();
      if (!phone) {
        if (success) {
          success.hidden = false;
          success.textContent = 'Solicitação enviada. WhatsApp comercial indisponível no momento.';
        }
        setLive('WhatsApp comercial indisponível no momento.');
        markSent(result?.solicitacao?.id_solicitacao_encomenda);
        submit.textContent = 'Solicitação enviada';
        return;
      }

      const message = buildEncomendaWhatsAppMessage({
        nome: payload.nome_cliente,
        tipo: payload.tipo_solicitacao,
        telefone: maskWhatsAppPtBr(payload.telefone_cliente),
        email: String(payload.email_cliente || '').trim(),
        dataEvento: isoDate,
        quantidade: payload.quantidade_estimada,
        descricao: payload.descricao_pedido,
        solicitacaoId: result?.solicitacao?.id_solicitacao_encomenda,
      });
      const url = buildWhatsAppUrl(phone, message);
      if (!url) {
        if (success) {
          success.hidden = false;
          success.textContent = 'Solicitação enviada. WhatsApp comercial indisponível no momento.';
        }
        setLive('WhatsApp comercial indisponível no momento.');
        markSent(result?.solicitacao?.id_solicitacao_encomenda);
        submit.textContent = 'Solicitação enviada';
        return;
      }

      markSent(result?.solicitacao?.id_solicitacao_encomenda);
      if (success) {
        success.hidden = false;
        success.textContent = 'Solicitação enviada.';
      }
      setLive('Solicitação enviada.');
      submit.textContent = 'Solicitação enviada';
      openWhatsApp(url);
    } catch {
      showError('descricao', 'Não foi possível enviar a solicitação agora. Tente novamente.');
      setLive('Não foi possível enviar a solicitação agora. Tente novamente.');
      submit.disabled = false;
      submit.textContent = 'Enviar pedido';
    }
  });

  window.addEventListener('amanteigados:site-atualizado', syncQuantidade);
  syncQuantidade();
  restoreSentState();
})();
