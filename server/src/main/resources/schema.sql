CREATE TABLE IF NOT EXISTS app_users (
  id VARCHAR(120) PRIMARY KEY,
  email VARCHAR(255),
  display_name VARCHAR(120),
  password_hash VARCHAR(255),
  password_salt VARCHAR(120),
  auth_provider VARCHAR(40) NOT NULL DEFAULT 'EMAIL',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pending_email_registrations (
  id VARCHAR(120) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(120) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS premium_products (
  id VARCHAR(120) PRIMARY KEY,
  entitlement_key VARCHAR(80) NOT NULL DEFAULT 'premium',
  provider VARCHAR(40) NOT NULL,
  provider_product_id VARCHAR(255) NOT NULL,
  provider_price_id VARCHAR(255) NOT NULL DEFAULT '',
  display_name VARCHAR(120) NOT NULL,
  billing_period VARCHAR(40) NOT NULL,
  price_amount INT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'JPY',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_premium_products_provider CHECK (
    provider IN ('STRIPE', 'APP_STORE', 'GOOGLE_PLAY')
  ),
  CONSTRAINT ck_premium_products_period CHECK (
    billing_period IN ('MONTHLY', 'YEARLY', 'ONE_TIME')
  ),
  CONSTRAINT ck_premium_products_price CHECK (price_amount >= 0),
  CONSTRAINT uk_premium_products_provider_product_price
    UNIQUE (provider, provider_product_id, provider_price_id)
);

CREATE TABLE IF NOT EXISTS billing_customers (
  id VARCHAR(120) PRIMARY KEY,
  user_id VARCHAR(120) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  environment VARCHAR(40) NOT NULL DEFAULT 'PRODUCTION',
  provider_customer_id VARCHAR(255) NOT NULL,
  email_at_provider VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_customers_user
    FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT ck_billing_customers_provider CHECK (
    provider IN ('STRIPE', 'APP_STORE', 'GOOGLE_PLAY')
  ),
  CONSTRAINT ck_billing_customers_environment CHECK (
    environment IN ('SANDBOX', 'PRODUCTION')
  ),
  CONSTRAINT uk_billing_customers_provider_customer
    UNIQUE (provider, environment, provider_customer_id),
  CONSTRAINT uk_billing_customers_user_provider
    UNIQUE (user_id, provider, environment)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id VARCHAR(120) PRIMARY KEY,
  user_id VARCHAR(120) NOT NULL,
  premium_product_id VARCHAR(120),
  provider VARCHAR(40) NOT NULL,
  environment VARCHAR(40) NOT NULL DEFAULT 'PRODUCTION',
  provider_subscription_id VARCHAR(255) NOT NULL,
  provider_customer_id VARCHAR(255),
  provider_product_id VARCHAR(255),
  provider_price_id VARCHAR(255),
  status VARCHAR(40) NOT NULL,
  raw_status VARCHAR(80),
  entitlement_key VARCHAR(80) NOT NULL DEFAULT 'premium',
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  trial_start TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  grace_period_end TIMESTAMP WITH TIME ZONE,
  last_payment_failed_at TIMESTAMP WITH TIME ZONE,
  original_transaction_id VARCHAR(255),
  latest_transaction_id VARCHAR(255),
  purchase_token_hash VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_subscriptions_user
    FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT fk_subscriptions_product
    FOREIGN KEY (premium_product_id) REFERENCES premium_products(id),
  CONSTRAINT ck_subscriptions_provider CHECK (
    provider IN ('STRIPE', 'APP_STORE', 'GOOGLE_PLAY')
  ),
  CONSTRAINT ck_subscriptions_environment CHECK (
    environment IN ('SANDBOX', 'PRODUCTION')
  ),
  CONSTRAINT ck_subscriptions_status CHECK (
    status IN (
      'incomplete',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'expired',
      'paused',
      'refunded'
    )
  ),
  CONSTRAINT ck_subscriptions_period CHECK (
    current_period_end IS NULL
    OR current_period_start IS NULL
    OR current_period_end >= current_period_start
  ),
  CONSTRAINT uk_subscriptions_provider_subscription
    UNIQUE (provider, environment, provider_subscription_id)
);

CREATE TABLE IF NOT EXISTS premium_grants (
  id VARCHAR(120) PRIMARY KEY,
  user_id VARCHAR(120) NOT NULL,
  entitlement_key VARCHAR(80) NOT NULL DEFAULT 'premium',
  grant_type VARCHAR(40) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at TIMESTAMP WITH TIME ZONE,
  granted_by VARCHAR(120),
  revoked_at TIMESTAMP WITH TIME ZONE,
  note VARCHAR(1000),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_premium_grants_user
    FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT fk_premium_grants_granted_by
    FOREIGN KEY (granted_by) REFERENCES app_users(id),
  CONSTRAINT ck_premium_grants_type CHECK (
    grant_type IN ('ADMIN', 'BETA', 'FRIEND', 'FAMILY', 'PROMO', 'SUPPORT')
  ),
  CONSTRAINT ck_premium_grants_status CHECK (
    status IN ('active', 'revoked', 'expired')
  ),
  CONSTRAINT ck_premium_grants_period CHECK (
    ends_at IS NULL OR ends_at > starts_at
  )
);

CREATE TABLE IF NOT EXISTS payment_events (
  id VARCHAR(120) PRIMARY KEY,
  provider VARCHAR(40) NOT NULL,
  environment VARCHAR(40) NOT NULL DEFAULT 'PRODUCTION',
  provider_event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  provider_created_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_status VARCHAR(40) NOT NULL DEFAULT 'received',
  error_message VARCHAR(1000),
  raw_payload TEXT,
  CONSTRAINT ck_payment_events_provider CHECK (
    provider IN ('STRIPE', 'APP_STORE', 'GOOGLE_PLAY')
  ),
  CONSTRAINT ck_payment_events_environment CHECK (
    environment IN ('SANDBOX', 'PRODUCTION')
  ),
  CONSTRAINT ck_payment_events_status CHECK (
    processing_status IN ('received', 'processing', 'processed', 'ignored', 'failed')
  ),
  CONSTRAINT uk_payment_events_provider_event
    UNIQUE (provider, environment, provider_event_id)
);

CREATE TABLE IF NOT EXISTS payment_records (
  id VARCHAR(120) PRIMARY KEY,
  user_id VARCHAR(120),
  subscription_id VARCHAR(120),
  provider VARCHAR(40) NOT NULL,
  environment VARCHAR(40) NOT NULL DEFAULT 'PRODUCTION',
  provider_payment_id VARCHAR(255) NOT NULL,
  provider_invoice_id VARCHAR(255),
  amount_total INT NOT NULL,
  amount_paid INT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'JPY',
  status VARCHAR(40) NOT NULL,
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE,
  raw_payload TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_records_user
    FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT fk_payment_records_subscription
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
  CONSTRAINT ck_payment_records_provider CHECK (
    provider IN ('STRIPE', 'APP_STORE', 'GOOGLE_PLAY')
  ),
  CONSTRAINT ck_payment_records_environment CHECK (
    environment IN ('SANDBOX', 'PRODUCTION')
  ),
  CONSTRAINT ck_payment_records_amount CHECK (
    amount_total >= 0 AND amount_paid >= 0
  ),
  CONSTRAINT ck_payment_records_status CHECK (
    status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'void')
  ),
  CONSTRAINT ck_payment_records_period CHECK (
    period_end IS NULL OR period_start IS NULL OR period_end >= period_start
  ),
  CONSTRAINT uk_payment_records_provider_payment
    UNIQUE (provider, environment, provider_payment_id)
);

CREATE TABLE IF NOT EXISTS feature_usage_counters (
  id VARCHAR(120) PRIMARY KEY,
  user_id VARCHAR(120) NOT NULL,
  feature_key VARCHAR(80) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  usage_count INT NOT NULL DEFAULT 0,
  limit_snapshot INT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_feature_usage_counters_user
    FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT ck_feature_usage_counters_usage CHECK (usage_count >= 0),
  CONSTRAINT ck_feature_usage_counters_limit CHECK (
    limit_snapshot IS NULL OR limit_snapshot >= 0
  ),
  CONSTRAINT ck_feature_usage_counters_period CHECK (period_end >= period_start),
  CONSTRAINT uk_feature_usage_counters_user_feature_period
    UNIQUE (user_id, feature_key, period_start)
);

CREATE TABLE IF NOT EXISTS restaurants (
  id VARCHAR(120) PRIMARY KEY,
  external_provider VARCHAR(80) NOT NULL,
  external_id VARCHAR(180) NOT NULL,
  name VARCHAR(255) NOT NULL,
  area VARCHAR(120) NOT NULL,
  genre VARCHAR(120) NOT NULL,
  budget_min INT NOT NULL,
  budget_max INT NOT NULL,
  rating DOUBLE PRECISION NOT NULL,
  minutes INT NOT NULL,
  address VARCHAR(500) NOT NULL,
  photo_url VARCHAR(1000),
  note VARCHAR(1000),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  source_synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uk_restaurants_external UNIQUE (external_provider, external_id),
  CONSTRAINT ck_restaurants_budget CHECK (budget_min >= 0 AND budget_max >= budget_min),
  CONSTRAINT ck_restaurants_rating CHECK (rating >= 0 AND rating <= 5),
  CONSTRAINT ck_restaurants_minutes CHECK (minutes >= 0)
);

CREATE TABLE IF NOT EXISTS restaurant_enrichments (
  restaurant_id VARCHAR(120) NOT NULL,
  provider VARCHAR(80) NOT NULL,
  provider_place_id VARCHAR(180),
  rating DOUBLE PRECISION,
  maps_uri VARCHAR(1000),
  open_now BOOLEAN,
  raw_payload TEXT,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (restaurant_id, provider),
  CONSTRAINT fk_restaurant_enrichments_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT ck_restaurant_enrichments_rating CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5))
);

CREATE TABLE IF NOT EXISTS random_histories (
  id VARCHAR(120) PRIMARY KEY,
  user_id VARCHAR(120) NOT NULL,
  restaurant_id VARCHAR(120),
  provider VARCHAR(80) NOT NULL DEFAULT 'RANDISH_SEED',
  provider_place_id VARCHAR(255) NOT NULL DEFAULT '',
  area VARCHAR(120),
  genre VARCHAR(120),
  budget_min INT,
  budget_max INT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  range_meters INT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT fk_random_histories_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT ck_random_histories_budget CHECK (
    budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max
  ),
  CONSTRAINT ck_random_histories_range CHECK (range_meters IS NULL OR range_meters > 0)
);

CREATE TABLE IF NOT EXISTS favorite_restaurants (
  id VARCHAR(120) PRIMARY KEY,
  user_id VARCHAR(120) NOT NULL,
  provider VARCHAR(80) NOT NULL DEFAULT 'RANDISH_SEED',
  provider_place_id VARCHAR(255) NOT NULL DEFAULT '',
  restaurant_id VARCHAR(120),
  saved_area VARCHAR(120),
  saved_genre VARCHAR(120),
  saved_budget_min INT,
  saved_budget_max INT,
  saved_range_meters INT,
  user_memo VARCHAR(1000),
  user_tags VARCHAR(1000),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT fk_favorite_restaurants_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT ck_favorite_budget CHECK (
    saved_budget_min IS NULL OR saved_budget_max IS NULL OR saved_budget_min <= saved_budget_max
  ),
  CONSTRAINT ck_favorite_range CHECK (
    saved_range_meters IS NULL OR saved_range_meters > 0
  )
);

CREATE TABLE IF NOT EXISTS visit_collections (
  id VARCHAR(120) PRIMARY KEY,
  user_id VARCHAR(120) NOT NULL,
  restaurant_id VARCHAR(120) NOT NULL,
  visit_date DATE NOT NULL,
  photo_url VARCHAR(1000),
  memo VARCHAR(1000),
  rating INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT fk_visit_collections_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT ck_visit_collections_rating CHECK (rating >= 0 AND rating <= 5)
);

CREATE TABLE IF NOT EXISTS expense_memos (
  id VARCHAR(120) PRIMARY KEY,
  user_id VARCHAR(120) NOT NULL,
  visit_collection_id VARCHAR(120),
  restaurant_id VARCHAR(120),
  spent_on DATE NOT NULL,
  amount INT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'JPY',
  memo VARCHAR(1000),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_expense_memos_user
    FOREIGN KEY (user_id) REFERENCES app_users(id),
  CONSTRAINT fk_expense_memos_visit
    FOREIGN KEY (visit_collection_id) REFERENCES visit_collections(id),
  CONSTRAINT fk_expense_memos_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT ck_expense_memos_amount CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS stamps (
  id VARCHAR(120) PRIMARY KEY,
  user_id VARCHAR(120) NOT NULL,
  restaurant_id VARCHAR(120) NOT NULL,
  stamp_type VARCHAR(80) NOT NULL,
  awarded_at TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT fk_stamps_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT ck_stamps_type CHECK (
    stamp_type IN ('FIRST_VISIT', 'GENRE_COLLECTOR', 'AREA_COLLECTOR', 'REPEAT_VISIT')
  ),
  CONSTRAINT uk_stamp_user_restaurant_type UNIQUE (user_id, restaurant_id, stamp_type)
);

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS source_synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS password_salt VARCHAR(120);
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(40) NOT NULL DEFAULT 'EMAIL';
ALTER TABLE random_histories ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE random_histories ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE random_histories ADD COLUMN IF NOT EXISTS range_meters INT;
ALTER TABLE random_histories ADD COLUMN IF NOT EXISTS provider VARCHAR(80) NOT NULL DEFAULT 'RANDISH_SEED';
ALTER TABLE random_histories ADD COLUMN IF NOT EXISTS provider_place_id VARCHAR(255) NOT NULL DEFAULT '';
UPDATE random_histories
SET provider = COALESCE((SELECT restaurants.external_provider FROM restaurants WHERE restaurants.id = random_histories.restaurant_id), provider)
WHERE restaurant_id IS NOT NULL;
UPDATE random_histories
SET provider_place_id = COALESCE((SELECT restaurants.external_id FROM restaurants WHERE restaurants.id = random_histories.restaurant_id), provider_place_id)
WHERE restaurant_id IS NOT NULL AND (provider_place_id IS NULL OR provider_place_id = '');
ALTER TABLE random_histories ALTER COLUMN restaurant_id DROP NOT NULL;
UPDATE random_histories
SET restaurant_id = NULL
WHERE provider <> 'RANDISH_SEED';
ALTER TABLE favorite_restaurants ADD COLUMN IF NOT EXISTS provider VARCHAR(80) NOT NULL DEFAULT 'RANDISH_SEED';
ALTER TABLE favorite_restaurants ADD COLUMN IF NOT EXISTS provider_place_id VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE favorite_restaurants ADD COLUMN IF NOT EXISTS saved_area VARCHAR(120);
ALTER TABLE favorite_restaurants ADD COLUMN IF NOT EXISTS saved_genre VARCHAR(120);
ALTER TABLE favorite_restaurants ADD COLUMN IF NOT EXISTS saved_budget_min INT;
ALTER TABLE favorite_restaurants ADD COLUMN IF NOT EXISTS saved_budget_max INT;
ALTER TABLE favorite_restaurants ADD COLUMN IF NOT EXISTS saved_range_meters INT;
ALTER TABLE favorite_restaurants ADD COLUMN IF NOT EXISTS user_memo VARCHAR(1000);
ALTER TABLE favorite_restaurants ADD COLUMN IF NOT EXISTS user_tags VARCHAR(1000);
ALTER TABLE favorite_restaurants ALTER COLUMN restaurant_id DROP NOT NULL;
ALTER TABLE favorite_restaurants DROP CONSTRAINT IF EXISTS uk_favorite_user_restaurant;
UPDATE favorite_restaurants
SET provider_place_id = restaurant_id
WHERE (provider_place_id IS NULL OR provider_place_id = '') AND restaurant_id IS NOT NULL;
ALTER TABLE visit_collections DROP CONSTRAINT IF EXISTS uk_visit_user_restaurant;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_email_registrations_token ON pending_email_registrations(token_hash);
CREATE INDEX IF NOT EXISTS idx_pending_email_registrations_email ON pending_email_registrations(email, created_at);
CREATE INDEX IF NOT EXISTS idx_pending_email_registrations_expires ON pending_email_registrations(expires_at);
CREATE INDEX IF NOT EXISTS idx_premium_products_provider ON premium_products(provider, active);
CREATE INDEX IF NOT EXISTS idx_billing_customers_user ON billing_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_entitlement ON subscriptions(user_id, entitlement_key, status, current_period_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_customer ON subscriptions(provider, environment, provider_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_original_transaction ON subscriptions(provider, environment, original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_purchase_token ON subscriptions(provider, environment, purchase_token_hash);
CREATE INDEX IF NOT EXISTS idx_premium_grants_user_entitlement ON premium_grants(user_id, entitlement_key, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_payment_events_status ON payment_events(processing_status, received_at);
CREATE INDEX IF NOT EXISTS idx_payment_records_user ON payment_records(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_records_subscription ON payment_records(subscription_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feature_usage_user_feature ON feature_usage_counters(user_id, feature_key, period_start);
CREATE INDEX IF NOT EXISTS idx_restaurants_area ON restaurants(area);
CREATE INDEX IF NOT EXISTS idx_restaurants_genre ON restaurants(genre);
CREATE INDEX IF NOT EXISTS idx_restaurants_area_genre_budget ON restaurants(area, genre, budget_min, budget_max);
CREATE INDEX IF NOT EXISTS idx_restaurants_location ON restaurants(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_enrichments_expires ON restaurant_enrichments(provider, expires_at);
CREATE INDEX IF NOT EXISTS idx_histories_user ON random_histories(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_histories_restaurant ON random_histories(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorite_restaurants(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_favorites_restaurant ON favorite_restaurants(restaurant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_user_provider_place ON favorite_restaurants(user_id, provider, provider_place_id);
CREATE INDEX IF NOT EXISTS idx_visits_user ON visit_collections(user_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_visits_user_restaurant ON visit_collections(user_id, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_visits_restaurant ON visit_collections(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_expense_memos_user ON expense_memos(user_id, spent_on);
CREATE INDEX IF NOT EXISTS idx_expense_memos_visit ON expense_memos(visit_collection_id);
CREATE INDEX IF NOT EXISTS idx_expense_memos_restaurant ON expense_memos(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_stamps_user ON stamps(user_id, awarded_at);
CREATE INDEX IF NOT EXISTS idx_stamps_restaurant ON stamps(restaurant_id);
