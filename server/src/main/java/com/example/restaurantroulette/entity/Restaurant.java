package com.example.restaurantroulette.entity;

public record Restaurant(
    String id,
    String externalProvider,
    String externalId,
    String name,
    String area,
    String genre,
    int budgetMin,
    int budgetMax,
    double rating,
    int minutes,
    String address,
    String photoUrl,
    String note,
    Double latitude,
    Double longitude) {
}
