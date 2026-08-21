# Histórico do projeto — Saldaterra

Este arquivo documenta a arquitetura do sistema e o histórico de implantação em produção, para servir de referência rápida ao abrir o projeto no VS Code.

---

## Início rápido (rodar localmente no VS Code)

```powershell
# 1. Instalar dependências (só na primeira vez ou após mudanças no package.json)
npm install

# 2. Rodar em modo desenvolvimento (reinicia sozinho ao salvar arquivos)
npm run dev

# ou rodar em modo produção local
npm start
```

Isso executa `start.ps1`, que mata processos `node` antigos e sobe `src/server.js` na porta 3000.

Na primeira execução (ou se a sessão expirar), o terminal mostra um QR Code — escaneie com o WhatsApp que será o número do bot (Configurações → Aparelhos conectados → Conectar um aparelho). A sessão fica salva em `data/auth_info/` (não versionada, ver `.gitignore`).

Verificação rápida:
```
GET http://localhost:3000/health  →  { "status": "ok" }
```

---

## Arquitetura

```
Usuário (WhatsApp)
       ↓
Baileys / whaileys (src/whatsapp-client.js)  — conexão WhatsApp via QR Code
       ↓  evento messages.upsert
Servidor Express (src/server.js)             — roteia por perfil (admin / líder / visitante)
       ↓
Agente Claude — Anthropic API (src/claude.js)
  ├─ Atendimento dos Pequenos Grupos (PG) Sal da Terra (src/agents/luz-ia.js) — atende visitante novo, coleta dados, indica PG
  └─ PG Visitante Acolhedor (src/agents/pg-visitante.js) — conversa com líder, atualiza status
       ↓
Supabase (src/supabase.js)                   — LISTA_ACIONAMENTOS + LISTA_PGS
       ↓
Baileys (src/whatsapp.js)                    — envia resposta (texto, botões, listas, polls)
       ↓
Usuário (WhatsApp)
```

**Outros módulos importantes:**
- `src/scheduler.js` — lembretes diários automáticos para líderes com visitantes pendentes (roda 1x/dia, verifica a cada hora, só envia entre 08h–20h horário de São Paulo).
- `src/redirecionamento.js` — quando um líder não atende, busca o próximo PG mais adequado e redireciona o visitante.
- `src/admin.js` — relatórios via WhatsApp para números administradores.
- `src/conversation.js` — histórico de conversa em memória, por telefone.
- `src/msg-logger.js` — log diário de interações com líderes em `logs/`.

Documentação funcional completa (fluxos, perfis, marcadores do líder, endpoints) está no `README.md`.

### Dashboard web (`web/`)

Sub-projeto separado — React + Vite + Tailwind + Recharts, publicado no Netlify (`netlify.toml`, base `web`, deploy automático a cada push em `main`). Fala **direto com o Supabase** pelo navegador (`web/.env`, `VITE_SUPABASE_URL`/`VITE_SUPABASE_KEY`), sem passar pelo servidor Node do bot.

- `web/src/pages/Login.jsx` — autenticação simples via `sessionStorage`.
- `web/src/pages/Dashboard.jsx` — KPIs e gráficos sobre `LISTA_ACIONAMENTOS` (funil de conversão, status, líderes com mais pendências/conversões, cadastros por dia).
- `web/src/pages/PGs.jsx` — CRUD de `LISTA_PGS` (tabela editável).
- `web/src/components/SemaforoBot.jsx` + `web/src/hooks/useBotStatus.js` — indicador de status do bot (ver seção "Semáforo de status" abaixo), compartilhado entre Dashboard e PGs.

URL de produção: https://saldaterra.netlify.app

---

## Produção

O bot roda 24/7 numa VPS, **não** em um serviço cloud gerenciado (sem Docker/Railway/Netlify — o `netlify.toml` do repo é de um sub-projeto estático em `web/`, não do bot).

| Item | Valor |
|---|---|
| Host | `195.35.42.24` (hostname `altabot`) — VPS **compartilhada** com outros serviços (n8n, containers docker) |
| Diretório | `/home/ubuntu/saldaterra` |
| Usuário do processo | `ubuntu` (não `root` — a chave de deploy do GitHub também está configurada só para o usuário `ubuntu`) |
| Gerenciador de processo | PM2, processo `saldaterra` |
| Boot automático | serviço systemd `pm2-ubuntu` (criado via `pm2 startup`), habilitado — o bot volta sozinho se a VPS reiniciar |
| Acesso SSH | `ssh saldaterra-vps` (alias configurado em `~/.ssh/config` desta máquina, chave `id_ed25519_saldaterra_deploy`) |

### Comandos úteis na VPS

```bash
# Conectar
ssh saldaterra-vps

# Ver status do processo
sudo -iu ubuntu pm2 list

# Ver logs
sudo -iu ubuntu pm2 logs saldaterra --lines 50 --nostream

# Reiniciar
sudo -iu ubuntu pm2 restart saldaterra
```

### Fluxo de deploy (atualizar produção)

```bash
ssh saldaterra-vps "sudo -iu ubuntu bash -c 'cd /home/ubuntu/saldaterra && git pull origin main && npm install && pm2 restart saldaterra'"
```

`npm install` só é necessário se `package-lock.json` mudou.

### Reconectar o WhatsApp (se a sessão cair — erro 401 "logged out" nos logs)

Não existe fluxo automático de reconexão headless pronto no projeto; o processo usado na implantação de 2026-07-30 foi:

1. Parar o processo: `sudo -iu ubuntu pm2 stop saldaterra`
2. Renomear (não apagar) a sessão inválida: `mv data/auth_info data/auth_info_expired_<timestamp>`
3. Rodar um script avulso baseado em `useMultiFileAuthState` + `qrcode` (pacote `qrcode`, instalar com `npm install qrcode --no-save` se não estiver presente) que salva o QR Code como PNG (`QRCode.toFile('qr.png', qr)`) em vez de tentar imprimir ASCII no terminal remoto.
4. Baixar o PNG para a máquina local (`scp`) e abrir para escanear.
5. **Importante:** aguardar o evento `creds.update` terminar de gravar (`await saveCreds(...)`) antes de dar `process.exit(0)` no script avulso — sair cedo demais deixa `creds.json` truncado (0 bytes) e a sessão não persiste.
6. Apagar o script avulso, `pm2 restart saldaterra`, `pm2 save`.

### Semáforo de status do bot

O bot escreve um "heartbeat" na tabela `bot_status` do Supabase (criada manualmente via SQL Editor, não há migration no repo):

```sql
create table if not exists bot_status (
  id text primary key,
  status text not null default 'ativo',
  detalhe text,
  updated_at timestamptz not null default now()
);
insert into bot_status (id, status) values ('saldaterra', 'ativo') on conflict (id) do nothing;
```

- Backend (`src/supabase.js` → `atualizarStatusBot()`, chamado de `src/whatsapp-client.js`): grava `status='ativo'` ao conectar, `status='problema'` (com `detalhe`) ao desconectar/perder sessão/aguardar QR, e um heartbeat de segurança a cada 60s independente dos eventos (se o processo travar sem disparar `connection.update`, o `updated_at` para de avançar).
- Frontend (`web/src/hooks/useBotStatus.js` + `web/src/components/SemaforoBot.jsx`): lê a linha a cada 30s e calcula a cor:
  - 🟢 verde — `status='ativo'` e heartbeat recente
  - 🟡 amarelo — `status='problema'` mas processo ainda respondendo (heartbeat recente)
  - 🔴 vermelho — sem heartbeat há mais de 3 minutos (processo parado/VPS fora do ar)
- Aparece no header do Dashboard e da página de PGs, antes do botão "Atualizar" (↺).

---

## Histórico de implantação — 2026-07-30

Primeira implantação real em produção (VPS), a partir de um estado onde o bot só tinha rodado localmente.

1. **Limpeza de segurança:** removida uma pasta de sessão antiga do WhatsApp (`data/auth_info_old_removed_*` local e `data/auth_info_expired_*` na VPS) que continha chaves privadas e não estava coberta pelo `.gitignore` — risco de vazamento se alguém rodasse `git add .`.
2. **Correção do lockfile:** `package-lock.json` tinha uma dependência resolvida para um caminho local (`../learn_claude_code/whaileys`) que só existia na máquina de desenvolvimento — quebraria `npm install` em qualquer outro ambiente. Regenerado do zero.
3. **Deploy do código:** commit `e20cc5a` — ajustes no scheduler (janela de envio 08h–20h, textos de botão) — enviado ao GitHub e implantado na VPS via `git pull` + `npm install`.
4. **Setup de processo:** bot subido com PM2 e configurado para reiniciar no boot via systemd (`pm2 startup`).
5. **Sessão do WhatsApp expirada (401):** a sessão salva na VPS estava deslogada. Reconectada via novo QR Code (processo descrito acima).
6. **Bug encontrado — contatos `@lid`:** WhatsApp identifica contatos não sincronizados (ex: visitantes novos, que por definição não são contatos salvos) com um JID `@lid` em vez de `numero@s.whatsapp.net`. A função `toJid()` em `src/whatsapp.js` reconstruía o JID a partir dos dígitos do número, transformando um `@lid` válido num JID inválido — a mensagem "enviava com sucesso" (sem erro) mas nunca chegava. **Corrigido** (commit `92480df`): `toJid()` agora usa o JID como está se ele já contém `@`, em vez de tentar reconstruí-lo.
   - Identificação de admin/líder/visitante-já-cadastrado para contatos `@lid` continua limitada (esses fluxos comparam por número de telefone, e não há mapeamento lid→telefone disponível nesta versão do `whaileys`). Pendente para o futuro, se virar problema real.
7. **Endpoint de teste adicionado:** `GET/POST /admin/mensagem/:telefone` (commits `66d324c`, `be5761b`) — envia uma mensagem de texto avulsa via `sendTextComFallback`, útil para testar conectividade sem depender de dados de líder/visitante no Supabase.
8. Confirmado em produção: scheduler disparando lembretes diários para líderes, mensagens sendo recebidas e respondidas corretamente (inclusive de contatos `@lid` após a correção).
9. **Semáforo de status do bot** (commit `4cea96a`): criada tabela `bot_status` no Supabase e implementado heartbeat (backend) + indicador colorido (frontend) no Dashboard — ver seção "Semáforo de status do bot" acima. Confirmado ao vivo: hash do bundle publicado no Netlify (`index-CTqG6Zfp.js`) idêntico ao build local, deploy automático funcionando.
10. **Semáforo também na página de PGs** (commit `3aebe21`): componente e hook extraídos para `web/src/components/SemaforoBot.jsx` e `web/src/hooks/useBotStatus.js`, reaproveitados nas duas páginas. Confirmado ao vivo (`index-69dcoYDm.js`).
