package com.example.restaurantroulette.service;

import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.UnauthorizedException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class SupabaseAuthService {
  private static final String DEFAULT_OAUTH_REDIRECT_URI = "randish://auth/callback";
  private static final Set<String> SUPPORTED_OAUTH_PROVIDERS = Set.of("google", "apple");
  private static final List<String> SUPABASE_ERROR_FIELDS = List.of("msg", "message", "error_description", "error");
  private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

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
        System.getenv("EXPO_PUBLIC_SUPABASE_URL")));
    this.anonKey = firstPresent(
        System.getProperty("SUPABASE_ANON_KEY"),
        System.getenv("SUPABASE_ANON_KEY"),
        System.getProperty("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
        System.getenv("EXPO_PUBLIC_SUPABASE_ANON_KEY"));
    this.defaultOAuthRedirectUri = firstPresent(
        System.getProperty("RANDISH_OAUTH_REDIRECT_URI"),
        System.getenv("RANDISH_OAUTH_REDIRECT_URI"),
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
    return UriComponentsBuilder.fromHttpUrl(supabaseUrl)
        .path("/auth/v1/authorize")
        .queryParam("provider", normalizedProvider)
        .queryParam("redirect_to", resolvedRedirectTo)
        .build()
        .toUriString();
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
    return new SupabaseAuthResult(user, accessToken);
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

  public record SupabaseAuthResult(SupabaseAuthUser user, String accessToken) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record SupabaseAuthApiResponse(
      @JsonProperty("access_token") String accessToken,
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
  public record SupabaseAuthSession(@JsonProperty("access_token") String accessToken) {
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
