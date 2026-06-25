package com.example.restaurantroulette.entity;

import java.time.Instant;

public record FavoriteRestaurant(
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
    Instant createdAt) {
}
