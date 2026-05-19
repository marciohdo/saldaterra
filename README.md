# Saldaterra — Agentes de IA via WhatsApp

Agentes de inteligência artificial da Igreja Sal da Terra integrados ao WhatsApp via Baileys e Claude (Anthropic).

---

## Agentes disponíveis

| Agente | Função |
|---|---|
| **Luz.ia** | Atende visitantes, coleta dados e encontra o Pequeno Grupo (PG) ideal |
| **PG Visitante Acolhedor** | Conversa com líderes e atualiza o status de visitantes |

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) v18 ou superior
- Conta na [Anthropic](https://console.anthropic.com/) com API Key
- Projeto no [Supabase](https://supabase.com/) com as tabelas `LISTA_ACIONAMENTOS` e `LISTA_PGS`
- Celular com WhatsApp para escanear o QR Code na primeira execução

---

## Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/marciohdo/saldaterra.git
cd saldaterra

# 2. Instale as dependências
npm install
```

---

## Configuração

Crie o arquivo `.env` na raiz do projeto:

```env
# Servidor
PORT=3000

# Anthropic Claude
ANTHROPIC_API_KEY=sua_chave_aqui
CLAUDE_MODEL=claude-haiku-4-5

# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=sua_service_role_key_aqui

# Google Maps (cálculo de distância para busca de PG)
GOOGLE_MAPS_API_KEY=sua_chave_aqui

# Secretaria (recebe aviso quando nenhum PG está disponível)
SECRETARIA_PHONE=5534999999999

# Histórico de mensagens por conversa
MAX_HISTORY_MESSAGES=20

# Modo de teste (opcional)
TEST_MODE=false
TEST_PHONE=
TEST_LEADER_PHONE=
TEST_LEADER_NOME=
TEST_LEADER_LOOKUP_PHONE=
```

### Modelos Claude disponíveis

| Modelo | Característica |
|---|---|
| `claude-haiku-4-5` | Rápido e econômico — recomendado para produção |
| `claude-sonnet-4-6` | Mais inteligente — respostas mais elaboradas |

---

## Iniciando o projeto

```powershell
# Produção
npm start

# Desenvolvimento — reinicia automaticamente ao salvar arquivos
npm run dev
```

Na **primeira execução** o terminal exibirá um QR Code. Escaneie com o WhatsApp do número que será usado como bot. A sessão é salva em `data/auth_info/` e não precisa ser repetida.

Para verificar se o servidor está rodando:
```
GET http://localhost:3000/health
→ { "status": "ok" }
```

---

## Roteamento de mensagens

Toda mensagem recebida passa pelo seguinte roteamento em `src/server.js`:

```
Mensagem recebida
       ↓
É administrador? → handleAdmin (relatórios)
       ↓ não
É admin+líder?  → handleLider (fluxo de líder)
       ↓ não
É resposta de botão/lista? → handleListResponse (atualiza status)
       ↓ não
É líder?        → handleLider (fluxo de líder)
       ↓ não
É visitante já cadastrado? → bloqueia e orienta
       ↓ não
handleVisitante → Luz.ia (coleta dados e indica PG)
```

Todas as mensagens passam por detecção de **prompt injection** antes de chegar ao Claude.

---

## Perfis de usuário

### Administrador
Números cadastrados manualmente em `src/admin.js` (`ADMINS_NORM`).
Acesso via WhatsApp aos relatórios:

| Comando | Relatório |
|---|---|
| `1` | Visitantes sem retorno |
| `2` | Líderes com atendimento parado |

Um administrador que também seja líder tem acesso a ambos os fluxos — comandos `1` e `2` abrem os relatórios, qualquer outra mensagem entra no fluxo de líder.

### Líder
Verificado automaticamente pela tabela `LISTA_PGS` (coluna `CONTATO`) ou `LISTA_ACIONAMENTOS` (coluna `lider_telefone`). Recebe a lista de visitantes pendentes e pode atualizar o status de cada um.

### Visitante
Qualquer número que não seja admin nem líder. Atendido pela Luz.ia.

---

## Fluxo da Luz.ia (visitante)

A Luz.ia faz 7 perguntas uma por vez:

1. Nome completo
2. Idade
3. Estado civil (Casado ou Solteiro)
4. Tem crianças? (Sim ou Não)
5. Endereço (Rua e Número)
6. Bairro
7. Cidade (Uberlândia, São Paulo ou Goiânia)

Ao coletar todas as respostas:
- Determina o perfil familiar via `src/perfil.js`
- Busca o PG mais próximo via Google Maps em `LISTA_PGS`
- Salva o visitante em `LISTA_ACIONAMENTOS` com líder atribuído
- Notifica o líder via WhatsApp com os dados do visitante

**Lembrete automático:** se o visitante não responder em 2 minutos, o bot envia até 3 lembretes espaçados. No encerramento, limpa o histórico da conversa.

---

## Fluxo do líder (PG Visitante Acolhedor)

O líder recebe a lista de visitantes pendentes e conversa com o agente para atualizar os status. O agente emite marcadores que o sistema processa automaticamente:

| Marcador | Ação |
|---|---|
| `#CONVIDAR:{"id":N}` | Atualiza status para `convidado` |
| `#PARTICIPOU:{"id":N}` | Atualiza status para `frequentando` |
| `#ESPERANDO_RETORNO:{"id":N}` | Atualiza status para `esperando retorno` |
| `#NAO_ATENDE:{"id":N,"motivo":"..."}` | Redireciona visitante para novo PG |

O líder também pode responder pelos botões/listas interativas enviados pelo scheduler.

---

## Scheduler — lembretes diários

O scheduler (`src/scheduler.js`) roda automaticamente junto com o servidor e envia lembretes diários aos líderes com visitantes pendentes.

- Executa uma vez por dia (verifica a cada hora)
- Ignora visitantes cadastrados no mesmo dia
- Envia mensagem personalizada por status do visitante:

| Status | Texto enviado |
|---|---|
| `ATIVO` | "Qual é a situação?" |
| `esperando retorno` | "Ainda aguardando retorno do visitante." |
| `convidado` | "Já foi convidado — está frequentando o PG?" |

Cada visitante é enviado com nome, telefone, idade e bairro, seguido de botões de ação.

---

## Redirecionamento automático

Quando um líder não pode atender (`#NAO_ATENDE`) ou seu número é inválido, o sistema (`src/redirecionamento.js`):

1. Marca a linha atual com o status correspondente
2. Busca o próximo PG mais adequado (até 5 tentativas)
   - 1ª e 2ª tentativa: por perfil familiar + proximidade
   - 3ª em diante: só por proximidade
3. Cria nova linha em `LISTA_ACIONAMENTOS` para o novo líder
4. Notifica o novo líder via WhatsApp
5. Se esgotar tentativas: notifica a secretaria (`SECRETARIA_PHONE`)

---

## Endpoints HTTP

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Verifica se o servidor está rodando |
| POST | `/test/lembrete` | Dispara lembretes para todos os líderes imediatamente |
| GET/POST | `/admin/lembrete/:telefone` | Reenvia lembrete para um líder específico |

---

## Estrutura do projeto

```
saldaterra/
├── src/
│   ├── server.js              # Servidor Express, roteamento e handlers
│   ├── claude.js              # Integração com a API do Claude (Anthropic)
│   ├── whatsapp-client.js     # Conexão WhatsApp via Baileys (QR Code)
│   ├── whatsapp.js            # Funções de envio (texto, botões, listas, polls)
│   ├── supabase.js            # Integração com o Supabase
│   ├── admin.js               # Handler e relatórios do administrador
│   ├── scheduler.js           # Lembretes diários automáticos para líderes
│   ├── redirecionamento.js    # Fluxo de redirecionamento de visitantes
│   ├── conversation.js        # Histórico de conversas em memória
│   ├── msg-logger.js          # Log de mensagens de líderes em arquivo
│   ├── poll-map.js            # Mapeamento de polls para visitantes
│   ├── perfil.js              # Determinação de perfil familiar
│   ├── maps.js                # Cálculo de distância via Google Maps
│   ├── load-env.js            # Carrega variáveis do .env
│   └── agents/
│       ├── luz-ia.js          # System prompt da Luz.ia (visitante)
│       └── pg-visitante.js    # System prompt do PG Visitante Acolhedor (líder)
├── data/
│   └── auth_info/             # Sessão WhatsApp (gerada automaticamente)
├── logs/
│   └── lideres-YYYY-MM-DD.log # Log diário de interações com líderes
├── start.ps1                  # Script de inicialização
├── auto-push.ps1              # Sincronização automática com o GitHub
├── package.json
├── .env                       # Credenciais (não versionado)
└── .gitignore
```

---

## Fluxo completo

```
Usuário (WhatsApp)
       ↓
Baileys (whatsapp-client.js)
       ↓  evento messages.upsert
Servidor Express (server.js)
       ↓  roteia por perfil (admin / líder / visitante)
Agente Claude (Luz.ia ou PG Visitante Acolhedor)
       ↓  gera resposta com marcadores
Supabase (LISTA_ACIONAMENTOS + LISTA_PGS)
       ↓  salva / atualiza / busca PG
Baileys (whatsapp.js)
       ↓  envia resposta
Usuário (WhatsApp)
```

---

## Sincronização automática com o GitHub

```powershell
powershell -ExecutionPolicy Bypass -File "C:\caminho\completo\para\saldaterra\auto-push.ps1"
```

Monitora alterações com `FileSystemWatcher`. Após 10 segundos de inatividade executa:
```
git add . → git commit -m "auto: <timestamp>" → git push origin main
```

---

## Repositório

[https://github.com/marciohdo/saldaterra](https://github.com/marciohdo/saldaterra)
