package com.example.restaurantroulette.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class ApiDtos {
  private ApiDtos() {
  }

  public record RestaurantResponse(
      String id,
      String externalProvider,
      String externalId,
      String name,
      String area,
      String genre,
      int budgetMin,
      int budgetMax,
      double rating,
      int minutes,
      String address,
      String photoUrl,
      String note,
      Double latitude,
      Double longitude,
      Double googleRating,
      String googleMapsUri,
      Boolean openNow,
      String nextOpenTime,
      String nextCloseTime,
      String googlePlaceId) {
  }

  public record RestaurantSearchRequest(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      Integer distanceMeters) {
  }

  public record RandomRestaurantRequest(
      String userId,
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      Integer distanceMeters) {
  }

  public record NearbyPlacesRequest(
      Double latitude,
      Double longitude,
      Integer radius,
      String category,
      String priceRange,
      Boolean openNow) {
  }

  public record CandidatePlaceResponse(
      String id,
      String name,
      Double latitude,
      Double longitude,
      List<String> categories,
      Double rating,
      Integer priceLevel,
      Boolean openNow,
      String address,
      Integer distanceMeters,
      String googleMapsUri) {
  }

  public record NearbyPlacesResponse(
      List<CandidatePlaceResponse> places,
      boolean cacheHit,
      String source,
      Instant fetchedAt,
      String message) {
  }

  public record RandomHistoryCreateRequest(
      String userId,
      String restaurantId,
      String provider,
      String providerPlaceId,
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Integer rangeMeters) {
  }

  public record RandomHistoryResponse(
      String id,
      String userId,
      String provider,
      String providerPlaceId,
      String restaurantId,
      RestaurantResponse restaurant,
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Integer rangeMeters,
      Instant createdAt) {
  }

  public record UserCreateRequest(
      String email,
      String password,
      String displayName) {
  }

  public record UserLoginRequest(
      String email,
      String password) {
  }

  public record OAuthAuthorizeResponse(
      String provider,
      String authorizationUrl,
      String redirectTo) {
  }

  public record OAuthSessionRequest(
      String accessToken) {
  }

  public record OAuthRefreshRequest(
      String refreshToken) {
  }

  public record EmailVerificationResponse(
      String email,
      Instant expiresAt) {
  }

  public record UserResponse(
      String id,
      String email,
      String displayName,
      String authProvider,
      Instant createdAt,
      Instant updatedAt) {
  }

  public record AuthResponse(
      UserResponse user,
      String accessToken,
      String refreshToken) {
    public AuthResponse(UserResponse user, String accessToken) {
      this(user, accessToken, null);
    }
  }

  public record PremiumStatusResponse(
      boolean isPro,
      String entitlementKey,
      String source,
      Instant activeUntil,
      String provider,
      String environment) {
  }

  public record FavoriteCreateRequest(
      String userId,
      String restaurantId,
      String provider,
      String providerPlaceId,
      String savedArea,
      String savedGenre,
      Integer savedBudgetMin,
      Integer savedBudgetMax,
      Integer savedRangeMeters,
      String userMemo,
      String userTags) {
    public FavoriteCreateRequest(String userId, String restaurantId) {
      this(userId, restaurantId, null, null, null, null, null, null, null, null, null);
    }
  }

  public record FavoriteResponse(
      String id,
      String userId,
      String provider,
      String providerPlaceId,
      String restaurantId,
      String savedArea,
      String savedGenre,
      Integer savedBudgetMin,
      Integer savedBudgetMax,
      Integer savedRangeMeters,
      String userMemo,
      String userTags,
      RestaurantResponse restaurant,
      Instant createdAt) {
  }

  public record FavoriteCheckResponse(boolean favorite, String favoriteId) {
  }

  public record VisitCreateRequest(
      String userId,
      String restaurantId,
      LocalDate visitDate,
      String photoUrl,
      String memo,
      Integer rating) {
  }

  public record VisitResponse(
      String id,
      String userId,
      RestaurantResponse restaurant,
      LocalDate visitDate,
      String photoUrl,
      String memo,
      int rating,
      Instant createdAt) {
  }

  public record VisitCheckResponse(boolean visited) {
  }

  public record StatisticsResponse(
      String userId,
      long totalVisits,
      String favoriteGenre,
      String favoriteArea,
      Map<String, Long> monthlyVisitCount,
      double newRestaurantRate,
      long favoriteCount,
      long visitedRestaurantCount) {
  }

  public record ErrorResponse(String code, String message, List<String> details) {
  }
}
