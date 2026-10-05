# SancaMobi

Plataforma de mobilidade urbana inicialmente exclusiva para São Carlos - SP.

## Monorepo
- `apps/passenger` — app do passageiro (Expo + React Native)
- `apps/driver` — app do motorista (Expo + React Native)
- `apps/admin` — painel operacional (React + Vite)
- `functions` — backend Firebase Functions v2
- `packages/shared-types` — contratos de domínio
- `packages/firebase-client` — cliente Firebase compartilhado

## Backend já implementado
- Firebase Auth
- Firestore
- Storage
- Cloud Functions na região `southamerica-east1`
- Cadastro automático de perfil de passageiro/motorista
- Aprovação administrativa de motorista
- Presença online/offline e atualização de localização
- Cálculo de tarifa configurável
- Solicitação de corrida
- Seleção dos motoristas online mais próximos
- Criação de ofertas
- Aceite transacional da corrida
- Máquina inicial de status da corrida
- Painel administrativo com motoristas, corridas e tarifas
- GitHub Actions para validação e deploy

## Segurança
A Service Account nunca deve ser commitada. O CI usa o GitHub Secret:
`SANCAMOBI_FIREBASE_SERVICE_ACCOUNT_JSON`.

As chaves Firebase Web/Android não substituem a Service Account. O arquivo Android `google-services.json` deve permanecer fora do Git e ser fornecido ao build nativo/EAS.

## Firebase Android
O passageiro usa o pacote `app.sancamobi`.
O motorista usa o pacote `app.sancamobi.driver`.

Como são dois aplicativos Android, o Firebase precisa ter **dois registros Android** no mesmo projeto, um para cada package name. O segundo registro ainda precisa ser criado no console Firebase.

## Admin
Para transformar uma conta Firebase Auth em ADMIN, use o workflow manual **Bootstrap Admin** no GitHub Actions. O usuário deve existir primeiro no Firebase Authentication.

## Desenvolvimento
```bash
pnpm install
pnpm --filter @sancamobi/passenger start
pnpm --filter @sancamobi/driver start
pnpm --filter @sancamobi/admin dev
```

## Próximas camadas de produção
- Google Maps/Routes/Places e geocodificação
- acompanhamento da corrida em mapa
- GPS em background com política de bateria
- FCM e notificações de ofertas
- veículos e documentação
- pagamentos PIX/cartão/dinheiro
- carteira e repasses
- avaliações e histórico
- cupons, tarifas dinâmicas e corporativo
- App Check, observabilidade, auditoria e testes com Firebase Emulator Suite
