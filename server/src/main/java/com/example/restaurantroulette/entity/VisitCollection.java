package com.example.restaurantroulette.entity;

import java.time.Instant;
import java.time.LocalDate;

public record VisitCollection(
    String id,
    String userId,
    String restaurantId,
    LocalDate visitDate,
    String photoUrl,
    String memo,
    int rating,
    Instant createdAt) {
}
