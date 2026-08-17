package com.example.restaurantroulette.entity;

import java.time.Instant;

/**
 * 出したくない店。
 *
 * <p>店の情報そのものは持たない。目的は候補から外すことだけなので、どの店かを指す
 * 識別子と、一覧に出すための名前で足りる。店の情報まで抱えると、お気に入りと
 * 二重に持つことになり、片方だけ古くなる。
 */
public record ExcludedRestaurant(
    String id,
    String userId,
    String provider,
    String providerPlaceId,
    String restaurantName,
    String reason,
    Instant createdAt) {
}
