-- Owner's request: the LKs Attire clothing-brand website at ৳12,000 regular price with 50% off → ৳6,000 now.
-- Both LKs Attire packages (the showcase and the live copy). The ৳12,000 shows struck through next to ৳6,000.
-- The offer has no end date; change or switch it off any time from the package page in the admin.
UPDATE packages SET base_price = 12000, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE slug IN ('lks-attire', 'clothing-website');

INSERT INTO offers (scope, scope_id, title, discount_type, discount_value, show_timer, is_active)
SELECT 'package', p.id, '৫০% ছাড়', 'percent', 50, 0, 1
FROM packages p
WHERE p.slug IN ('lks-attire', 'clothing-website')
  AND NOT EXISTS (SELECT 1 FROM offers o WHERE o.scope = 'package' AND o.scope_id = p.id AND o.is_active = 1);
