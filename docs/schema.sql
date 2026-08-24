-- =============================================================================
-- Ponto W — esquema do banco real (Postgres / Supabase)
--
-- Espelha exatamente a base falsa de src/domain/seed.ts.
-- Convenção: no mock os campos são camelCase (TypeScript); aqui snake_case
-- (padrão Postgres). O mapeamento está comentado em cada coluna.
--
-- ORIGEM DO DADO:
--   [CAT]     catálogo fixo, entra por carga inicial (seed)
--   [CAD]     cadastro, preenchido por pessoas na aplicação
--   [CHARGER] vem do carregador via Modbus RTU / RS-485
--   [APP]     gerado pela nossa camada de sessão/cobrança
--   [IA]      calculado pelos motores (engine/)
-- =============================================================================

-- ---------------------------------------------------------------- ENUMS
CREATE TYPE uf_br AS ENUM ('SP','RJ','MG','PR','SC','RS','BA','PE','DF','GO');

CREATE TYPE tipo_carregador AS ENUM ('GW7K-HCA-20','GW11K-HCA-20','GW22K-HCA-20');

CREATE TYPE estado_carregador AS ENUM
  ('DISPONIVEL','OCUPADO','PAUSADO','OFFLINE','MANUTENCAO');

CREATE TYPE estado_sessao AS ENUM
  ('AUTENTICADO','CARREGANDO','PAUSADO','CONCLUIDO','FATURADO');

CREATE TYPE meio_autorizacao AS ENUM ('RFID','APP','QR');

CREATE TYPE formato_franquia AS ENUM ('Light','Standard','Hub');

CREATE TYPE segmento_comercio AS ENUM
  ('Café / Restaurante','Mercado','Farmácia','Shopping','Posto','Clínica','Loja de rua');

CREATE TYPE status_cobranca AS ENUM ('PENDENTE','PAGO','FALHOU');

CREATE TYPE status_homologacao AS ENUM
  ('ANALISE','VISTORIA','APROVADO','REPROVADO','PENDENTE_DOC');


-- ============================================================ 1. CATÁLOGOS
-- Tabelas de referência: mudam pouco, entram por carga inicial.

-- [CAT] Regiões atendidas. custo_energia_kwh é a tarifa da distribuidora local
-- e alimenta o cálculo de margem e o fator de preço dinâmico.
CREATE TABLE regioes (
  id                TEXT PRIMARY KEY,           -- regiaoId
  uf                uf_br        NOT NULL,
  cidade            TEXT         NOT NULL,
  zona              TEXT         NOT NULL,      -- bairro/zona
  custo_energia_kwh NUMERIC(6,4) NOT NULL,      -- R$/kWh com impostos
  densidade_ev      NUMERIC(4,3) NOT NULL       -- índice 0–1 de EVs na região
);

-- [CAT] Linha HCA G2 da GoodWe. suporta_ocpp é FALSE em toda a linha hoje —
-- é o motivo de a integração real ser por Modbus.
CREATE TABLE modelos_carregador (
  id             tipo_carregador PRIMARY KEY,
  potencia_kw    NUMERIC(5,2) NOT NULL,
  fases          SMALLINT     NOT NULL CHECK (fases IN (1,3)),
  tensao_v       NUMERIC(6,1) NOT NULL,
  corrente_max_a NUMERIC(5,1) NOT NULL,
  conector       TEXT         NOT NULL DEFAULT 'Tipo 2 (IEC 62196-2)',
  protocolos     TEXT[]       NOT NULL,
  suporta_ocpp   BOOLEAN      NOT NULL DEFAULT FALSE
);

-- [CAT] Modelos de veículo. potencia_max_ac_kw é o limite do carregador de
-- bordo — quem decide quanto puxa é o carro, não o eletroposto.
CREATE TABLE veiculos (
  id                 TEXT PRIMARY KEY,
  montadora          TEXT         NOT NULL,
  modelo             TEXT         NOT NULL,
  capacidade_kwh     NUMERIC(6,2) NOT NULL,
  potencia_max_ac_kw NUMERIC(5,2) NOT NULL
);


-- ============================================================ 2. REDE
-- [CAD] Quem opera o ponto (o comerciante franqueado).
CREATE TABLE franqueados (
  id           TEXT PRIMARY KEY,
  nome         TEXT NOT NULL,
  razao_social TEXT NOT NULL,
  cnpj         TEXT NOT NULL,
  desde        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- [CAD] O ponto comercial. limite_potencia_kw e carga_base_kw são a base do
-- CONTROLE DE DEMANDA — sem eles o motor não sabe quanta folga existe.
CREATE TABLE pontos (
  id                 TEXT PRIMARY KEY,
  nome               TEXT              NOT NULL,
  franqueado_id      TEXT              NOT NULL REFERENCES franqueados(id),
  regiao_id          TEXT              NOT NULL REFERENCES regioes(id),
  endereco           TEXT              NOT NULL,
  formato            formato_franquia  NOT NULL,
  segmento           segmento_comercio NOT NULL,
  limite_corrente_a  NUMERIC(6,1)      NOT NULL,  -- disjuntor da entrada
  limite_potencia_kw NUMERIC(6,2)      NOT NULL,  -- teto elétrico do local
  carga_base_kw      NUMERIC(6,2)      NOT NULL,  -- consumo do próprio comércio
  preco_base_kwh     NUMERIC(6,2)      NOT NULL,  -- preço antes dos fatores
  ativo              BOOLEAN           NOT NULL DEFAULT TRUE,
  inaugurado_em      TIMESTAMPTZ       NOT NULL,
  lat                NUMERIC(9,6),
  lng                NUMERIC(9,6)
);
CREATE INDEX idx_pontos_regiao ON pontos(regiao_id);
CREATE INDEX idx_pontos_franqueado ON pontos(franqueado_id);

-- [CHARGER] Cada vaga física. estado, potencia_permitida_kw e ultimo_heartbeat
-- são atualizados pela leitura Modbus.
CREATE TABLE carregadores (
  id                     TEXT PRIMARY KEY,
  ponto_id               TEXT              NOT NULL REFERENCES pontos(id) ON DELETE CASCADE,
  apelido                TEXT              NOT NULL,   -- "Vaga 1"
  modelo                 tipo_carregador   NOT NULL REFERENCES modelos_carregador(id),
  estado                 estado_carregador NOT NULL DEFAULT 'DISPONIVEL',
  potencia_permitida_kw  NUMERIC(5,2)      NOT NULL,   -- teto imposto pelo motor de demanda
  firmware               TEXT,
  ultimo_heartbeat       TIMESTAMPTZ       NOT NULL DEFAULT now()
);
CREATE INDEX idx_carregadores_ponto ON carregadores(ponto_id);
CREATE INDEX idx_carregadores_estado ON carregadores(estado);


-- ============================================================ 3. USUÁRIOS
-- [CAD] rfid_uid é o cartão que o HCA G2 já lê (até 10 por carregador).
CREATE TABLE motoristas (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  email      TEXT NOT NULL,
  rfid_uid   TEXT UNIQUE,
  veiculo_id TEXT REFERENCES veiculos(id),
  desde      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_motoristas_rfid ON motoristas(rfid_uid);


-- ============================================================ 4. OPERAÇÃO
-- [APP] A tabela central. tarifa_aplicada_kwh é travada no início da sessão
-- (transparência da REN ANEEL 1.000/2021) e não muda até o fim.
CREATE TABLE sessoes (
  id                  TEXT PRIMARY KEY,
  ponto_id            TEXT             NOT NULL REFERENCES pontos(id),
  carregador_id       TEXT             NOT NULL REFERENCES carregadores(id),
  motorista_id        TEXT             NOT NULL REFERENCES motoristas(id),
  veiculo_id          TEXT             NOT NULL REFERENCES veiculos(id),
  inicio              TIMESTAMPTZ      NOT NULL,
  fim                 TIMESTAMPTZ,                     -- NULL = ainda carregando
  soc_inicial         SMALLINT         NOT NULL CHECK (soc_inicial BETWEEN 0 AND 100),
  soc_atual           SMALLINT         NOT NULL CHECK (soc_atual  BETWEEN 0 AND 100),
  energia_kwh         NUMERIC(8,3)     NOT NULL DEFAULT 0,
  potencia_atual_kw   NUMERIC(5,2)     NOT NULL DEFAULT 0,
  estado              estado_sessao    NOT NULL DEFAULT 'AUTENTICADO',
  autorizacao         meio_autorizacao NOT NULL,
  tarifa_aplicada_kwh NUMERIC(6,2)     NOT NULL,       -- preço travado
  custo_acumulado     NUMERIC(10,2)    NOT NULL DEFAULT 0,
  motivo_pausa        TEXT                             -- por que o motor reduziu/pausou
);
CREATE INDEX idx_sessoes_ponto_inicio ON sessoes(ponto_id, inicio DESC);
CREATE INDEX idx_sessoes_motorista    ON sessoes(motorista_id, inicio DESC);
CREATE INDEX idx_sessoes_estado       ON sessoes(estado);

-- [CHARGER] Série temporal, 1 amostra a cada 5s durante a sessão.
-- É a tabela que mais cresce: ~720 linhas por hora de recarga por vaga.
-- Em produção, considerar particionamento por mês.
CREATE TABLE telemetria (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sessao_id         TEXT         NOT NULL REFERENCES sessoes(id) ON DELETE CASCADE,
  ts                TIMESTAMPTZ  NOT NULL,
  tensao_v          NUMERIC(6,1) NOT NULL,
  corrente_a        NUMERIC(6,1) NOT NULL,
  potencia_kw       NUMERIC(6,2) NOT NULL,
  soc               NUMERIC(5,1) NOT NULL,
  energia_acum_kwh  NUMERIC(8,3) NOT NULL
);
CREATE INDEX idx_telemetria_sessao_ts ON telemetria(sessao_id, ts);


-- ============================================================ 5. FINANCEIRO
-- [APP] Uma cobrança por sessão encerrada, já com a repartição calculada.
-- Guardamos a divisão gravada (e não só calculada) para o extrato do
-- franqueado ser auditável mesmo se as regras mudarem depois.
CREATE TABLE cobrancas (
  id               TEXT PRIMARY KEY,
  sessao_id        TEXT            NOT NULL UNIQUE REFERENCES sessoes(id),
  ponto_id         TEXT            NOT NULL REFERENCES pontos(id),
  valor            NUMERIC(10,2)   NOT NULL,
  metodo           TEXT            NOT NULL DEFAULT 'PIX',
  status           status_cobranca NOT NULL DEFAULT 'PENDENTE',
  txid             TEXT            NOT NULL,          -- id da transação Pix
  criada_em        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  paga_em          TIMESTAMPTZ,
  -- repartição do valor
  custo_energia    NUMERIC(10,2)   NOT NULL,          -- devido à distribuidora
  royalty_goodwe   NUMERIC(10,2)   NOT NULL,          -- 6% sobre a recarga
  fundo_marketing  NUMERIC(10,2)   NOT NULL,          -- 2% sobre a recarga
  gateway          NUMERIC(10,2)   NOT NULL,          -- ~1,5%
  liquido_lojista  NUMERIC(10,2)   NOT NULL           -- o que sobra pro comércio
);
CREATE INDEX idx_cobrancas_ponto_data ON cobrancas(ponto_id, criada_em DESC);
CREATE INDEX idx_cobrancas_status     ON cobrancas(status);


-- ============================================================ 6. EXPANSÃO
-- [CAD + IA] Candidatos a franqueado. score_viabilidade e horas_uso_previstas
-- são calculados pela IA (engine/ia.ts) e decidem a aprovação do ponto.
CREATE TABLE homologacoes (
  id                    TEXT PRIMARY KEY,
  comercio              TEXT               NOT NULL,
  cnpj                  TEXT               NOT NULL,
  regiao_id             TEXT               NOT NULL REFERENCES regioes(id),
  segmento              segmento_comercio  NOT NULL,
  formato_desejado      formato_franquia   NOT NULL,
  carga_disponivel_kw   NUMERIC(6,2)       NOT NULL,  -- entrada elétrica declarada
  fluxo_diario_pessoas  INTEGER            NOT NULL,  -- movimento do comércio
  status                status_homologacao NOT NULL DEFAULT 'ANALISE',
  criado_em             TIMESTAMPTZ        NOT NULL DEFAULT now(),
  score_viabilidade     SMALLINT           NOT NULL,  -- [IA] 0–100
  horas_uso_previstas   NUMERIC(4,2)       NOT NULL,  -- [IA] h/dia por carregador
  parecer               TEXT                          -- [IA] texto do veredito
);
CREATE INDEX idx_homologacoes_status ON homologacoes(status);


-- =============================================================================
-- NOTAS DE MIGRAÇÃO
--
-- 1. Não existe tabela para os motores (demanda / tarifa / IA): eles são
--    calculados em tempo real a partir destas tabelas. Se quiser histórico das
--    decisões, criar `demanda_log` e `previsoes` depois.
--
-- 2. `tarifas` não virou tabela porque hoje o preço nasce de
--    pontos.preco_base_kwh × fatores calculados. Quando o franqueado puder
--    editar faixa a faixa, criar:
--      CREATE TABLE tarifas (ponto_id, faixa_hora_inicio, faixa_hora_fim, fator);
--
-- 3. RLS (Supabase): as três personas precisam de políticas distintas —
--    motorista vê só as próprias sessões; lojista, só o seu ponto;
--    GoodWe, a rede inteira.
--
-- 4. telemetria é a tabela de maior volume. Avaliar retenção (ex.: manter
--    detalhe por 90 dias e agregar o resto por hora).
-- =============================================================================
