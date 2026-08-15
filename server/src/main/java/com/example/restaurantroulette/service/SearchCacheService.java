package com.example.restaurantroulette.service;

import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.repository.SearchCacheRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 検索結果を条件ごとに控えておく。
 *
 * <p>同じ場所から何度も引くのが普通の使い方なので、そのたびに外部APIへ行くと
 * 待たせるうえ、従量課金の Google Places が積み上がる。
 *
 * <p>失敗しても検索そのものは続けられるようにしてある。キャッシュの不具合で
 * アプリが使えなくなるのは本末転倒なため、読み書きの例外はすべて飲み込む。
 */
@Service
public class SearchCacheService {
  private static final Logger logger = LoggerFactory.getLogger(SearchCacheService.class);
  /** 店舗情報は数分で変わるものではないので、長めに持つ。 */
  private static final Duration CACHE_TTL = Duration.ofHours(12);
  /** 掃除の間隔。毎回消しにいくとDBへの往復が増えるため、時々でよい。 */
  private static final Duration CLEANUP_INTERVAL = Duration.ofHours(1);

  private final SearchCacheRepository searchCacheRepository;
  private final ObjectMapper objectMapper;
  private final AtomicLong lastCleanupEpochMillis = new AtomicLong(0);

  public SearchCacheService(SearchCacheRepository searchCacheRepository, ObjectMapper objectMapper) {
    this.searchCacheRepository = searchCacheRepository;
    this.objectMapper = objectMapper;
  }

  /**
   * 検索条件から一意のキーを作る。
   *
   * <p>座標は小数第3位（約110m）まで丸める。GPSは同じ場所に立っていても毎回わずかに違う値を返すので、
   * そのまま使うとキャッシュがまず当たらない。
   */
  public String buildKey(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range) {
    return String.join("|",
        normalize(area),
        normalize(genre),
        budgetMin == null ? "" : budgetMin.toString(),
        budgetMax == null ? "" : budgetMax.toString(),
        latitude == null ? "" : String.format(Locale.ROOT, "%.3f", latitude),
        longitude == null ? "" : String.format(Locale.ROOT, "%.3f", longitude),
        range == null ? "" : range.toString());
  }

  public Optional<List<Restaurant>> find(String cacheKey) {
    try {
      Optional<SearchCacheRepository.CachedSearch> cached = searchCacheRepository.find(cacheKey);
      if (cached.isEmpty()) {
        return Optional.empty();
      }
      if (Duration.between(cached.get().fetchedAt(), Instant.now()).compareTo(CACHE_TTL) >= 0) {
        return Optional.empty();
      }
      List<Restaurant> restaurants = objectMapper.readValue(
          cached.get().payload(), new TypeReference<List<Restaurant>>() { });
      searchCacheRepository.markHit(cacheKey);
      logger.info("[RANDISH_CACHE] hit key={} count={}", cacheKey, restaurants.size());
      return Optional.of(restaurants);
    } catch (RuntimeException | com.fasterxml.jackson.core.JsonProcessingException exception) {
      // 控えが壊れていても検索は続けられる。
      logger.warn("[RANDISH_CACHE] read failed key={}", cacheKey, exception);
      return Optional.empty();
    }
  }

  public void save(String cacheKey, List<Restaurant> restaurants) {
    if (restaurants == null || restaurants.isEmpty()) {
      // 0件を控えると、店が増えても期限まで0件を返し続けてしまう。
      return;
    }
    try {
      searchCacheRepository.save(cacheKey, objectMapper.writeValueAsString(restaurants), restaurants.size());
      cleanupOccasionally();
    } catch (RuntimeException | com.fasterxml.jackson.core.JsonProcessingException exception) {
      logger.warn("[RANDISH_CACHE] write failed key={}", cacheKey, exception);
    }
  }

  /** 期限切れを時々まとめて消す。放置すると無料枠のDB容量を食いつぶす。 */
  private void cleanupOccasionally() {
    long now = System.currentTimeMillis();
    long last = lastCleanupEpochMillis.get();
    if (now - last < CLEANUP_INTERVAL.toMillis()) {
      return;
    }
    if (!lastCleanupEpochMillis.compareAndSet(last, now)) {
      return;
    }
    try {
      int deleted = searchCacheRepository.deleteExpired(Instant.now().minus(CACHE_TTL));
      if (deleted > 0) {
        logger.info("[RANDISH_CACHE] cleaned up expired entries count={}", deleted);
      }
    } catch (RuntimeException exception) {
      logger.warn("[RANDISH_CACHE] cleanup failed", exception);
    }
  }

  private String normalize(String value) {
    return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
  }
}
