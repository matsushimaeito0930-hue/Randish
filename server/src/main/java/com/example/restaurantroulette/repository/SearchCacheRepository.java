package com.example.restaurantroulette.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * 検索結果の控え。
 *
 * メモリ上のキャッシュは Render の無料プランがスリープするたびに消えるため、
 * 起動直後という一番遅い瞬間に効かない。DBに置くことで再起動をまたいで再利用できる。
 */
@Repository
public class SearchCacheRepository {
  private final JdbcClient jdbcClient;

  public SearchCacheRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public record CachedSearch(String payload, Instant fetchedAt) {
  }

  public Optional<CachedSearch> find(String cacheKey) {
    return jdbcClient.sql("""
        SELECT payload, fetched_at
        FROM search_cache
        WHERE cache_key = :cacheKey
        """)
        .param("cacheKey", cacheKey)
        .query((resultSet, rowNumber) -> new CachedSearch(
            resultSet.getString("payload"),
            resultSet.getTimestamp("fetched_at").toInstant()))
        .optional();
  }

  /** 再利用された回数を数える。人気エリアの把握と、効き具合の確認に使う。 */
  public void markHit(String cacheKey) {
    jdbcClient.sql("UPDATE search_cache SET hit_count = hit_count + 1 WHERE cache_key = :cacheKey")
        .param("cacheKey", cacheKey)
        .update();
  }

  public void save(String cacheKey, String payload, int resultCount) {
    jdbcClient.sql("""
        INSERT INTO search_cache (cache_key, payload, result_count, hit_count, fetched_at)
        VALUES (:cacheKey, CAST(:payload AS JSONB), :resultCount, 0, CURRENT_TIMESTAMP)
        ON CONFLICT (cache_key) DO UPDATE SET
          payload = EXCLUDED.payload,
          result_count = EXCLUDED.result_count,
          hit_count = 0,
          fetched_at = CURRENT_TIMESTAMP
        """)
        .param("cacheKey", cacheKey)
        .param("payload", payload)
        .param("resultCount", resultCount)
        .update();
  }

  /** 期限切れを消す。放っておくと無料枠のDB容量を食いつぶすため。 */
  public int deleteExpired(Instant expiredBefore) {
    return jdbcClient.sql("DELETE FROM search_cache WHERE fetched_at < :expiredBefore")
        .param("expiredBefore", Timestamp.from(expiredBefore))
        .update();
  }
}
