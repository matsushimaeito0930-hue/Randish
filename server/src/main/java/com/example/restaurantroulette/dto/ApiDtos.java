package com.example.restaurantroulette.dto;

import com.example.restaurantroulette.entity.StampType;
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
      String googlePlaceId) {
  }

  public record RestaurantSearchRequest(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range) {
  }

  public record RandomRestaurantRequest(
      String userId,
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range) {
  }

  public record RandomHistoryCreateRequest(
      String userId,
      String restaurantId,
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax) {
  }

  public record RandomHistoryResponse(
      String id,
      String userId,
      RestaurantResponse restaurant,
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Instant createdAt) {
  }

  public record FavoriteCreateRequest(String userId, String restaurantId) {
  }

  public record FavoriteResponse(
      String id,
      String userId,
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

  public record StampResponse(
      String id,
      String userId,
      String restaurantId,
      StampType stampType,
      Instant awardedAt) {
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
