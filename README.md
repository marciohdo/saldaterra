# Saldaterra — Agentes de IA via WhatsApp

Agentes de inteligência artificial da Igreja Sal da Terra integrados ao WhatsApp via Evolution API e Claude (Anthropic).

---

## Agentes disponíveis

| Agente | Função |
|---|---|
| **Luz.ia** | Atende visitantes e ajuda a encontrar o Pequeno Grupo (PG) ideal |
| **PG Visitante Acolhedor** | Coleta do líder informações sobre a frequência de visitantes |

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) v18 ou superior
- Conta na [Anthropic](https://console.anthropic.com/) com API Key
- Instância ativa na Evolution API
- Servidor com IP/domínio público (para receber webhooks)

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

Crie o arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Servidor
PORT=3000

# Anthropic Claude
ANTHROPIC_API_KEY=sua_chave_aqui
CLAUDE_MODEL=claude-haiku-4-5

# Evolution API
EVOLUTION_API_URL=https://sua-instancia.dominio.com
EVOLUTION_API_KEY=sua_api_key_aqui
EVOLUTION_INSTANCE=nome_da_instancia

# Comportamento
MAX_HISTORY_MESSAGES=20
```

### Modelos Claude disponíveis

| Modelo | Característica |
|---|---|
| `claude-haiku-4-5` | Rápido e econômico — recomendado para produção |
| `claude-sonnet-4-6` | Mais inteligente — respostas mais elaboradas |

---

## Iniciando o servidor

```bash
# Produção
npm start

# Desenvolvimento (reinicia automaticamente ao salvar arquivos)
npm run dev
```

O servidor sobe na porta definida em `PORT` (padrão: `3000`).

Para verificar se está rodando, acesse:
```
GET http://localhost:3000/health
```
Resposta esperada: `{ "status": "ok" }`

---

## Configurando o webhook na Evolution API

No painel da Evolution API, configure o webhook da instância para enviar eventos para:

```
https://seu-dominio.com/webhook/5c697459-3a69-4009-b724-43069e591f81
```

Eventos necessários: **messages.upsert**

> O servidor responde com HTTP 200 imediatamente e processa a mensagem em seguida, respeitando o timeout da Evolution API.

---

## Roteamento dos agentes

Todas as mensagens recebidas são roteadas automaticamente:

| Mensagem começa com | Agente acionado |
|---|---|
| `lider:` (ex: `lider: João veio 3 vezes`) | PG Visitante Acolhedor |
| Qualquer outro texto | Luz.ia |

### Encerramento de conversa

Quando o agente entende que o atendimento terminou, ele responde `#Ok` e o histórico da conversa é apagado automaticamente.

---

## Estrutura do projeto

```
saldaterra/
├── src/
│   ├── server.js          # Servidor Express e handler do webhook
│   ├── claude.js          # Integração com a API do Claude
│   ├── evolution-api.js   # Envio de mensagens via WhatsApp
│   ├── conversation.js    # Histórico de conversa por número
│   ├── load-env.js        # Carrega variáveis do .env
│   └── agents/
│       ├── luz-ia.js      # System prompt da Luz.ia
│       └── pg-visitante.js # System prompt do PG Visitante Acolhedor
├── .claude/
│   └── agents/            # Definições dos agentes para Claude Code
├── test-agents.js         # Script para testar envio de mensagens
├── auto-push.ps1          # Sincronização automática com o GitHub
├── package.json
├── .env                   # Credenciais (não versionado)
└── .gitignore
```

---

## Testando o envio de mensagens

Para verificar se a integração com a Evolution API está funcionando:

```bash
node test-agents.js
```

Isso envia uma mensagem de saudação de cada agente para o número configurado no script.

---

## Sincronização automática com o GitHub

O arquivo `auto-push.ps1` monitora alterações no projeto e faz commit e push automaticamente.

```powershell
# Ativar no terminal PowerShell
powershell -ExecutionPolicy Bypass -File auto-push.ps1
```

Deixe o terminal aberto. A cada 10 segundos de inatividade após uma alteração, o script executa:
```
git add . → git commit -m "auto: <timestamp>" → git push origin main
```

### Iniciar junto com o Windows (opcional)

Crie um atalho no menu Inicializar apontando para:
```
powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\caminho\para\saldaterra\auto-push.ps1"
```

---

## Fluxo completo

```
Usuário (WhatsApp)
       ↓
Evolution API
       ↓  POST webhook
Servidor Express (src/server.js)
       ↓  roteia pelo conteúdo da mensagem
Agente Claude (Luz.ia ou PG Visitante)
       ↓  gera resposta com histórico
Evolution API
       ↓  envia mensagem
Usuário (WhatsApp)
```

---

### Repositório

[https://github.com/marciohdo/saldaterra](https://github.com/marciohdo/saldaterra)
