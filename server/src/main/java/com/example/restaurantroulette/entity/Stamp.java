package com.example.restaurantroulette.entity;

import java.time.Instant;

public record Stamp(
    String id,
    String userId,
    String restaurantId,
    StampType stampType,
    Instant awardedAt) {
}
