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
      String googlePlaceId,
      List<PhotoAttributionResponse> photoAttributions,
      PremiumPlaceDetailsResponse premiumDetails,
      /** 席・設備。ホットペッパー由来の店だけ入る。 */
      RestaurantFacilitiesResponse facilities) {

    /** facilities を持たない呼び出しのための短い形。既存コードをそのまま動かすために残している。 */
    public RestaurantResponse(
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
        String googlePlaceId,
        List<PhotoAttributionResponse> photoAttributions,
        PremiumPlaceDetailsResponse premiumDetails) {
      this(id, externalProvider, externalId, name, area, genre, budgetMin, budgetMax, rating,
          minutes, address, photoUrl, note, latitude, longitude, googleRating, googleMapsUri,
          openNow, nextOpenTime, nextCloseTime, googlePlaceId, photoAttributions, premiumDetails, null);
    }
  }

  public record RestaurantFacilitiesResponse(
      Boolean privateRoom,
      Boolean tatami,
      Boolean horigotatsu,
      Boolean childFriendly,
      Boolean charter,
      Boolean freeDrink,
      Boolean freeFood,
      Boolean course,
      Boolean lunch,
      Boolean openLate,
      Boolean parking,
      Boolean barrierFree,
      Boolean nonSmoking,
      Boolean englishMenu,
      Integer capacity,
      Integer partyCapacity,
      String stationName,
      String openHours) {
  }

  public record PremiumPlaceDetailsResponse(
      Boolean goodForChildren,
      Boolean goodForGroups,
      Boolean menuForChildren,
      Boolean reservable,
      Boolean dineIn,
      Boolean takeout,
      Boolean delivery,
      Boolean outdoorSeating,
      Boolean allowsDogs,
      Boolean restroom,
      Boolean servesVegetarianFood,
      Integer googleUserRatingCount,
      List<String> paymentOptions,
      List<String> parkingOptions,
      List<String> accessibilityOptions) {
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
      Boolean openNow,
      Double minRating) {
    public NearbyPlacesRequest(
        Double latitude,
        Double longitude,
        Integer radius,
        String category,
        String priceRange,
        Boolean openNow) {
      this(latitude, longitude, radius, category, priceRange, openNow, null);
    }
  }

  public record CandidatePlaceResponse(
      String id,
      String provider,
      String providerPlaceId,
      String name,
      Double latitude,
      Double longitude,
      List<String> categories,
      Double rating,
      Integer priceLevel,
      Boolean openNow,
      String address,
      Integer distanceMeters,
      String googleMapsUri,
      String photoUrl,
      List<PhotoAttributionResponse> photoAttributions) {
  }

  public record PhotoAttributionResponse(
      String displayName,
      String uri) {
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
      Integer userRating,
      Instant createdAt) {
  }

  public record RandomHistoryRatingRequest(Integer rating) {
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

  public record MagicLinkRequest(
      String email,
      String redirectTo,
      String appRedirectTo,
      Boolean createUser) {
  }

  public record EmailOtpVerifyRequest(
      String email,
      String token) {
  }

  public record PasswordResetRequest(
      String email,
      String redirectTo,
      String appRedirectTo) {
  }

  public record PasswordResetConfirmRequest(
      String accessToken,
      String password) {
  }

  public record EmailVerificationResponse(
      String email,
      Instant expiresAt) {
  }

  public record ContactRequest(
      String name,
      String email,
      String subject,
      String content) {
  }

  public record ContactResponse(
      boolean success,
      String message) {
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
      String environment,
      /**
       * 開発用の全権限。premium_grants に entitlement_key='dev' を1行入れた利用者だけ true になる。
       * アプリ側には判定材料を一切置かないため、配布物を読まれても真似できない。
       */
      boolean isDev) {
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
