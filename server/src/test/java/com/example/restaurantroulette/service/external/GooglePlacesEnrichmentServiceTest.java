package com.example.restaurantroulette.service.external;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class GooglePlacesEnrichmentServiceTest {
  private final GooglePlacesEnrichmentService service = new GooglePlacesEnrichmentService(RestClient.builder());

  @Test
  void ramenGenreRejectsGenericJapaneseAndFastFoodPlaces() {
    assertThat(service.matchesGooglePlaceGenre(
        "グリル 東洋軒",
        "大阪府大阪市天王寺区玉造元町",
        "ラーメン",
        List.of("japanese_restaurant", "restaurant", "food")))
        .isFalse();

    assertThat(service.matchesGooglePlaceGenre(
        "マクドナルドJR玉造駅店",
        "大阪府大阪市天王寺区玉造元町",
        "ラーメン",
        List.of("fast_food_restaurant", "food")))
        .isFalse();
  }

  @Test
  void ramenGenreAcceptsRamenKeywordsAndTypes() {
    assertThat(service.matchesGooglePlaceGenre(
        "麺喰いメン太ジスタ",
        "大阪府大阪市天王寺区玉造本町",
        "ラーメン",
        List.of("restaurant", "food")))
        .isTrue();

    assertThat(service.matchesGooglePlaceGenre(
        "Tamatsukuri Ramen",
        "Osaka",
        "ラーメン",
        List.of("ramen_restaurant", "restaurant", "food")))
        .isTrue();
  }

  @Test
  void existingGenreTypesStillMatchSpecificGoogleTypes() {
    assertThat(service.matchesGooglePlaceGenre(
        "玉造すし",
        "大阪市",
        "寿司",
        List.of("sushi_restaurant", "restaurant", "food")))
        .isTrue();

    assertThat(service.matchesGooglePlaceGenre(
        "玉造珈琲",
        "大阪市",
        "カフェ",
        List.of("cafe", "coffee_shop", "food")))
        .isTrue();

    assertThat(service.matchesGooglePlaceGenre(
        "玉造中華飯店",
        "大阪市",
        "中華",
        List.of("chinese_restaurant", "restaurant", "food")))
        .isTrue();
  }
}
