-- Datos iniciales: categorías, 21 paquetes de Robux (precios actuales), Neko Stream, Neko AI, descuentos y ajustes.
INSERT INTO "categories" ("slug","name_es","name_en","description_es","description_en","icon","sort_order") VALUES
 ('robux','Robux','Robux','Paquetes de Robux con entrega rápida.','Robux packages with fast delivery.','robux',1),
 ('neko-stream','Neko Stream','Neko Stream','Suscripciones de streaming, música y diseño.','Streaming, music and design subscriptions.','stream',2),
 ('neko-ai','Neko AI','Neko AI','Herramientas de inteligencia artificial.','Artificial intelligence tools.','ai',3)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id","slug","name_es","name_en","description_es","description_en","price_cop","price_usd","robux_amount","icon","tag_es","tag_en","sort_order","max_per_order") VALUES
 ((SELECT id FROM categories WHERE slug='robux'),'robux-50','50 Robux','50 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',2500,0.79,50,'robux',NULL,NULL,1,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-100','100 Robux','100 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',5000,1.58,100,'robux',NULL,NULL,2,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-150','150 Robux','150 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',7000,2.21,150,'robux',NULL,NULL,3,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-200','200 Robux','200 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',10000,3.16,200,'robux',NULL,NULL,4,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-300','300 Robux','300 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',13100,4.14,300,'robux',NULL,NULL,5,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-400','400 Robux','400 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',17100,5.41,400,'robux','Popular','Popular',6,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-500','500 Robux','500 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',19500,6.17,500,'robux',NULL,NULL,7,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-600','600 Robux','600 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',24500,7.75,600,'robux',NULL,NULL,8,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-800','800 Robux','800 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',32500,10.28,800,'robux',NULL,NULL,9,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-1000','1.000 Robux','1,000 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',40900,12.93,1000,'robux','Top','Top',10,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-1200','1.200 Robux','1,200 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',48000,15.18,1200,'robux',NULL,NULL,11,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-1300','1.300 Robux','1,300 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',53000,16.76,1300,'robux',NULL,NULL,12,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-1500','1.500 Robux','1,500 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',60400,19.10,1500,'robux',NULL,NULL,13,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-1700','1.700 Robux','1,700 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',67500,21.34,1700,'robux',NULL,NULL,14,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-2000','2.000 Robux','2,000 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',78800,24.92,2000,'robux',NULL,NULL,15,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-2500','2.500 Robux','2,500 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',98300,31.08,2500,'robux',NULL,NULL,16,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-2800','2.800 Robux','2,800 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',110400,34.91,2800,'robux',NULL,NULL,17,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-3000','3.000 Robux','3,000 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',124700,39.43,3000,'robux',NULL,NULL,18,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-3500','3.500 Robux','3,500 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',138200,43.70,3500,'robux',NULL,NULL,19,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-4000','4.000 Robux','4,000 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',160700,50.82,4000,'robux',NULL,NULL,20,10),
 ((SELECT id FROM categories WHERE slug='robux'),'robux-4500','4.500 Robux','4,500 Robux','Se acreditan en tu cuenta de Roblox tras verificar el pago.','Credited to your Roblox account after payment is verified.',180100,56.95,4500,'robux','Mejor valor','Best value',21,10)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id","slug","name_es","name_en","description_es","description_en","price_cop","duration_days","icon","sort_order","max_per_order") VALUES
 ((SELECT id FROM categories WHERE slug='neko-stream'),'netflix','Netflix','Netflix','Suscripción por 30 días. Se entrega por WhatsApp después de verificar el pago.','30-day subscription. Delivered via WhatsApp after payment is verified.',15000,30,'stream',1,5),
 ((SELECT id FROM categories WHERE slug='neko-stream'),'prime-video','Amazon Prime Video','Amazon Prime Video','Suscripción por 30 días. Se entrega por WhatsApp después de verificar el pago.','30-day subscription. Delivered via WhatsApp after payment is verified.',15000,30,'stream',2,5),
 ((SELECT id FROM categories WHERE slug='neko-stream'),'max','Max','Max','Suscripción por 30 días. Se entrega por WhatsApp después de verificar el pago.','30-day subscription. Delivered via WhatsApp after payment is verified.',15000,30,'stream',3,5),
 ((SELECT id FROM categories WHERE slug='neko-stream'),'paramount-plus','Paramount+','Paramount+','Suscripción por 30 días. Se entrega por WhatsApp después de verificar el pago.','30-day subscription. Delivered via WhatsApp after payment is verified.',15000,30,'stream',4,5),
 ((SELECT id FROM categories WHERE slug='neko-stream'),'crunchyroll','Crunchyroll','Crunchyroll','Suscripción por 30 días. Se entrega por WhatsApp después de verificar el pago.','30-day subscription. Delivered via WhatsApp after payment is verified.',15000,30,'stream',5,5),
 ((SELECT id FROM categories WHERE slug='neko-stream'),'disney-plus','Disney+','Disney+','Suscripción por 30 días. Se entrega por WhatsApp después de verificar el pago.','30-day subscription. Delivered via WhatsApp after payment is verified.',15000,30,'stream',6,5),
 ((SELECT id FROM categories WHERE slug='neko-stream'),'youtube-premium','YouTube Premium','YouTube Premium','Suscripción por 30 días. Se entrega por WhatsApp después de verificar el pago.','30-day subscription. Delivered via WhatsApp after payment is verified.',15000,30,'stream',7,5),
 ((SELECT id FROM categories WHERE slug='neko-stream'),'spotify','Spotify','Spotify','Suscripción por 30 días. Se entrega por WhatsApp después de verificar el pago.','30-day subscription. Delivered via WhatsApp after payment is verified.',10000,30,'stream',8,5),
 ((SELECT id FROM categories WHERE slug='neko-stream'),'canva','Canva','Canva','Suscripción por 30 días. Se entrega por WhatsApp después de verificar el pago.','30-day subscription. Delivered via WhatsApp after payment is verified.',16000,30,'stream',9,5)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "products" ("category_id","slug","name_es","name_en","description_es","description_en","price_cop","duration_days","icon","sort_order","max_per_order") VALUES
 ((SELECT id FROM categories WHERE slug='neko-ai'),'chatgpt','ChatGPT','ChatGPT','Acceso a la herramienta. Se entrega por WhatsApp después de verificar el pago.','Tool access. Delivered via WhatsApp after payment is verified.',15000,NULL,'ai',1,5),
 ((SELECT id FROM categories WHERE slug='neko-ai'),'gemini-pro','Gemini Pro','Gemini Pro','Acceso a la herramienta. Se entrega por WhatsApp después de verificar el pago.','Tool access. Delivered via WhatsApp after payment is verified.',80000,NULL,'ai',2,5)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "price_history" ("product_id","old_price_cop","new_price_cop","old_price_usd","new_price_usd","reason")
SELECT id, NULL, price_cop, NULL, price_usd, 'Precio inicial' FROM "products";
--> statement-breakpoint
INSERT INTO "discount_codes" ("code","description","kind","value") VALUES
 ('NEKO','Descuento NEKO','percent',5),
 ('MEGURU','Descuento MEGURU','percent',10),
 ('ROBUX','Descuento ROBUX','percent',5)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "settings" ("key","value") VALUES
 ('usd_rate', '3163'::jsonb),
 ('show_usd', 'true'::jsonb),
 ('whatsapp_number', '"573247359023"'::jsonb),
 ('notify_email', '"xdnola7@gmail.com"'::jsonb)
ON CONFLICT ("key") DO NOTHING;
