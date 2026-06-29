package com.example.restaurantroulette.service;

import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.UnauthorizedException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class SupabaseAuthService {
  private static final Logger logger = LoggerFactory.getLogger(SupabaseAuthService.class);
  private static final String DEFAULT_OAUTH_REDIRECT_URI = "randish://auth/callback";
  private static final Set<String> SUPPORTED_OAUTH_PROVIDERS = Set.of("google", "apple");
  private static final List<String> SUPABASE_ERROR_FIELDS = List.of("msg", "message", "error_description", "error");
  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
  private static final List<Path> ENV_FILES = List.of(
      Path.of(".env.local"),
      Path.of("..", ".env.local"),
      Path.of("server", ".env.local"),
      Path.of("..", "server", ".env.local"),
      Path.of(".env"),
      Path.of("..", ".env"),
      Path.of("server", ".env"),
      Path.of("..", "server", ".env"));

  private final RestClient.Builder restClientBuilder;
  private final String supabaseUrl;
  private final String anonKey;
  private final String defaultOAuthRedirectUri;

  public SupabaseAuthService(RestClient.Builder restClientBuilder) {
    this.restClientBuilder = restClientBuilder;
    this.supabaseUrl = trimTrailingSlash(firstPresent(
        System.getProperty("SUPABASE_URL"),
        System.getenv("SUPABASE_URL"),
        System.getProperty("EXPO_PUBLIC_SUPABASE_URL"),
        System.getenv("EXPO_PUBLIC_SUPABASE_URL"),
        readConfigValue("SUPABASE_URL").orElse(null),
        readConfigValue("EXPO_PUBLIC_SUPABASE_URL").orElse(null)));
    this.anonKey = firstPresent(
        System.getProperty("SUPABASE_ANON_KEY"),
        System.getenv("SUPABASE_ANON_KEY"),
        System.getProperty("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
        System.getenv("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
        readConfigValue("SUPABASE_ANON_KEY").orElse(null),
        readConfigValue("EXPO_PUBLIC_SUPABASE_ANON_KEY").orElse(null));
    this.defaultOAuthRedirectUri = firstPresent(
        System.getProperty("RANDISH_OAUTH_REDIRECT_URI"),
        System.getenv("RANDISH_OAUTH_REDIRECT_URI"),
        readConfigValue("RANDISH_OAUTH_REDIRECT_URI").orElse(null),
        DEFAULT_OAUTH_REDIRECT_URI);
  }

  public boolean isConfigured() {
    return supabaseUrl != null && !supabaseUrl.isBlank() && anonKey != null && !anonKey.isBlank();
  }

  public String createOAuthAuthorizeUrl(String provider, String redirectTo) {
    String normalizedProvider = normalizeOAuthProvider(provider);
    requireConfigured();
    String resolvedRedirectTo = redirectTo == null || redirectTo.isBlank()
        ? defaultOAuthRedirectUri
        : redirectTo.trim();
    String encodedProvider = URLEncoder.encode(normalizedProvider, StandardCharsets.UTF_8);
    String encodedRedirectTo = URLEncoder.encode(resolvedRedirectTo, StandardCharsets.UTF_8);
    return supabaseUrl + "/auth/v1/authorize?provider=" + encodedProvider + "&redirect_to=" + encodedRedirectTo;
  }

  public SupabaseAuthResult signUp(String email, String password, String displayName) {
    requireConfigured();
    try {
      SupabaseAuthApiResponse response = client().post()
          .uri("/auth/v1/signup")
          .header("apikey", anonKey)
          .header("Authorization", "Bearer " + anonKey)
          .body(Map.of(
              "email", email,
              "password", password,
              "data", Map.of("display_name", displayName)))
          .retrieve()
          .body(SupabaseAuthApiResponse.class);
      return toResult(response);
    } catch (RestClientResponseException exception) {
      throw new BadRequestException(supabaseErrorMessage(exception, "Supabase signup failed."));
    }
  }

  public SupabaseAuthResult signInWithPassword(String email, String password) {
    requireConfigured();
    try {
      SupabaseAuthApiResponse response = client().post()
          .uri("/auth/v1/token?grant_type=password")
          .header("apikey", anonKey)
          .header("Authorization", "Bearer " + anonKey)
          .body(Map.of("email", email, "password", password))
          .retrieve()
          .body(SupabaseAuthApiResponse.class);
      return toResult(response);
    } catch (RestClientResponseException exception) {
      throw new UnauthorizedException(supabaseErrorMessage(exception, "Supabase login failed."));
    }
  }

  public SupabaseAuthResult refreshSession(String refreshToken) {
    requireConfigured();
    if (refreshToken == null || refreshToken.isBlank()) {
      throw new UnauthorizedException("Supabase refresh token is required.");
    }
    try {
      SupabaseAuthApiResponse response = client().post()
          .uri("/auth/v1/token?grant_type=refresh_token")
          .header("apikey", anonKey)
          .header("Authorization", "Bearer " + anonKey)
          .body(Map.of("refresh_token", refreshToken.trim()))
          .retrieve()
          .body(SupabaseAuthApiResponse.class);
      return toResult(response);
    } catch (RestClientResponseException exception) {
      throw new UnauthorizedException(supabaseErrorMessage(exception, "Supabase refresh failed."));
    }
  }

  public SupabaseAuthUser getUser(String bearerToken) {
    requireConfigured();
    String token = stripBearerToken(bearerToken);
    try {
      SupabaseAuthUser user = client().get()
          .uri("/auth/v1/user")
          .header("apikey", anonKey)
          .header("Authorization", "Bearer " + token)
          .retrieve()
          .body(SupabaseAuthUser.class);
      if (user == null || user.id() == null || user.id().isBlank()) {
        throw new UnauthorizedException("Supabase token is invalid.");
      }
      return user;
    } catch (RestClientResponseException exception) {
      throw new UnauthorizedException("Supabase token is invalid.");
    }
  }

  private SupabaseAuthResult toResult(SupabaseAuthApiResponse response) {
    if (response == null) {
      throw new BadRequestException("Supabase did not return a user.");
    }
    SupabaseAuthUser user = response.resolvedUser();
    if (user == null || user.id() == null || user.id().isBlank()) {
      throw new BadRequestException("Supabase did not return a user.");
    }
    String accessToken = response.accessToken() != null
        ? response.accessToken()
        : response.session() == null ? null : response.session().accessToken();
    String refreshToken = response.refreshToken() != null
        ? response.refreshToken()
        : response.session() == null ? null : response.session().refreshToken();
    return new SupabaseAuthResult(user, accessToken, refreshToken);
  }

  private RestClient client() {
    return restClientBuilder.baseUrl(supabaseUrl).build();
  }

  private void requireConfigured() {
    if (!isConfigured()) {
      throw new BadRequestException("Supabase Auth is not configured.");
    }
  }

  private String stripBearerToken(String value) {
    if (value == null || value.isBlank()) {
      throw new UnauthorizedException("Authorization bearer token is required.");
    }
    return value.replaceFirst("(?i)^Bearer\\s+", "").trim();
  }

  private String normalizeOAuthProvider(String provider) {
    if (provider == null || provider.isBlank()) {
      throw new BadRequestException("OAuth provider is required.");
    }
    String normalized = provider.trim().toLowerCase();
    if (!SUPPORTED_OAUTH_PROVIDERS.contains(normalized)) {
      throw new BadRequestException("Unsupported OAuth provider.");
    }
    return normalized;
  }

  private String supabaseErrorMessage(RestClientResponseException exception, String fallbackMessage) {
    String body = exception.getResponseBodyAsString();
    if (body == null || body.isBlank()) {
      return fallbackMessage;
    }
    JsonNode root = parseJson(body);
    for (String field : SUPABASE_ERROR_FIELDS) {
      String value = extractJsonString(root, field);
      if (value != null && !value.isBlank()) {
        return fallbackMessage + " " + value;
      }
    }
    return fallbackMessage;
  }

  private JsonNode parseJson(String json) {
    try {
      return OBJECT_MAPPER.readTree(json);
    } catch (Exception ignored) {
      return null;
    }
  }

  private String extractJsonString(JsonNode root, String field) {
    if (root == null || !root.has(field)) {
      return null;
    }
    JsonNode node = root.get(field);
    return node != null && node.isTextual() ? node.asText() : null;
  }

  private String trimTrailingSlash(String value) {
    return value == null ? null : value.trim().replaceFirst("/+$", "");
  }

  private String firstPresent(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value.trim();
      }
    }
    return null;
  }

  private Optional<String> readConfigValue(String key) {
    for (Path path : ENV_FILES) {
      Optional<String> fileValue = readConfigValueFromFile(path, key);
      if (fileValue.isPresent()) {
        return fileValue;
      }
    }
    return Optional.empty();
  }

  private Optional<String> readConfigValueFromFile(Path path, String key) {
    if (!Files.exists(path)) {
      return Optional.empty();
    }
    try {
      return Files.readAllLines(path, StandardCharsets.UTF_8).stream()
          .map(String::trim)
          .filter(line -> !line.isBlank())
          .filter(line -> !line.startsWith("#"))
          .filter(line -> line.startsWith(key + "="))
          .map(line -> line.substring(line.indexOf('=') + 1))
          .map(this::trimConfigValue)
          .filter(value -> !value.isBlank())
          .findFirst();
    } catch (IOException exception) {
      logger.warn("Failed to read Supabase config from {}", path, exception);
      return Optional.empty();
    }
  }

  private String trimConfigValue(String value) {
    String trimmed = value == null ? "" : value.trim();
    if ((trimmed.startsWith("\"") && trimmed.endsWith("\""))
        || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.substring(1, trimmed.length() - 1).trim();
    }
    return trimmed;
  }

  public record SupabaseAuthResult(SupabaseAuthUser user, String accessToken, String refreshToken) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record SupabaseAuthApiResponse(
      @JsonProperty("access_token") String accessToken,
      @JsonProperty("refresh_token") String refreshToken,
      SupabaseAuthSession session,
      SupabaseAuthUser user,
      String id,
      String email,
      @JsonProperty("user_metadata") Map<String, Object> userMetadata,
      @JsonProperty("raw_user_meta_data") Map<String, Object> rawUserMetadata) {
    public SupabaseAuthUser resolvedUser() {
      if (user != null) {
        return user;
      }
      if (id == null || id.isBlank()) {
        return null;
      }
      return new SupabaseAuthUser(id, email, userMetadata, rawUserMetadata);
    }
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record SupabaseAuthSession(
      @JsonProperty("access_token") String accessToken,
      @JsonProperty("refresh_token") String refreshToken) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record SupabaseAuthUser(
      String id,
      String email,
      @JsonProperty("user_metadata") Map<String, Object> userMetadata,
      @JsonProperty("raw_user_meta_data") Map<String, Object> rawUserMetadata) {
    public String displayName() {
      Map<String, Object> metadata = userMetadata != null ? userMetadata : rawUserMetadata;
      if (metadata == null) {
        return null;
      }
      Object displayName = metadata.get("display_name");
      if (displayName == null) {
        displayName = metadata.get("displayName");
      }
      if (displayName == null) {
        displayName = metadata.get("name");
      }
      return displayName == null ? null : String.valueOf(displayName);
    }
  }
}
