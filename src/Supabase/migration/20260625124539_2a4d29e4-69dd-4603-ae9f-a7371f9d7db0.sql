
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated_user(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- Auto-assign role on signup: first user becomes admin, others staff
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN user_count = 0 THEN 'admin'::public.app_role ELSE 'staff'::public.app_role END);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Shop settings
CREATE TABLE public.shop_settings (
  id INT PRIMARY KEY DEFAULT 1,
  shop_name TEXT NOT NULL DEFAULT 'My Computer Shop',
  address TEXT,
  contact TEXT,
  logo_url TEXT,
  currency TEXT NOT NULL DEFAULT 'PKR',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT singleton CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE ON public.shop_settings TO authenticated;
GRANT ALL ON public.shop_settings TO service_role;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users read settings" ON public.shop_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage settings" ON public.shop_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.shop_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Dealers
CREATE TABLE public.dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_number TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dealers TO authenticated;
GRANT ALL ON public.dealers TO service_role;
ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth users read dealers" ON public.dealers FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth users insert dealers" ON public.dealers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth users update dealers" ON public.dealers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admins delete dealers" ON public.dealers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX dealers_name_idx ON public.dealers (lower(name));

-- Inventory items
CREATE TYPE public.item_status AS ENUM ('in_stock', 'sold', 'reserved');

-- Tag code sequence
CREATE SEQUENCE public.tag_code_seq START 1;

CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_code TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  brand TEXT,
  model_name TEXT,
  ram TEXT,
  storage TEXT,
  screen_size TEXT,
  serial_number TEXT,
  description TEXT,
  unit_cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_sale_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.item_status NOT NULL DEFAULT 'in_stock',
  photo_url TEXT,
  date_added TIMESTAMPTZ NOT NULL DEFAULT now(),
  added_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read items" ON public.inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert items" ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update items" ON public.inventory_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admins delete items" ON public.inventory_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX items_status_idx ON public.inventory_items (status);
CREATE INDEX items_tag_idx ON public.inventory_items (tag_code);

-- Tag generator
CREATE OR REPLACE FUNCTION public.generate_tag_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n BIGINT;
BEGIN
  n := nextval('public.tag_code_seq');
  RETURN 'INV-' || lpad(n::TEXT, 5, '0');
END;
$$;

-- Invoices
CREATE TYPE public.invoice_status AS ENUM ('paid', 'partial', 'unpaid');

CREATE SEQUENCE public.invoice_no_seq START 1;

CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE RESTRICT,
  sale_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_received NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'unpaid',
  remarks TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update invoices" ON public.invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "admins delete invoices" ON public.invoices FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX invoices_dealer_idx ON public.invoices (dealer_id);

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE n BIGINT;
BEGIN
  n := nextval('public.invoice_no_seq');
  RETURN 'INV-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::TEXT, 4, '0');
END;
$$;

-- Invoice items
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL,
  UNIQUE(inventory_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read invoice_items" ON public.invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert invoice_items" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admins delete invoice_items" ON public.invoice_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  method TEXT NOT NULL DEFAULT 'cash',
  remarks TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admins delete payments" ON public.payments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX payments_dealer_idx ON public.payments (dealer_id);

-- Activity log
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  dealer_id UUID REFERENCES public.dealers(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read activity" ON public.activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert activity" ON public.activity_log FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger: when invoice payment changes, recompute status
CREATE OR REPLACE FUNCTION public.compute_invoice_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.amount_received >= NEW.subtotal AND NEW.subtotal > 0 THEN
    NEW.status := 'paid';
  ELSIF NEW.amount_received > 0 THEN
    NEW.status := 'partial';
  ELSE
    NEW.status := 'unpaid';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_invoice_status BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.compute_invoice_status();

-- Trigger: when payment inserted, allocate to invoice(s)
CREATE OR REPLACE FUNCTION public.apply_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  remaining NUMERIC := NEW.amount;
  inv RECORD;
  to_apply NUMERIC;
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    UPDATE public.invoices
       SET amount_received = amount_received + NEW.amount
     WHERE id = NEW.invoice_id;
    RETURN NEW;
  END IF;
  -- FIFO: oldest unpaid/partial invoices first
  FOR inv IN
    SELECT id, subtotal, amount_received FROM public.invoices
    WHERE dealer_id = NEW.dealer_id AND amount_received < subtotal
    ORDER BY sale_date ASC
  LOOP
    EXIT WHEN remaining <= 0;
    to_apply := LEAST(remaining, inv.subtotal - inv.amount_received);
    UPDATE public.invoices SET amount_received = amount_received + to_apply WHERE id = inv.id;
    remaining := remaining - to_apply;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_apply_payment AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.apply_payment();

-- Server-side sale creation function
CREATE OR REPLACE FUNCTION public.create_sale(
  _dealer_id UUID,
  _item_ids UUID[],
  _unit_prices NUMERIC[],
  _amount_received NUMERIC,
  _remarks TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_invoice_id UUID;
  inv_no TEXT;
  subtotal NUMERIC := 0;
  i INT;
  item_status public.item_status;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF array_length(_item_ids, 1) IS NULL OR array_length(_item_ids, 1) <> array_length(_unit_prices, 1) THEN
    RAISE EXCEPTION 'Items and prices length mismatch';
  END IF;

  -- Verify items in_stock
  FOR i IN 1..array_length(_item_ids, 1) LOOP
    SELECT status INTO item_status FROM public.inventory_items WHERE id = _item_ids[i] FOR UPDATE;
    IF item_status IS NULL THEN RAISE EXCEPTION 'Item not found'; END IF;
    IF item_status <> 'in_stock' THEN RAISE EXCEPTION 'Item % is not in stock', _item_ids[i]; END IF;
    subtotal := subtotal + _unit_prices[i];
  END LOOP;

  inv_no := public.generate_invoice_number();
  INSERT INTO public.invoices (invoice_number, dealer_id, subtotal, amount_received, remarks, created_by)
  VALUES (inv_no, _dealer_id, subtotal, LEAST(_amount_received, subtotal), _remarks, auth.uid())
  RETURNING id INTO new_invoice_id;

  FOR i IN 1..array_length(_item_ids, 1) LOOP
    INSERT INTO public.invoice_items (invoice_id, inventory_item_id, quantity, unit_price, line_total)
    VALUES (new_invoice_id, _item_ids[i], 1, _unit_prices[i], _unit_prices[i]);
    UPDATE public.inventory_items SET status = 'sold' WHERE id = _item_ids[i];
    INSERT INTO public.activity_log (inventory_item_id, dealer_id, invoice_id, action, performed_by)
    VALUES (_item_ids[i], _dealer_id, new_invoice_id, 'sold', auth.uid());
  END LOOP;

  RETURN new_invoice_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_sale(UUID, UUID[], NUMERIC[], NUMERIC, TEXT) TO authenticated;

-- Bulk add inventory items
CREATE OR REPLACE FUNCTION public.add_inventory_batch(
  _category TEXT, _brand TEXT, _model_name TEXT, _ram TEXT, _storage TEXT,
  _screen_size TEXT, _description TEXT, _serial_number TEXT,
  _unit_cost_price NUMERIC, _unit_sale_price NUMERIC, _photo_url TEXT, _quantity INT
) RETURNS SETOF public.inventory_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i INT;
  new_row public.inventory_items;
  tag TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _quantity < 1 THEN _quantity := 1; END IF;
  FOR i IN 1.._quantity LOOP
    tag := public.generate_tag_code();
    INSERT INTO public.inventory_items
      (tag_code, category, brand, model_name, ram, storage, screen_size, description, serial_number,
       unit_cost_price, unit_sale_price, photo_url, added_by)
    VALUES
      (tag, _category, _brand, _model_name, _ram, _storage, _screen_size, _description,
       CASE WHEN _quantity = 1 THEN _serial_number ELSE NULL END,
       _unit_cost_price, _unit_sale_price, _photo_url, auth.uid())
    RETURNING * INTO new_row;
    INSERT INTO public.activity_log (inventory_item_id, action, performed_by)
    VALUES (new_row.id, 'added', auth.uid());
    RETURN NEXT new_row;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_inventory_batch(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TEXT,INT) TO authenticated;
