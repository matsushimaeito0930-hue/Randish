package com.example.restaurantroulette.service;

import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.UnauthorizedException;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class SupabaseAuthService {
  private final RestClient.Builder restClientBuilder;
  private final String supabaseUrl;
  private final String anonKey;

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
  }

  public boolean isConfigured() {
    return supabaseUrl != null && !supabaseUrl.isBlank() && anonKey != null && !anonKey.isBlank();
  }

  public SupabaseAuthResult signUp(String email, String password, String displayName) {
    requireConfigured();
    try {
      SupabaseAuthApiResponse response = client().post()
          .uri("/auth/v1/signup")
          .header("apikey", anonKey)
          .body(Map.of(
              "email", email,
              "password", password,
              "data", Map.of("display_name", displayName)))
          .retrieve()
          .body(SupabaseAuthApiResponse.class);
      return toResult(response);
    } catch (RestClientResponseException exception) {
      throw new BadRequestException("Supabase signup failed: " + exception.getResponseBodyAsString());
    }
  }

  public SupabaseAuthResult signInWithPassword(String email, String password) {
    requireConfigured();
    try {
      SupabaseAuthApiResponse response = client().post()
          .uri("/auth/v1/token?grant_type=password")
          .header("apikey", anonKey)
          .body(Map.of("email", email, "password", password))
          .retrieve()
          .body(SupabaseAuthApiResponse.class);
      return toResult(response);
    } catch (RestClientResponseException exception) {
      throw new UnauthorizedException("Supabase login failed.");
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
    if (response == null || response.user() == null || response.user().id() == null || response.user().id().isBlank()) {
      throw new BadRequestException("Supabase did not return a user.");
    }
    String accessToken = response.accessToken() != null
        ? response.accessToken()
        : response.session() == null ? null : response.session().accessToken();
    return new SupabaseAuthResult(response.user(), accessToken);
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
      SupabaseAuthUser user) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record SupabaseAuthSession(@JsonProperty("access_token") String accessToken) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record SupabaseAuthUser(
      String id,
      String email,
      @JsonProperty("user_metadata") Map<String, Object> userMetadata) {
    public String displayName() {
      if (userMetadata == null) {
        return null;
      }
      Object displayName = userMetadata.get("display_name");
      if (displayName == null) {
        displayName = userMetadata.get("displayName");
      }
      if (displayName == null) {
        displayName = userMetadata.get("name");
      }
      return displayName == null ? null : String.valueOf(displayName);
    }
  }
}
