# SancaMobi

Plataforma de mobilidade urbana inicialmente exclusiva para São Carlos - SP.

## Monorepo
- `apps/passenger` — app do passageiro (Expo + React Native)
- `apps/driver` — app do motorista (Expo + React Native)
- `apps/admin` — painel operacional (React + Vite)
- `functions` — backend Firebase Functions v2
- `packages/shared-types` — contratos de domínio
- `packages/firebase-client` — cliente Firebase compartilhado

## Firebase / Android
Projeto Firebase: `sancamobi`.

Aplicativos Android configurados:
- Passageiro: `app.sancamobipassageiro`
- Motorista: `app.sancamobidriver`

O `google-services.json` e credenciais privadas devem permanecer fora do Git e ser fornecidos pelo ambiente de build/EAS.

## Backend operacional
- Firebase Auth, Firestore e Storage
- Cloud Functions v2 em `southamerica-east1`
- Perfis de passageiro e motorista
- Aprovação administrativa de motorista
- Presença online/offline e localização
- Tarifação configurável
- Solicitação e seleção de motoristas
- Ofertas e aceite transacional
- Atualização do ciclo da corrida
- Painel administrativo
- CI/CD pelo GitHub Actions

## CI/CD
Push na `main` executa validação, build e deploy Firebase.

O deploy não depende da etapa opcional de limpeza de artefatos do Artifact Registry; essa configuração pode ser feita separadamente no Google Cloud/Firebase quando desejado.

## Segurança
A Service Account nunca deve ser commitada. O CI usa o secret:
`SANCAMOBI_FIREBASE_SERVICE_ACCOUNT_JSON`.

A API key Firebase Web não é um segredo de servidor, mas deve ser restringida conforme o ambiente. Chaves Google Maps devem ser protegidas por restrições de API e aplicação e nunca devem ser gravadas no código-fonte.

## Admin
Para transformar uma conta Firebase Auth em administrador, use o workflow manual **Bootstrap Admin** no GitHub Actions. A conta precisa existir primeiro no Firebase Authentication e receber o custom claim administrativo.

## Desenvolvimento
```bash
pnpm install
pnpm --filter @sancamobi/passenger start
pnpm --filter @sancamobi/driver start
pnpm --filter @sancamobi/admin dev
```

## Roadmap de produção
A base Firebase/CI está operacional. As próximas camadas para uma operação comercial completa são:
- Google Maps/Routes/Places e geocodificação
- mapa e acompanhamento em tempo real
- GPS em background e notificações FCM
- cadastro/documentação de veículos
- pagamentos PIX/cartão/dinheiro
- carteira, repasses e financeiro
- avaliações e histórico
- cupons e tarifa dinâmica
- suporte, auditoria, App Check e observabilidade
- testes automatizados e Firebase Emulator Suite
