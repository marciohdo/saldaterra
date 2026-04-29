# Saldaterra — Agentes de IA via WhatsApp

Agentes de inteligência artificial da Igreja Sal da Terra integrados ao WhatsApp via Evolution API e Claude (Anthropic).

---

## Agentes disponíveis

| Agente | Função |
|---|---|
| **Luz.ia** | Atende visitantes, coleta dados e encontra o Pequeno Grupo (PG) ideal |
| **PG Visitante Acolhedor** | Coleta do líder informações sobre a frequência de visitantes |

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) v18 ou superior
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) instalado (`winget install Cloudflare.cloudflared`)
- Conta na [Anthropic](https://console.anthropic.com/) com API Key
- Instância ativa na Evolution API
- Projeto no Supabase com as tabelas `LISTA_ACIONAMENTOS` e `LISTA_PGS`

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

# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=sua_service_role_key_aqui

# Comportamento
MAX_HISTORY_MESSAGES=20
```

### Modelos Claude disponíveis

| Modelo | Característica |
|---|---|
| `claude-haiku-4-5` | Rápido e econômico — recomendado para produção |
| `claude-sonnet-4-6` | Mais inteligente — respostas mais elaboradas |

---

## Iniciando o projeto

### Modo completo — servidor + túnel Cloudflare (recomendado)

```powershell
npm run tunnel
```

Este comando executa o `start.ps1` que:
1. Sobe o túnel Cloudflare e exibe a URL pública gerada
2. Sobe o servidor Node.js na porta 3000

Saída esperada:
```
Tunel ativo!
URL publica : https://xxxx.trycloudflare.com
Webhook URL : https://xxxx.trycloudflare.com/webhook/5c697459-3a69-4009-b724-43069e591f81

Iniciando servidor Node.js na porta 3000...
Servidor rodando na porta 3000
```

### Outros modos

```powershell
# Só o servidor (se já tiver túnel ou domínio próprio configurado)
npm start

# Desenvolvimento — reinicia automaticamente ao salvar arquivos
npm run dev
```

Para verificar se o servidor está rodando:
```
GET http://localhost:3000/health
```
Resposta esperada: `{ "status": "ok" }`

---

## Configurando o webhook na Evolution API

Após rodar `npm run tunnel`, copie a **Webhook URL** exibida no terminal e configure na Evolution API:

```
https://xxxx.trycloudflare.com/webhook/5c697459-3a69-4009-b724-43069e591f81
```

Evento necessário: **messages.upsert**

> A URL do Cloudflare muda a cada reinicialização (versão sem conta). Sempre que reiniciar o projeto, atualize a URL na Evolution API.

---

## Roteamento dos agentes

| Mensagem começa com | Agente acionado |
|---|---|
| `lider:` (ex: `lider: João veio 3 vezes`) | PG Visitante Acolhedor |
| Qualquer outro texto | Luz.ia |

### Fluxo da Luz.ia

A Luz.ia faz 7 perguntas uma por vez, nesta ordem:

1. Nome completo
2. Idade
3. Estado civil (Casado ou Solteiro)
4. Tem crianças? (Sim ou Não)
5. Endereço (Rua e Número)
6. Bairro
7. Cidade (Uberlândia, São Paulo ou Goiânia)

Ao coletar todas as respostas, o sistema:
- Busca automaticamente o PG mais próximo na tabela `LISTA_PGS`
- Salva os dados na tabela `LISTA_ACIONAMENTOS` com o `lider_telefone` preenchido
- Continua a conversa indicando o PG ideal ao visitante

### Lembrete automático

Se o visitante não responder em **2 minutos**, o agente envia automaticamente:
> "Oi! 😊 Ainda estou aqui esperando por você. Me responde para eu te ajudar a encontrar o seu Pequeno Grupo! 🌟"

### Encerramento de conversa

Quando o atendimento termina, o agente responde `#Ok` e o histórico é apagado automaticamente.

---

## Estrutura do projeto

```
saldaterra/
├── src/
│   ├── server.js           # Servidor Express, webhook handler e scheduler de lembrete
│   ├── claude.js           # Integração com a API do Claude
│   ├── evolution-api.js    # Envio de mensagens via WhatsApp
│   ├── supabase.js         # Integração com o Supabase (salvar visitante, buscar PG)
│   ├── conversation.js     # Histórico e controle de estado por número
│   ├── load-env.js         # Carrega variáveis do .env
│   └── agents/
│       ├── luz-ia.js       # System prompt da Luz.ia
│       └── pg-visitante.js # System prompt do PG Visitante Acolhedor
├── .claude/
│   └── agents/             # Definições dos agentes para Claude Code
├── start.ps1               # Sobe servidor + túnel Cloudflare juntos
├── test-agents.js          # Testa envio de mensagens via Evolution API
├── auto-push.ps1           # Sincronização automática com o GitHub
├── package.json
├── .env                    # Credenciais (não versionado)
└── .gitignore
```

---

## Testando o envio de mensagens

```bash
node test-agents.js
```

Envia uma mensagem de saudação de cada agente para o número configurado no script.

---

## Sincronização automática com o GitHub

O arquivo `auto-push.ps1` monitora alterações e faz commit e push automaticamente.

```powershell
powershell -ExecutionPolicy Bypass -File auto-push.ps1
```

Deixe o terminal aberto. A cada 10 segundos de inatividade após uma alteração executa:
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
Cloudflare Tunnel
       ↓  encaminha para localhost:3000
Servidor Express (src/server.js)
       ↓  roteia pelo conteúdo da mensagem
Agente Claude (Luz.ia ou PG Visitante)
       ↓  coleta dados / gera resposta
Supabase (LISTA_ACIONAMENTOS + LISTA_PGS)
       ↓  salva visitante e busca PG próximo
Evolution API
       ↓  envia resposta
Usuário (WhatsApp)
```

---

### Repositório

[https://github.com/marciohdo/saldaterra](https://github.com/marciohdo/saldaterra)
