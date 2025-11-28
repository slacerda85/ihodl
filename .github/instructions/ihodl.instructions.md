---
applyTo: '**'
---

# ihodl Bot Instructions

Este repositório é um app de carteira/node de bitcoins, que utiliza ambiente sem acesso ao node.js Buffer. apenas Uint8Arrays e DataViews são permitidos.

O framework utilizado é o Expo (https://docs.expo.dev/), utilizando React Native.

Dentro da pasta `src` , a pasta `app` contem as rotas gerenciadas pelo Expo Router, a pasta `core` contém o código principal do aplicativo, enquanto a pasta `ui` contém a interface do usuário.

## roteador Expo

A pasta `app` contém as rotas do aplicativo, gerenciadas pelo Expo Router. A estrutura da pasta `app` é a seguinte:

- **(tabs)**: A pasta `(tabs)` contém as rotas principais do aplicativo, organizadas em abas para facilitar a navegação entre diferentes seções.
- **\_layout.tsx**: O arquivo `_layout.tsx` define o layout geral do aplicativo, incluindo a barra de navegação e o estilo global.
- **index.tsx**: O arquivo `index.tsx` é a rota inicial do aplicativo, que geralmente exibe a tela principal ou o dashboard.

## código principal (regra de negócio)

Foi utilizada uma arquitetura de camadas simples dentro da pasta `core`, definidas a seguir:

- **Models**: A pasta `models` Contém as definições de tipos e estruturas de dados usadas no aplicativo.

- **Lib**: A pasta `lib` contém bibliotecas e módulos reutilizáveis que fornecem funcionalidades específicas para o aplicativo. Muitas funções de manipulação de dados estão em utils.ts dentro desta pasta.

- **Repositories**: A pasta `repositories` gerencia a persistência de dados e a comunicação com fontes de dados externas, como bancos de dados ou APIs.

- **Services**: A pasta `services` contém a lógica de negócio e as operações principais do aplicativo, como gerenciamento de carteiras, transações e comunicação com a rede Bitcoin.

## Interface do usuário

A interface do usuário é construída usando React e está localizada na pasta `ui`. A estrutura da pasta `ui` é a seguinte:

- **Assets**: A pasta `assets` contém recursos estáticos, como imagens, fontes e arquivos de estilo.

- **Components**: A pasta `components` contém componentes reutilizáveis da interface do usuário, como botões, formulários e listas.

- **Features**: A pasta `features` agrupa componentes e telas relacionados a funcionalidades específicas do aplicativo, como gerenciamento de carteiras, visualização de transações e configurações.

## Formatação de casing

O projeto utiliza a seguinte convenção de nomenclatura:

- **Camel Case**: Utilizado para nomes de variáveis e funções (exemplo: `minhaVariavel`, `calcularSaldo`).
- **Pascal Case**: Utilizado para nomes de classes e componentes React (exemplo: `MinhaClasse`, `MeuComponente`).
- **Yell Case**: Utilizado para constantes e enums (exemplo: `MINHA_CONSTANTE`, `MEU_ENUM`).

NUNCA utilize snake_case ou kebab-case em qualquer parte do código.
