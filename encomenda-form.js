(function () {
  const form = document.getElementById('encomendaForm');
  if (!form) return;

  const success = document.getElementById('encomendaSuccess');
  const wa = document.getElementById('encomendaWhatsApp');
  const submit = document.getElementById('encomendaSubmit');

  function showError(name, message) {
    const node = form.querySelector(`.field-error[data-for="${name}"]`);
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || '';
  }

  function clearErrors() {
    form.querySelectorAll('.field-error').forEach((node) => {
      node.hidden = true;
      node.textContent = '';
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    if (success) success.hidden = true;
    if (wa) wa.hidden = true;
    submit.disabled = true;
    const payload = {
      nome_cliente: document.getElementById('encomendaNome').value,
      telefone_cliente: document.getElementById('encomendaTelefone').value,
      email_cliente: document.getElementById('encomendaEmail').value,
      tipo_solicitacao: document.getElementById('encomendaTipo').value,
      data_evento: document.getElementById('encomendaData').value || null,
      quantidade_estimada: document.getElementById('encomendaQtd').value || null,
      descricao_pedido: document.getElementById('encomendaDescricao').value,
    };
    try {
      const response = await fetch('/api/encomendas', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.message || 'Não foi possível enviar a solicitação.';
        if (/nome/i.test(message)) showError('nome', message);
        else if (/whatsapp|telefone/i.test(message)) showError('telefone', message);
        else if (/e-mail|email/i.test(message)) showError('email', message);
        else if (/tipo/i.test(message)) showError('tipo', message);
        else if (/data/i.test(message)) showError('data', message);
        else if (/quantidade/i.test(message)) showError('quantidade', message);
        else showError('descricao', message);
        return;
      }
      if (success) {
        success.hidden = false;
        success.textContent = 'Recebemos sua solicitação. Em breve falamos com você.';
      }
      const phone = window.AmanteigadosWhatsApp?.phone || window.AmanteigadosSite?.get?.()?.configuracao?.whatsapp_telefone;
      if (wa && phone) {
        const text = [
          'Olá! Acabei de enviar uma solicitação pelo site e gostaria de continuar pelo WhatsApp.',
          '',
          `Nome: ${payload.nome_cliente}`,
          `Tipo: ${payload.tipo_solicitacao}`,
          payload.data_evento ? `Data do evento: ${payload.data_evento}` : '',
          payload.quantidade_estimada ? `Quantidade estimada: ${payload.quantidade_estimada}` : '',
          '',
          'Pedido:',
          payload.descricao_pedido,
        ].filter(Boolean).join('\n');
        wa.href = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
        wa.hidden = false;
      }
      form.reset();
    } catch {
      showError('descricao', 'Não foi possível enviar a solicitação agora. Tente novamente.');
    } finally {
      submit.disabled = false;
    }
  });
})();
