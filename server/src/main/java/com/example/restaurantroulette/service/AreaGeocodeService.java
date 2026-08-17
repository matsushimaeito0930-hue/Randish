package com.example.restaurantroulette.service;

import com.example.restaurantroulette.entity.Restaurant;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * エリア名（市区町村・駅名・自由入力）から検索の中心座標を求める。
 *
 * <p>市区町村の座標表は1,917件中1件しか埋まっておらず、抽選は「都道府県の代表地点」に
 * フォールバックしていた。東京都のどこを選んでも東京駅、北海道なら札幌が中心になり、
 * 「選んだ範囲と違う場所の結果が出る」原因になっていた。
 *
 * <p>ここでは静的な座標表を持たず、そのエリア名で実際に見つかる飲食店の位置から中心を求める。
 * 行政区域の幾何学的な中心ではなく「店が集まっている中心」が取れるため、
 * 飲食店を探すという用途にはこちらのほうが適している。市町村合併で古くなることもない。
 */
@Service
public class AreaGeocodeService {
  private static final Logger logger = LoggerFactory.getLogger(AreaGeocodeService.class);
  /** エリアの中心はほとんど動かないので、長めに保持してよい。 */
  private static final Duration CACHE_TTL = Duration.ofDays(30);
  /** 中心を信頼するために最低限必要な店舗数。1件だけだとその店の位置に寄ってしまう。 */
  private static final int MIN_SAMPLE_COUNT = 2;

  /**
   * 中心から見て、この距離より遠い店は同じ市町村のものとして数えない。
   *
   * <p>中心は「見つかった店の平均」で出している。1軒でも遠い店が混ざると、平均は
   * その方向へ引っ張られる。広島の店と東京の店が混ざったとき、中心は瀬戸内海に落ちた。
   * 海に円を描いて、その中から飲食店を探すことになる。
   *
   * <p>60kmにしているのは、日本で一番広い市町村でも中心から端まではその程度に収まるため
   * （高山市や足寄町のような例でも約25km）。県をまたぐような外れ値だけを落とす。
   */
  private static final int MAX_AREA_RADIUS_METERS = 60_000;
  private static final int MAX_CACHE_ENTRIES = 2000;

  private final RestaurantQueryService restaurantQueryService;
  private final ConcurrentHashMap<String, CacheEntry> cache = new ConcurrentHashMap<>();

  public AreaGeocodeService(RestaurantQueryService restaurantQueryService) {
    this.restaurantQueryService = restaurantQueryService;
  }

  public record AreaCenter(
      String area,
      double latitude,
      double longitude,
      int sampleCount,
      int spreadMeters,
      String source) {
  }

  private record CacheEntry(AreaCenter center, Instant fetchedAt) {
  }

  public Optional<AreaCenter> resolve(String area) {
    String cleanArea = area == null ? "" : area.trim();
    if (cleanArea.isEmpty() || "現在地".equals(cleanArea)) {
      return Optional.empty();
    }

    String key = cleanArea.toLowerCase(Locale.ROOT);
    CacheEntry cached = cache.get(key);
    if (cached != null && Duration.between(cached.fetchedAt(), Instant.now()).compareTo(CACHE_TTL) < 0) {
      return Optional.of(cached.center());
    }

    Optional<AreaCenter> resolved = computeCenter(cleanArea);
    resolved.ifPresent(center -> {
      if (cache.size() >= MAX_CACHE_ENTRIES) {
        cache.clear();
      }
      cache.put(key, new CacheEntry(center, Instant.now()));
      logger.info("[RANDISH_AREA] resolved area={} lat={} lng={} samples={} spreadMeters={}",
          cleanArea, center.latitude(), center.longitude(), center.sampleCount(), center.spreadMeters());
    });
    if (resolved.isEmpty()) {
      logger.info("[RANDISH_AREA] could not resolve area={}", cleanArea);
    }
    return resolved;
  }

  private Optional<AreaCenter> computeCenter(String area) {
    List<Restaurant> restaurants;
    try {
      // ジャンルも予算も指定せずに引く。条件を付けると結果が偏り、中心がずれるため。
      restaurants = restaurantQueryService.searchEntities(area, null, null, null);
    } catch (RuntimeException exception) {
      logger.warn("[RANDISH_AREA] area lookup failed area={}", area, exception);
      return Optional.empty();
    }
    if (restaurants == null || restaurants.isEmpty()) {
      return Optional.empty();
    }

    List<double[]> points = new ArrayList<>();
    for (Restaurant restaurant : restaurants) {
      Double latitude = restaurant.latitude();
      Double longitude = restaurant.longitude();
      if (latitude != null && longitude != null && latitude != 0 && longitude != 0) {
        points.add(new double[] { latitude, longitude });
      }
    }
    if (points.size() < MIN_SAMPLE_COUNT) {
      return Optional.empty();
    }

    // まず中央値を取る。平均と違って、遠い1軒に引きずられない。
    // ここを平均から始めると、外れ値を落とすための基準そのものが既にずれている。
    double medianLatitude = median(points, 0);
    double medianLongitude = median(points, 1);

    // 中央値から離れすぎている店は、同じ市町村のものとして扱わない。
    List<double[]> nearby = new ArrayList<>();
    for (double[] point : points) {
      if (distanceMeters(medianLatitude, medianLongitude, point[0], point[1]) <= MAX_AREA_RADIUS_METERS) {
        nearby.add(point);
      }
    }
    if (nearby.size() < MIN_SAMPLE_COUNT) {
      // まとまりが無いということは、この地名で引いた結果が一つの場所を指していない。
      // 中心を決められないので何も返さない。海の真ん中を返すよりましである。
      logger.info("[RANDISH_AREA] points are scattered; refusing to guess a center area={} points={}",
          area, points.size());
      return Optional.empty();
    }
    if (nearby.size() < points.size()) {
      logger.info("[RANDISH_AREA] dropped far outliers area={} kept={} of={}",
          area, nearby.size(), points.size());
    }

    double latitudeSum = 0;
    double longitudeSum = 0;
    for (double[] point : nearby) {
      latitudeSum += point[0];
      longitudeSum += point[1];
    }
    double centerLatitude = latitudeSum / nearby.size();
    double centerLongitude = longitudeSum / nearby.size();

    // 中心からいちばん離れた店までの距離。エリアの広がりの目安として返す。
    int spreadMeters = 0;
    for (double[] point : nearby) {
      spreadMeters = Math.max(spreadMeters, distanceMeters(centerLatitude, centerLongitude, point[0], point[1]));
    }

    return Optional.of(new AreaCenter(
        area,
        centerLatitude,
        centerLongitude,
        nearby.size(),
        spreadMeters,
        "RESTAURANT_CENTROID"));
  }

  /** index番目の成分（0=緯度, 1=経度）の中央値。 */
  private double median(List<double[]> points, int index) {
    double[] values = points.stream().mapToDouble(point -> point[index]).sorted().toArray();
    int middle = values.length / 2;
    return values.length % 2 == 1
        ? values[middle]
        : (values[middle - 1] + values[middle]) / 2;
  }

  private int distanceMeters(double fromLatitude, double fromLongitude, double toLatitude, double toLongitude) {
    double earthRadiusMeters = 6_371_000;
    double deltaLatitude = Math.toRadians(toLatitude - fromLatitude);
    double deltaLongitude = Math.toRadians(toLongitude - fromLongitude);
    double a = Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2)
        + Math.cos(Math.toRadians(fromLatitude)) * Math.cos(Math.toRadians(toLatitude))
        * Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2);
    return (int) Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
}
