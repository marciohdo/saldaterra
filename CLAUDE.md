# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Projeto Saldaterra — aplicação de IA em desenvolvimento por Marcio Heleno (marciohdo).

Repositório GitHub: https://github.com/marciohdo/saldaterra

## Setup

```bash
# Clonar o repositório
git clone https://github.com/marciohdo/saldaterra.git
cd saldaterra
```

## Development Commands

```bash
# Ver status das mudanças
git status

# Commit e push manual
git add .
git commit -m "mensagem"
git push origin main

# Auto-push (monitora mudanças e commita automaticamente)
powershell -ExecutionPolicy Bypass -File auto-push.ps1
```

## Architecture

Diretório raiz do projeto. Subpastas e módulos serão documentados aqui conforme o projeto crescer.

## GitHub — Sincronização Automática

O arquivo `auto-push.ps1` monitora o diretório do projeto usando `FileSystemWatcher`.
Quando arquivos são criados, modificados ou deletados, aguarda 10 segundos de inatividade
e então executa automaticamente:

```
git add .
git commit -m "auto: <timestamp>"
git push origin main
```

### Como ativar o auto-push

1. Abra um terminal PowerShell no diretório do projeto
2. Execute:
   ```powershell
   powershell -ExecutionPolicy Bypass -File auto-push.ps1
   ```
3. Deixe o terminal aberto — ele monitora em segundo plano

### Iniciar o auto-push junto com o Windows (opcional)

Crie um atalho no menu Inicializar apontando para:
```
powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\mholiveira\OneDrive - MC3 Consultoria Empresarial Ltda\Documentos\Projetos\outros\IA\saldaterra\auto-push.ps1"
```

## Git — Configuração

- **Remote:** `https://github.com/marciohdo/saldaterra.git`
- **Branch principal:** `main`
- **Usuário:** Marcio Heleno (marcioho@gmail.com)
