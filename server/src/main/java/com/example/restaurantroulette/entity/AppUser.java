package com.example.restaurantroulette.entity;

import java.time.Instant;

public record AppUser(
    String id,
    String email,
    String displayName,
    String authProvider,
    Instant createdAt,
    Instant updatedAt) {
}
