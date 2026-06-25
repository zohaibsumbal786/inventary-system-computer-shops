
-- ============================================================
-- 1. Tighten SELECT policies: require a role (admin or staff)
-- ============================================================
DROP POLICY IF EXISTS "auth read items" ON public.inventory_items;
CREATE POLICY "roled users read items" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (public.is_authenticated_user(auth.uid()));

DROP POLICY IF EXISTS "auth read invoices" ON public.invoices;
CREATE POLICY "roled users read invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.is_authenticated_user(auth.uid()));

DROP POLICY IF EXISTS "auth read invoice_items" ON public.invoice_items;
CREATE POLICY "roled users read invoice_items" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (public.is_authenticated_user(auth.uid()));

DROP POLICY IF EXISTS "auth read payments" ON public.payments;
CREATE POLICY "roled users read payments" ON public.payments
  FOR SELECT TO authenticated
  USING (public.is_authenticated_user(auth.uid()));

DROP POLICY IF EXISTS "auth users read dealers" ON public.dealers;
CREATE POLICY "roled users read dealers" ON public.dealers
  FOR SELECT TO authenticated
  USING (public.is_authenticated_user(auth.uid()));

-- ============================================================
-- 2. Lock direct inventory mutations to admin
--    (sales mutate via SECURITY DEFINER RPC `create_sale`)
-- ============================================================
DROP POLICY IF EXISTS "auth insert items" ON public.inventory_items;
DROP POLICY IF EXISTS "auth update items" ON public.inventory_items;
CREATE POLICY "admins insert items" ON public.inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update items" ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "auth insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "auth update invoices" ON public.invoices;
CREATE POLICY "admins insert invoices" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update invoices" ON public.invoices
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "auth insert invoice_items" ON public.invoice_items;
CREATE POLICY "admins insert invoice_items" ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- 3. Payments & dealers: allow any roled user (admin OR staff)
-- ============================================================
DROP POLICY IF EXISTS "auth insert payments" ON public.payments;
CREATE POLICY "roled users insert payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_authenticated_user(auth.uid()));

DROP POLICY IF EXISTS "auth users insert dealers" ON public.dealers;
DROP POLICY IF EXISTS "auth users update dealers" ON public.dealers;
CREATE POLICY "roled users insert dealers" ON public.dealers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_authenticated_user(auth.uid()));
CREATE POLICY "roled users update dealers" ON public.dealers
  FOR UPDATE TO authenticated
  USING (public.is_authenticated_user(auth.uid()))
  WITH CHECK (public.is_authenticated_user(auth.uid()));

-- ============================================================
-- 4. Activity log = audit trail. Admin-only read, system writes.
-- ============================================================
DROP POLICY IF EXISTS "auth read activity" ON public.activity_log;
DROP POLICY IF EXISTS "auth insert activity" ON public.activity_log;
CREATE POLICY "admins read activity" ON public.activity_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "system writes activity" ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_authenticated_user(auth.uid()));

-- ============================================================
-- 5. Harden RPC entry points with server-side role checks
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_sale(
  _dealer_id uuid, _item_ids uuid[], _unit_prices numeric[],
  _amount_received numeric, _remarks text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF NOT public.is_authenticated_user(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: user has no shop role';
  END IF;
  IF array_length(_item_ids, 1) IS NULL OR array_length(_item_ids, 1) <> array_length(_unit_prices, 1) THEN
    RAISE EXCEPTION 'Items and prices length mismatch';
  END IF;

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
    INSERT INTO public.activity_log (inventory_item_id, dealer_id, invoice_id, action, performed_by, details)
    VALUES (_item_ids[i], _dealer_id, new_invoice_id, 'sold', auth.uid(),
            jsonb_build_object('unit_price', _unit_prices[i], 'invoice_number', inv_no));
  END LOOP;

  INSERT INTO public.activity_log (dealer_id, invoice_id, action, performed_by, details)
  VALUES (_dealer_id, new_invoice_id, 'invoice_created', auth.uid(),
          jsonb_build_object('invoice_number', inv_no, 'subtotal', subtotal, 'received', LEAST(_amount_received, subtotal), 'items', array_length(_item_ids, 1)));

  RETURN new_invoice_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_inventory_batch(
  _category text, _brand text, _model_name text, _ram text, _storage text,
  _screen_size text, _description text, _serial_number text,
  _unit_cost_price numeric, _unit_sale_price numeric, _photo_url text, _quantity integer
)
RETURNS SETOF public.inventory_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  i INT;
  new_row public.inventory_items;
  tag TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;
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
    INSERT INTO public.activity_log (inventory_item_id, action, performed_by, details)
    VALUES (new_row.id, 'added', auth.uid(),
            jsonb_build_object('tag_code', tag, 'brand', _brand, 'model', _model_name));
    RETURN NEXT new_row;
  END LOOP;
END;
$function$;

-- ============================================================
-- 6. Audit triggers: payments + inventory updates
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_payment_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.activity_log (dealer_id, invoice_id, action, performed_by, details)
  VALUES (NEW.dealer_id, NEW.invoice_id, 'payment_received', COALESCE(NEW.created_by, auth.uid()),
          jsonb_build_object('amount', NEW.amount, 'method', NEW.method,
                             'remarks', NEW.remarks));
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_payment ON public.payments;
CREATE TRIGGER trg_log_payment
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.log_payment_activity();

CREATE OR REPLACE FUNCTION public.log_inventory_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.activity_log (inventory_item_id, action, performed_by, details)
    VALUES (NEW.id, 'status_changed', auth.uid(),
            jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF NEW.unit_sale_price IS DISTINCT FROM OLD.unit_sale_price
     OR NEW.unit_cost_price IS DISTINCT FROM OLD.unit_cost_price THEN
    INSERT INTO public.activity_log (inventory_item_id, action, performed_by, details)
    VALUES (NEW.id, 'price_updated', auth.uid(),
            jsonb_build_object('cost_from', OLD.unit_cost_price, 'cost_to', NEW.unit_cost_price,
                               'sale_from', OLD.unit_sale_price, 'sale_to', NEW.unit_sale_price));
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_inventory ON public.inventory_items;
CREATE TRIGGER trg_log_inventory
  AFTER UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.log_inventory_update();
