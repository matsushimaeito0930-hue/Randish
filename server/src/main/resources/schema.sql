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
  restaurant_id VARCHAR(120) NOT NULL,
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
  restaurant_id VARCHAR(120) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  CONSTRAINT fk_favorite_restaurants_restaurant
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id),
  CONSTRAINT uk_favorite_user_restaurant UNIQUE (user_id, restaurant_id)
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
ALTER TABLE visit_collections DROP CONSTRAINT IF EXISTS uk_visit_user_restaurant;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_restaurants_area ON restaurants(area);
CREATE INDEX IF NOT EXISTS idx_restaurants_genre ON restaurants(genre);
CREATE INDEX IF NOT EXISTS idx_restaurants_area_genre_budget ON restaurants(area, genre, budget_min, budget_max);
CREATE INDEX IF NOT EXISTS idx_restaurants_location ON restaurants(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_enrichments_expires ON restaurant_enrichments(provider, expires_at);
CREATE INDEX IF NOT EXISTS idx_histories_user ON random_histories(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_histories_restaurant ON random_histories(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorite_restaurants(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_favorites_restaurant ON favorite_restaurants(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_visits_user ON visit_collections(user_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_visits_user_restaurant ON visit_collections(user_id, restaurant_id);
CREATE INDEX IF NOT EXISTS idx_visits_restaurant ON visit_collections(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_stamps_user ON stamps(user_id, awarded_at);
CREATE INDEX IF NOT EXISTS idx_stamps_restaurant ON stamps(restaurant_id);
