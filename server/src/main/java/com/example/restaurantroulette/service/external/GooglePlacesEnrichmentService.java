package com.example.restaurantroulette.service.external;

import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class GooglePlacesEnrichmentService {
  private static final Logger logger = LoggerFactory.getLogger(GooglePlacesEnrichmentService.class);
  private static final String API_URL = "https://places.googleapis.com/v1";
  private static final String FIELD_MASK = String.join(",",
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.rating",
      "places.googleMapsUri",
      "places.currentOpeningHours.openNow");

  private final RestClient restClient;
  private final String apiKey;
  private final List<Path> envFiles = List.of(
      Path.of(".env.local"),
      Path.of("..", ".env.local"),
      Path.of("mobile", ".env.local"),
      Path.of("..", "mobile", ".env.local"),
      Path.of(".env.loical"),
      Path.of("..", ".env.loical"),
      Path.of("mobile", ".env.loical"),
      Path.of("..", "mobile", ".env.loical"),
      Path.of(".env"),
      Path.of("..", ".env"),
      Path.of("mobile", ".env"),
      Path.of("..", "mobile", ".env"));

  public GooglePlacesEnrichmentService(RestClient.Builder restClientBuilder) {
    this.restClient = restClientBuilder.baseUrl(API_URL).build();
    this.apiKey = resolveApiKey();
  }

  public RestaurantResponse enrich(RestaurantResponse restaurant) {
    if (!isAvailable()) {
      return restaurant;
    }

    try {
      GooglePlacesTextSearchResponse response = restClient.post()
          .uri("/places:searchText")
          .header("X-Goog-Api-Key", apiKey)
          .header("X-Goog-FieldMask", FIELD_MASK)
          .body(Map.of(
              "textQuery", "%s %s".formatted(restaurant.name(), restaurant.address()),
              "languageCode", "ja",
              "regionCode", "JP",
              "maxResultCount", 1))
          .retrieve()
          .body(GooglePlacesTextSearchResponse.class);

      GooglePlace place = response == null || response.places() == null || response.places().isEmpty()
          ? null
          : response.places().getFirst();
      if (place == null) {
        return restaurant;
      }

      return new RestaurantResponse(
          restaurant.id(),
          restaurant.externalProvider(),
          restaurant.externalId(),
          restaurant.name(),
          restaurant.area(),
          restaurant.genre(),
          restaurant.budgetMin(),
          restaurant.budgetMax(),
          place.rating() == null ? restaurant.rating() : place.rating(),
          restaurant.minutes(),
          place.formattedAddress() == null ? restaurant.address() : place.formattedAddress(),
          restaurant.photoUrl(),
          restaurant.note(),
          place.location() == null ? null : place.location().latitude(),
          place.location() == null ? null : place.location().longitude(),
          place.rating(),
          place.googleMapsUri(),
          place.currentOpeningHours() == null ? null : place.currentOpeningHours().openNow(),
          place.id());
    } catch (RuntimeException exception) {
      logger.warn("Google Places enrichment failed for restaurant: {}", restaurant.name(), exception);
      return restaurant;
    }
  }

  private boolean isAvailable() {
    return apiKey != null && !apiKey.isBlank();
  }

  public Map<String, Object> diagnostics() {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("provider", "GOOGLE_PLACES");
    result.put("workingDirectory", Path.of("").toAbsolutePath().normalize().toString());
    result.put("apiKeyLoaded", isAvailable());
    result.put("apiKeyLength", apiKey == null ? 0 : apiKey.length());
    result.put("checkedEnvFiles", envFiles.stream().map(this::envFileStatus).toList());
    return result;
  }

  private String resolveApiKey() {
    String envValue = System.getenv("GOOGLE_PLACES_API_KEY");
    if (envValue != null && !envValue.isBlank()) {
      return trimValue(envValue);
    }

    for (Path path : envFiles) {
      Optional<String> fileValue = readApiKeyFromFile(path);
      if (fileValue.isPresent()) {
        return fileValue.get();
      }
    }
    return "";
  }

  private Optional<String> readApiKeyFromFile(Path path) {
    if (!Files.exists(path)) {
      return Optional.empty();
    }

    try {
      return Files.readAllLines(path).stream()
          .map(String::trim)
          .filter(line -> !line.startsWith("#"))
          .filter(line -> line.contains("GOOGLE_PLACES_API_KEY"))
          .map(line -> line.substring(line.indexOf('=') + 1))
          .map(this::trimValue)
          .filter(value -> !value.isBlank())
          .findFirst();
    } catch (IOException exception) {
      logger.warn("Failed to read Google Places API key from {}", path, exception);
      return Optional.empty();
    }
  }

  private Map<String, Object> envFileStatus(Path path) {
    Map<String, Object> status = new LinkedHashMap<>();
    status.put("path", path.toAbsolutePath().normalize().toString());
    status.put("exists", Files.exists(path));
    return status;
  }

  private String trimValue(String value) {
    return value.trim().replaceAll("^['\"]|['\"]$", "");
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record GooglePlacesTextSearchResponse(List<GooglePlace> places) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record GooglePlace(
      String id,
      @JsonProperty("formattedAddress") String formattedAddress,
      GoogleLocation location,
      Double rating,
      String googleMapsUri,
      GoogleOpeningHours currentOpeningHours) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record GoogleLocation(Double latitude, Double longitude) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record GoogleOpeningHours(Boolean openNow) {
  }
}
