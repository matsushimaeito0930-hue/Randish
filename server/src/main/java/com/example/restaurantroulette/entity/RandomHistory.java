package com.example.restaurantroulette.entity;

import java.time.Instant;

public record RandomHistory(
    String id,
    String userId,
    String restaurantId,
    String area,
    String genre,
    Integer budgetMin,
    Integer budgetMax,
    Instant createdAt) {
}
