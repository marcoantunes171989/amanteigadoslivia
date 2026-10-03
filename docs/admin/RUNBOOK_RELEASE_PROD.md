# Runbook — Release de Produção (Vercel)

Escopo: promoção controlada de um SHA validado em homologação para o projeto PROD da Vercel.
Rollback é **manual**. O sistema nunca reverte automaticamente.

## 1. Configuração obrigatória (servidor)

| Env | Função |
| --- | --- |
| `PROMOCAO_PROD_HABILITADA` | `true` libera o fluxo. Qualquer outro valor bloqueia antes de qualquer chamada. |
| `VERCEL_RELEASE_TOKEN` | Token de API. Nunca logado nem devolvido. |
| `VERCEL_TEAM_ID` | Team Vercel. |
| `VERCEL_PROD_PROJECT_ID` | ID do projeto PROD (recomendado). |
| `VERCEL_PROD_PROJECT_NAME` | Nome do projeto PROD. Não pode ser o projeto HML. |
| `VERCEL_PROD_DOMAIN` | Hostname PROD esperado, sem protocolo (ex.: `loja.exemplo.com.br`). Sem ele o release fica bloqueado. |
| `VERCEL_RELEASE_GIT_OWNER` / `VERCEL_RELEASE_GIT_REPO` | Repositório de origem do deployment. |

Quando o release **não** pode prosseguir por configuração, nenhum POST é enviado.

## 2. Estados de `app.tab_publicacao` relevantes

| `status_publicacao` | Significado | Bloqueia novo release do mesmo SHA? |
| --- | --- | --- |
| `EM_EXECUCAO` | Reserva feita antes do POST. Release em curso ou interrompido. | **Sim** |
| `PUBLICADA` | Deployment READY e verificado pós-release (alias, projeto, SHA, target). | **Sim** |
| `ERRO` com `resumo_json.release.post_sent = true` | POST enviado; o deployment pode existir remotamente. | **Sim** (conciliar antes) |
| `ERRO` com `post_sent = false` | Falha antes do POST. | Não |
| `BLOQUEADA` | Bloqueio antes do POST. | Não |

`resumo_json.release` guarda: `state`, `deployment_id`, `previous_production_deployment_id`, `post_sent`, `post_verify`, `rollback`.

## 3. Fluxo do release

1. Reserva transacional por SHA (`pg_advisory_xact_lock`) e `EM_EXECUCAO` commitado.
2. Preflight read-only do projeto (GET). Falha ou projeto divergente: BLOQUEADA, sem POST.
3. Identificação read-only do deployment PROD atual (`previous_production_deployment_id`). Não identificável: BLOQUEADA, sem POST.
4. POST com `target = "production"` e SHA exato.
5. Polling até READY, ERROR, CANCELED ou timeout.
6. Verificação pós-release read-only: READY, target, SHA, projeto e alias contendo `VERCEL_PROD_DOMAIN`.
7. Somente com o passo 6 aprovado: `PUBLICADA`.

## 4. Recuperação pós-deployment (ROLLBACK_MANUAL_REQUIRED)

Aparece quando o POST foi enviado e o resultado não foi confirmado como `PUBLICADA` (verificação pós-release falhou, timeout, READY sem verificação, ou resultado desconhecido).

1. Localizar a linha em `app.tab_publicacao` com `status_publicacao = 'ERRO'` e `resumo_json->'release'->>'rollback' = 'ROLLBACK_MANUAL_REQUIRED'`.
2. Registrar `deployment_id` (novo) e `previous_production_deployment_id` (anterior, pode estar ausente).
3. Na Vercel, conferir o deployment de produção atual (painel ou leitura da API). Se o novo deployment estiver servindo produção indevidamente:
   - promover manualmente o `previous_production_deployment_id` no painel Vercel;
   - se o anterior for `null` (primeiro release), decidir o procedimento com quem for responsável pelo projeto. Não há alvo automático.
4. Validar a produção após a reversão (URL pública e alias `VERCEL_PROD_DOMAIN`).
5. Registrar a ação em `tab_auditoria` com motivo e identificadores.

Nenhuma etapa é executada pelo sistema. Não há rollback automático.

## 5. Conciliação de `EM_EXECUCAO` e de `ERRO` com `post_sent = true`

Essas linhas bloqueiam o SHA de propósito. Antes de liberar nova tentativa:

1. Confirmar na Vercel o estado real dos deployments associados ao SHA.
2. Decidir o desfecho: o release foi concluído, falhou ou não existiu.
3. Atualizar a linha com registro da decisão. Qualquer correção deve ser feita por operador, com revisão, e não por rotina automática.

Ao registrar o desfecho, mantenha `resumo_json.release` íntegro e acrescente o motivo da conciliação. Não apague a linha.

## 6. Pendências de validação real (não comprovadas offline)

- Semântica do campo `alias` em deployments de **produção** (o contrato comprovado foi o de preview).
- Endpoint e formato do deployment PROD atual (`GET /v6/deployments?target=production&state=READY`).

Antes de qualquer release PROD real, executar uma validação controlada em ambiente aprovado e registrar o resultado aqui.
