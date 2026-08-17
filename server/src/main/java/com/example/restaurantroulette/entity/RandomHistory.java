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
    Integer userRating,
    /** 本人が入力した実際の支払額。未入力なら null で、そのときは予算帯から推定する。 */
    Integer actualSpend,
    Instant createdAt) {
}
