package com.example.restaurantroulette.entity;

import java.time.Instant;

public record PendingEmailRegistration(
    String id,
    String email,
    String displayName,
    String passwordHash,
    String passwordSalt,
    String tokenHash,
    Instant expiresAt,
    Instant consumedAt,
    Instant createdAt) {
}
