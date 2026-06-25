package com.example.restaurantroulette.entity;

import java.time.Instant;

public record RandomHistory(
    String id,
    String userId,
    String restaurantId,
    String provider,
    String providerPlaceId,
    String area,
    String genre,
    Integer budgetMin,
    Integer budgetMax,
    Integer rangeMeters,
    Instant createdAt) {
}
