package com.example.restaurantroulette.entity;

import java.time.Instant;

public record FavoriteRestaurant(
    String id,
    String userId,
    String restaurantId,
    Instant createdAt) {
}
