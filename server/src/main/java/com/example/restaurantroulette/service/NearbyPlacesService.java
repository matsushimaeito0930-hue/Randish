package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.CandidatePlaceResponse;
import com.example.restaurantroulette.dto.ApiDtos.NearbyPlacesRequest;
import com.example.restaurantroulette.dto.ApiDtos.NearbyPlacesResponse;
import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.service.external.GooglePlacesEnrichmentService;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class NearbyPlacesService {
  private static final Logger logger = LoggerFactory.getLogger(NearbyPlacesService.class);
  private static final int DEFAULT_RADIUS_METERS = 1500;
  private static final int DEFAULT_CACHE_TTL_SECONDS = 600;
  private static final int DEFAULT_CACHE_DISTANCE_METERS = 300;
  private static final int DEFAULT_MAX_RESULTS = 20;

  private final GooglePlacesEnrichmentService googlePlacesEnrichmentService;
  private final ValidationService validationService;
  private final Map<NearbyCacheKey, List<NearbyCacheEntry>> cache = new ConcurrentHashMap<>();
  private final int cacheTtlSeconds;
  private final int cacheDistanceMeters;
  private final boolean mockEnabled;
  private final boolean productionRuntime;
  private final int maxResults;

  @Autowired
  public NearbyPlacesService(
      GooglePlacesEnrichmentService googlePlacesEnrichmentService,
      ValidationService validationService) {
    this(
        googlePlacesEnrichmentService,
        validationService,
        readPositiveInt("PLACES_CACHE_TTL_SECONDS").orElse(DEFAULT_CACHE_TTL_SECONDS),
        readPositiveInt("PLACES_CACHE_DISTANCE_METERS").orElse(DEFAULT_CACHE_DISTANCE_METERS),
        readBoolean("RANDISH_PLACES_MOCK_ENABLED").orElse(false),
        isProductionRuntime(),
        readPositiveInt("RANDISH_PLACES_MAX_RESULTS").orElse(DEFAULT_MAX_RESULTS));
  }

  public NearbyPlacesService(
      GooglePlacesEnrichmentService googlePlacesEnrichmentService,
      ValidationService validationService,
      int cacheTtlSeconds,
      int cacheDistanceMeters,
      boolean mockEnabled,
      boolean productionRuntime,
      int maxResults) {
    this.googlePlacesEnrichmentService = googlePlacesEnrichmentService;
    this.validationService = validationService;
    this.cacheTtlSeconds = Math.max(30, cacheTtlSeconds);
    this.cacheDistanceMeters = Math.max(50, cacheDistanceMeters);
    this.mockEnabled = mockEnabled;
    this.productionRuntime = productionRuntime;
    this.maxResults = Math.max(1, Math.min(maxResults, DEFAULT_MAX_RESULTS));
  }

  public NearbyPlacesResponse search(NearbyPlacesRequest request) {
    NearbyPlacesRequest normalized = normalizeRequest(request);
    NearbyCacheKey cacheKey = NearbyCacheKey.from(normalized);
    cleanupExpired(cacheKey);

    Optional<NearbyCacheEntry> cached = findCacheEntry(cacheKey, normalized);
    if (cached.isPresent()) {
      NearbyCacheEntry entry = cached.get();
      logger.info("[RANDISH_PLACES] cache hit key={} ageSeconds={} distanceMeters={}",
          cacheKey,
          Duration.between(entry.fetchedAt(), Instant.now()).toSeconds(),
          distanceMeters(entry.latitude(), entry.longitude(), normalized.latitude(), normalized.longitude()));
      return new NearbyPlacesResponse(
          entry.places(),
          true,
          entry.source(),
          entry.fetchedAt(),
          "cached nearby candidates");
    }

    List<CandidatePlaceResponse> places;
    String source = "GOOGLE_PLACES";
    if (!googlePlacesEnrichmentService.isAvailable()) {
      if (!canUseMockPlaces()) {
        throw new BadRequestException("Google Places nearby search is disabled or API key is not configured.");
      }
      logger.info("[RANDISH_PLACES] using development mock places because Google Places is unavailable");
      places = mockPlaces(normalized);
      source = "MOCK_PLACES";
    } else {
      logger.info("[RANDISH_PLACES] new nearby place search key={} radius={} category={} openNow={}",
          cacheKey,
          normalized.radius(),
          normalized.category(),
          normalized.openNow());
      places = googlePlacesEnrichmentService.searchNearbyCandidates(normalized, maxResults);
    }

    NearbyCacheEntry entry = new NearbyCacheEntry(
        normalized.latitude(),
        normalized.longitude(),
        Instant.now(),
        source,
        List.copyOf(places));
    cache.compute(cacheKey, (key, entries) -> {
      List<NearbyCacheEntry> nextEntries = entries == null ? new ArrayList<>() : new ArrayList<>(entries);
      nextEntries.add(entry);
      return nextEntries;
    });

    return new NearbyPlacesResponse(
        entry.places(),
        false,
        source,
        entry.fetchedAt(),
        places.isEmpty() ? "no nearby candidates" : "fresh nearby candidates");
  }

  private NearbyPlacesRequest normalizeRequest(NearbyPlacesRequest request) {
    if (request == null) {
      throw new BadRequestException("request body is required.");
    }
    Integer radius = request.radius() == null ? DEFAULT_RADIUS_METERS : request.radius();
    validationService.validateNearbyPlacesRequest(
        request.latitude(),
        request.longitude(),
        radius,
        request.category(),
        request.priceRange());
    return new NearbyPlacesRequest(
        request.latitude(),
        request.longitude(),
        radius,
        cleanText(request.category()),
        cleanText(request.priceRange()),
        request.openNow());
  }

  private Optional<NearbyCacheEntry> findCacheEntry(NearbyCacheKey key, NearbyPlacesRequest request) {
    List<NearbyCacheEntry> entries = cache.getOrDefault(key, List.of());
    Instant now = Instant.now();
    NearbyCacheEntry distanceRejected = null;
    NearbyCacheEntry expired = null;
    for (NearbyCacheEntry entry : entries) {
      long ageSeconds = Duration.between(entry.fetchedAt(), now).toSeconds();
      if (ageSeconds > cacheTtlSeconds) {
        expired = entry;
        continue;
      }
      int distance = distanceMeters(entry.latitude(), entry.longitude(), request.latitude(), request.longitude());
      if (distance <= cacheDistanceMeters) {
        return Optional.of(entry);
      }
      distanceRejected = entry;
    }

    if (expired != null) {
      logger.info("[RANDISH_PLACES] cache invalidated key={} reason=ttl ageSeconds={} ttlSeconds={}",
          key,
          Duration.between(expired.fetchedAt(), now).toSeconds(),
          cacheTtlSeconds);
    } else if (distanceRejected != null) {
      logger.info("[RANDISH_PLACES] cache invalidated key={} reason=distance distanceMeters={} thresholdMeters={}",
          key,
          distanceMeters(distanceRejected.latitude(), distanceRejected.longitude(), request.latitude(), request.longitude()),
          cacheDistanceMeters);
    } else {
      logger.info("[RANDISH_PLACES] cache miss key={} reason=new search conditions", key);
    }
    return Optional.empty();
  }

  private void cleanupExpired(NearbyCacheKey key) {
    List<NearbyCacheEntry> entries = cache.get(key);
    if (entries == null || entries.isEmpty()) {
      return;
    }
    Instant now = Instant.now();
    List<NearbyCacheEntry> freshEntries = entries.stream()
        .filter(entry -> Duration.between(entry.fetchedAt(), now).toSeconds() <= cacheTtlSeconds)
        .toList();
    if (freshEntries.isEmpty()) {
      cache.remove(key);
    } else if (freshEntries.size() != entries.size()) {
      cache.put(key, freshEntries);
    }
  }

  private boolean canUseMockPlaces() {
    return mockEnabled && !productionRuntime;
  }

  private List<CandidatePlaceResponse> mockPlaces(NearbyPlacesRequest request) {
    String category = request.category() == null || request.category().isBlank() ? "飲食店" : request.category();
    String[][] names = {
        {"Randish Map Diner", "restaurant"},
        {"赤ピン食堂", "food"},
        {"近くのカフェ灯", "cafe"},
        {"今日の一皿バル", "bar"},
        {"路地裏キッチン", "restaurant"}
    };
    double[][] offsets = {
        {0.0020, 0.0015},
        {-0.0014, 0.0022},
        {0.0010, -0.0024},
        {-0.0020, -0.0011},
        {0.0005, 0.0030}
    };
    List<CandidatePlaceResponse> places = new ArrayList<>();
    for (int index = 0; index < names.length; index++) {
      double latitude = request.latitude() + offsets[index][0];
      double longitude = request.longitude() + offsets[index][1];
      places.add(new CandidatePlaceResponse(
          "mock-place-" + index,
          names[index][0],
          latitude,
          longitude,
          List.of(category, names[index][1]),
          4.0 + (index * 0.1),
          index % 4 + 1,
          index % 2 == 0,
          "開発用モック住所 " + (index + 1),
          distanceMeters(request.latitude(), request.longitude(), latitude, longitude),
          "https://www.google.com/maps/search/?api=1&query=" + names[index][0]));
    }
    return places.stream()
        .filter(place -> place.distanceMeters() == null || place.distanceMeters() <= request.radius())
        .limit(maxResults)
        .toList();
  }

  private static String cleanText(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim();
  }

  private static int distanceMeters(double fromLatitude, double fromLongitude, double toLatitude, double toLongitude) {
    double earthRadiusMeters = 6_371_000;
    double latitudeDelta = Math.toRadians(toLatitude - fromLatitude);
    double longitudeDelta = Math.toRadians(toLongitude - fromLongitude);
    double fromLatitudeRad = Math.toRadians(fromLatitude);
    double toLatitudeRad = Math.toRadians(toLatitude);
    double haversine = Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
        + Math.cos(fromLatitudeRad) * Math.cos(toLatitudeRad)
        * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
    return (int) Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
  }

  private static Optional<Integer> readPositiveInt(String key) {
    return readConfigValue(key).flatMap(value -> {
      try {
        int parsed = Integer.parseInt(value);
        return parsed > 0 ? Optional.of(parsed) : Optional.empty();
      } catch (NumberFormatException exception) {
        return Optional.empty();
      }
    });
  }

  private static Optional<Boolean> readBoolean(String key) {
    return readConfigValue(key).map(value -> {
      String normalized = value.toLowerCase(Locale.ROOT);
      return normalized.equals("true") || normalized.equals("1") || normalized.equals("yes") || normalized.equals("on");
    });
  }

  private static boolean isProductionRuntime() {
    String profile = readConfigValue("SPRING_PROFILES_ACTIVE").orElse("");
    String env = readConfigValue("RANDISH_ENV").orElse("");
    return profile.toLowerCase(Locale.ROOT).contains("prod") || env.equalsIgnoreCase("production");
  }

  private static Optional<String> readConfigValue(String key) {
    String propertyValue = System.getProperty(key);
    if (propertyValue != null && !propertyValue.isBlank()) {
      return Optional.of(trimValue(propertyValue));
    }
    String envValue = System.getenv(key);
    if (envValue != null && !envValue.isBlank()) {
      return Optional.of(trimValue(envValue));
    }

    for (Path path : List.of(Path.of(".env.local"), Path.of("..", ".env.local"), Path.of(".env"), Path.of("..", ".env"))) {
      Optional<String> fileValue = readConfigValueFromFile(path, key);
      if (fileValue.isPresent()) {
        return fileValue;
      }
    }
    return Optional.empty();
  }

  private static Optional<String> readConfigValueFromFile(Path path, String key) {
    if (!Files.exists(path)) {
      return Optional.empty();
    }
    try {
      return Files.readAllLines(path).stream()
          .map(String::trim)
          .filter(line -> !line.startsWith("#"))
          .filter(line -> line.startsWith(key + "="))
          .map(line -> line.substring(line.indexOf('=') + 1))
          .map(NearbyPlacesService::trimValue)
          .filter(value -> !value.isBlank())
          .findFirst();
    } catch (IOException exception) {
      logger.warn("Failed to read nearby places config from {}", path, exception);
      return Optional.empty();
    }
  }

  private static String trimValue(String value) {
    return value.trim().replaceAll("^['\"]|['\"]$", "");
  }

  private record NearbyCacheKey(
      int radius,
      String category,
      String priceRange,
      boolean openNow) {
    private static NearbyCacheKey from(NearbyPlacesRequest request) {
      return new NearbyCacheKey(
          request.radius(),
          normalizeKeyPart(request.category()),
          normalizeKeyPart(request.priceRange()),
          Boolean.TRUE.equals(request.openNow()));
    }

    private static String normalizeKeyPart(String value) {
      return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
  }

  private record NearbyCacheEntry(
      double latitude,
      double longitude,
      Instant fetchedAt,
      String source,
      List<CandidatePlaceResponse> places) {
  }
}
