-- Numeração sequencial numérica de pedidos (somente dígitos).
CREATE SEQUENCE IF NOT EXISTS app.seq_numero_pedido AS bigint START WITH 1 INCREMENT BY 1;

ALTER TABLE app.tab_venda
  ADD COLUMN IF NOT EXISTS numero_pedido bigint;

UPDATE app.tab_venda
SET numero_pedido = nextval('app.seq_numero_pedido')
WHERE numero_pedido IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unq_tab_venda_numero_pedido'
  ) THEN
    ALTER TABLE app.tab_venda
      ADD CONSTRAINT unq_tab_venda_numero_pedido UNIQUE (numero_pedido);
  END IF;
END
$$;

ALTER TABLE app.tab_venda
  ALTER COLUMN numero_pedido SET DEFAULT nextval('app.seq_numero_pedido');

CREATE INDEX IF NOT EXISTS tab_venda_numero_pedido_idx
  ON app.tab_venda (numero_pedido);
