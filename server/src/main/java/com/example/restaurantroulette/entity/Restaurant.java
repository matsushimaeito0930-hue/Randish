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
    Double longitude,
    RestaurantFacilities facilities) {

  /**
   * 席・設備の情報を持たない提供元（Geoapify、DB保存分など）のための短い形。
   * 既存の呼び出しをそのまま動かすために残している。
   */
  public Restaurant(
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
    this(id, externalProvider, externalId, name, area, genre, budgetMin, budgetMax,
        rating, minutes, address, photoUrl, note, latitude, longitude, null);
  }
}
